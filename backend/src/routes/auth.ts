import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { manejarAsync } from '../middleware/errorHandler.js';
import { conflicto, noAutenticado } from '../lib/errors.js';
import * as repo from '../services/auth/repositorio.js';
import { construirUrlAutorizacion, obtenerPerfilGoogle } from '../services/auth/google.js';
import { crearLogger } from '../lib/logger.js';

export const rutasAuth = Router();

const log = crearLogger('auth');
const RONDAS_HASH = 12;

// En produccion el panel lo sirve este mismo servidor (APP_URL); en
// desarrollo corre aparte en Vite (puerto 5173, ver README).
const origenPanel = env.esDev ? 'http://localhost:5173' : '';

// Hash valido de una contraseña que nunca va a calzar — se usa para que el
// intento con un correo inexistente (o una cuenta que entra solo con
// Google y no tiene contraseña) tarde lo mismo que uno con contraseña
// incorrecta, y el tiempo de respuesta no delate nada.
const HASH_SEÑUELO = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO0DZ1DqSAP0EDBqYs0Rw6OZmS9y7t8V.';

const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.', codigo: 'DEMASIADOS_INTENTOS' },
});

const limitadorRegistro = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.', codigo: 'DEMASIADOS_INTENTOS' },
});

const esquemaLogin = z.object({
  email: z.string().trim().email('Correo invalido'),
  contrasena: z.string().min(1),
});

rutasAuth.post(
  '/auth/login',
  limitadorLogin,
  manejarAsync(async (req, res) => {
    const { email, contrasena } = esquemaLogin.parse(req.body);

    const encontrado = await repo.buscarPorEmail(email);
    const valido = await bcrypt.compare(contrasena, encontrado?.contrasenaHash ?? HASH_SEÑUELO);

    if (!encontrado || !valido) throw noAutenticado('Correo o contraseña incorrectos');

    req.session.usuarioId = encontrado.id;
    await repo.actualizarUltimoAcceso(encontrado.id);
    res.json({ nombre: encontrado.nombre, apellido: encontrado.apellido, email: encontrado.email });
  }),
);

const esquemaRegistro = z.object({
  nombre: z.string().trim().min(1, 'Requerido'),
  apellido: z.string().trim().min(1, 'Requerido'),
  email: z.string().trim().email('Correo invalido'),
  contrasena: z.string().min(8, 'Debe tener al menos 8 caracteres'),
});

rutasAuth.post(
  '/auth/registro',
  limitadorRegistro,
  manejarAsync(async (req, res) => {
    const datos = esquemaRegistro.parse(req.body);

    const yaExiste = await repo.buscarPorEmail(datos.email);
    if (yaExiste) throw conflicto('Ya existe una cuenta con ese correo');

    const contrasenaHash = await bcrypt.hash(datos.contrasena, RONDAS_HASH);
    const id = await repo.registrarUsuario({
      nombre: datos.nombre,
      apellido: datos.apellido,
      email: datos.email,
      contrasenaHash,
    });

    req.session.usuarioId = id;
    await repo.actualizarUltimoAcceso(id);
    res.status(201).json({ nombre: datos.nombre, apellido: datos.apellido, email: datos.email });
  }),
);

rutasAuth.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

/** El login lo consulta para saber si mostrar el boton "Continuar con Google". */
rutasAuth.get('/auth/config', (_req, res) => {
  res.json({ googleDisponible: env.googleDisponible });
});

rutasAuth.get('/auth/google', (req, res) => {
  if (!env.googleDisponible) throw noAutenticado('El login con Google no esta configurado');

  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  res.redirect(construirUrlAutorizacion(state));
});

rutasAuth.get('/auth/google/callback', async (req, res) => {
  const irALogin = (error: string) => res.redirect(`${origenPanel}/login?error=${error}`);

  if (!env.googleDisponible) return irALogin('google_no_configurado');

  const stateEsperado = req.session.oauthState;
  req.session.oauthState = undefined;
  const { code, state } = req.query;
  if (typeof code !== 'string' || typeof state !== 'string' || !stateEsperado || state !== stateEsperado) {
    return irALogin('google_estado_invalido');
  }

  try {
    const perfil = await obtenerPerfilGoogle(code);

    // 1) ¿Ya entro antes con esta misma cuenta de Google? 2) ¿Ya tiene
    // cuenta en el panel con este correo (usuario/contraseña) y ahora
    // tambien quiere entrar con Google? Se vincula. 3) Si no hay nada,
    // como el registro es abierto, se crea la cuenta ahi mismo.
    let usuario = await repo.buscarPorGoogleId(perfil.googleId);
    if (!usuario) {
      const porEmail = await repo.buscarPorEmail(perfil.email);
      if (porEmail) {
        await repo.vincularGoogle(porEmail.id, perfil.googleId);
        usuario = porEmail;
      } else {
        const id = await repo.registrarUsuarioGoogle({
          nombre: perfil.nombre,
          apellido: perfil.apellido,
          email: perfil.email,
          googleId: perfil.googleId,
        });
        usuario = { id, nombre: perfil.nombre, apellido: perfil.apellido, email: perfil.email, contrasenaHash: null };
      }
    }

    req.session.usuarioId = usuario.id;
    await repo.actualizarUltimoAcceso(usuario.id);
    res.redirect(`${origenPanel}/`);
  } catch (err) {
    log.warn({ err }, 'Fallo el login con Google');
    irALogin('google_fallo');
  }
});

rutasAuth.get(
  '/auth/sesion',
  manejarAsync(async (req, res) => {
    if (!req.session.usuarioId) throw noAutenticado();
    const usuario = await repo.obtenerPorId(req.session.usuarioId);
    if (!usuario) throw noAutenticado();
    res.json(usuario);
  }),
);
