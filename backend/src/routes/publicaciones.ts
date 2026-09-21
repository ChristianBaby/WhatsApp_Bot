import { Router } from 'express';
import { z } from 'zod';
import { manejarAsync } from '../middleware/errorHandler.js';
import { noEncontrado, solicitudInvalida } from '../lib/errors.js';
import { normalizarTelefono } from '../lib/telefono.js';
import * as repo from '../services/publicaciones/repositorio.js';
import * as motor from '../services/publicaciones/motor.js';
import { construirMensajePrueba, simularDryRun } from '../services/publicaciones/previsualizacion.js';
import * as leadsRepo from '../services/leads/repositorio.js';
import * as numerosGestor from '../services/whatsapp/gestor.js';
import { enviarMensaje, verificarEnWhatsapp } from '../services/whatsapp/envio.js';

export const rutasPublicaciones = Router();

function idDesdeParametro(valor: string | undefined): number {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw solicitudInvalida('Id invalido');
  return id;
}

async function validarListaYNumeros(listaId: number, numeroIds: number[]): Promise<void> {
  const lista = await leadsRepo.obtener(listaId);
  if (!lista) throw solicitudInvalida('La lista de leads elegida no existe');

  const numeros = await numerosGestor.listar();
  const idsValidos = new Set(numeros.map((n) => n.id));
  const faltante = numeroIds.find((id) => !idsValidos.has(id));
  if (faltante) throw solicitudInvalida(`El numero elegido (id ${faltante}) no existe`);
}

// --- Esquemas ---

const camposComunes = {
  nombre: z.string().trim().min(1, 'El nombre no puede estar vacio').max(150),
  listaId: z.number().int().positive(),
  variantesMensaje: z
    .array(z.string().trim().min(1))
    .min(1, 'Escribe al menos una variante del mensaje')
    .max(5, 'Maximo 5 variantes'),
  adjuntoRuta: z.string().nullable().default(null),
  adjuntoTipo: z.enum(['imagen', 'video']).nullable().default(null),
  adjuntoNombreOriginal: z.string().nullable().default(null),
  catalogoUrl: z.string().trim().nullable().default(null),
  numeroIds: z.array(z.number().int().positive()).min(1, 'Elige al menos un numero para enviar'),
  programadaPara: z.coerce.date(),
  pausaMinSegundos: z.number().int().positive().nullable().default(null),
  pausaMaxSegundos: z.number().int().positive().nullable().default(null),
  tamanoLote: z.number().int().positive().nullable().default(null),
  pausaEntreLotesMinutos: z.number().int().min(0).nullable().default(null),
  horarioInicio: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .default(null),
  horarioFin: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .default(null),
  maxMensajes: z.number().int().positive().nullable().default(null),
};

const esquemaCreacion = z.object({
  ...camposComunes,
  accion: z.enum(['borrador', 'programar']),
});

const esquemaEdicion = z.object(camposComunes).partial();

// --- Rutas ---

rutasPublicaciones.get(
  '/publicaciones',
  manejarAsync(async (_req, res) => {
    res.json(await repo.listarConProgreso());
  }),
);

rutasPublicaciones.get(
  '/publicaciones/:id',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const publicacion = await repo.obtenerConProgreso(id);
    if (!publicacion) throw noEncontrado('Publicacion no encontrada');
    res.json(publicacion);
  }),
);

rutasPublicaciones.post(
  '/publicaciones',
  manejarAsync(async (req, res) => {
    const datos = esquemaCreacion.parse(req.body);
    await validarListaYNumeros(datos.listaId, datos.numeroIds);

    const creada = await repo.crear({
      ...datos,
      programadaPara: datos.programadaPara.toISOString(),
      estado: datos.accion === 'borrador' ? 'borrador' : 'programada',
    });
    res.status(201).json(creada);
  }),
);

rutasPublicaciones.patch(
  '/publicaciones/:id',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const actual = await repo.obtener(id);
    if (!actual) throw noEncontrado('Publicacion no encontrada');
    if (actual.estado !== 'borrador' && actual.estado !== 'programada') {
      throw solicitudInvalida('Solo se puede editar una publicacion que todavia no se disparo');
    }

    const cambios = esquemaEdicion.parse(req.body);
    if (cambios.listaId || cambios.numeroIds) {
      await validarListaYNumeros(cambios.listaId ?? actual.listaId, cambios.numeroIds ?? actual.numeroIds);
    }

    const actualizada = await repo.actualizar(id, {
      ...cambios,
      programadaPara: cambios.programadaPara?.toISOString(),
    });
    res.json(actualizada);
  }),
);

rutasPublicaciones.post(
  '/publicaciones/:id/cancelar',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    res.json(await motor.cancelarPublicacion(id));
  }),
);

rutasPublicaciones.post(
  '/publicaciones/:id/reanudar',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    res.json(await motor.reanudarPublicacion(id));
  }),
);

// --- Modo de prueba (seccion 3.5) ---

const esquemaDryRun = z.object({
  listaId: z.number().int().positive(),
  variantesMensaje: z.array(z.string().trim().min(1)).min(1),
  catalogoUrl: z.string().trim().nullable().default(null),
  numeroIds: z.array(z.number().int().positive()).min(1),
  pausaMinSegundos: z.number().int().positive().nullable().default(null),
  pausaMaxSegundos: z.number().int().positive().nullable().default(null),
  tamanoLote: z.number().int().positive().nullable().default(null),
  pausaEntreLotesMinutos: z.number().int().min(0).nullable().default(null),
});

rutasPublicaciones.post(
  '/publicaciones/dry-run',
  manejarAsync(async (req, res) => {
    const datos = esquemaDryRun.parse(req.body);
    res.json(await simularDryRun(datos));
  }),
);

const esquemaEnviarPrueba = z.object({
  listaId: z.number().int().positive().nullable().default(null),
  variantesMensaje: z.array(z.string().trim().min(1)).min(1),
  catalogoUrl: z.string().trim().nullable().default(null),
  numeroId: z.number().int().positive(),
  telefonoPrueba: z.string().trim().min(6, 'Ingresa un telefono valido'),
});

rutasPublicaciones.post(
  '/publicaciones/enviar-prueba',
  manejarAsync(async (req, res) => {
    const datos = esquemaEnviarPrueba.parse(req.body);
    const telefono = normalizarTelefono(datos.telefonoPrueba);
    if (telefono.length < 8) throw solicitudInvalida('El telefono de prueba no es valido');

    const tieneWhatsapp = await verificarEnWhatsapp(datos.numeroId, telefono);
    if (!tieneWhatsapp) {
      throw solicitudInvalida('Ese numero no tiene WhatsApp o no se pudo verificar');
    }

    const mensaje = await construirMensajePrueba(datos);
    await enviarMensaje(datos.numeroId, telefono, mensaje);

    res.json({ enviado: true, mensaje });
  }),
);
