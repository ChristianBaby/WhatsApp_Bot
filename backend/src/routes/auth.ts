import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { manejarAsync } from '../middleware/errorHandler.js';
import { noAutenticado } from '../lib/errors.js';
import * as repo from '../services/auth/repositorio.js';

export const rutasAuth = Router();

// Hash valido de una contraseña que nunca va a calzar — se usa para que el
// intento con un usuario inexistente tarde lo mismo que uno con contraseña
// incorrecta, y el tiempo de respuesta no delate si el usuario existe.
const HASH_SEÑUELO = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO0DZ1DqSAP0EDBqYs0Rw6OZmS9y7t8V.';

const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.', codigo: 'DEMASIADOS_INTENTOS' },
});

const esquemaLogin = z.object({
  usuario: z.string().trim().min(1),
  contrasena: z.string().min(1),
});

rutasAuth.post(
  '/auth/login',
  limitadorLogin,
  manejarAsync(async (req, res) => {
    const { usuario, contrasena } = esquemaLogin.parse(req.body);

    const encontrado = await repo.buscarPorUsuario(usuario);
    const valido = await bcrypt.compare(contrasena, encontrado?.contrasenaHash ?? HASH_SEÑUELO);

    if (!encontrado || !valido) throw noAutenticado('Usuario o contraseña incorrectos');

    req.session.usuarioId = encontrado.id;
    await repo.actualizarUltimoAcceso(encontrado.id);
    res.json({ usuario: encontrado.usuario });
  }),
);

rutasAuth.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.status(204).end());
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
