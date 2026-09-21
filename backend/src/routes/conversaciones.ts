import { Router } from 'express';
import { z } from 'zod';
import { manejarAsync } from '../middleware/errorHandler.js';
import { noEncontrado, solicitudInvalida } from '../lib/errors.js';
import { emitir } from '../lib/sse.js';
import * as repo from '../services/conversaciones/repositorio.js';
import * as leadsRepo from '../services/leads/repositorio.js';
import { enviarMensaje } from '../services/whatsapp/envio.js';

export const rutasConversaciones = Router();

const CANAL_SSE = 'conversaciones';

function idDesdeParametro(valor: string | undefined): number {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw solicitudInvalida('Id invalido');
  return id;
}

async function obtenerConversacionOFallar(id: number) {
  const conversacion = await repo.obtenerDetalle(id);
  if (!conversacion) throw noEncontrado('Conversacion no encontrada');
  return conversacion;
}

/** Reemite el detalle actualizado por SSE — todas las mutaciones de esta ruta terminan aqui. */
async function emitirActualizacion(id: number) {
  const actualizada = await repo.obtenerDetalle(id);
  if (actualizada) emitir(CANAL_SSE, 'conversacion:actualizada', actualizada);
  return actualizada;
}

rutasConversaciones.get(
  '/conversaciones',
  manejarAsync(async (_req, res) => {
    res.json(await repo.listarConLead());
  }),
);

rutasConversaciones.get(
  '/conversaciones/:id',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const conversacion = await obtenerConversacionOFallar(id);
    const mensajes = await repo.obtenerMensajes(id);
    res.json({ ...conversacion, mensajes });
  }),
);

rutasConversaciones.post(
  '/conversaciones/:id/marcar-leida',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const actualizada = await repo.marcarLeida(id);
    emitir(CANAL_SSE, 'conversacion:actualizada', actualizada);
    res.json(actualizada);
  }),
);

const esquemaMensaje = z.object({ texto: z.string().trim().min(1).max(4000) });

rutasConversaciones.post(
  '/conversaciones/:id/mensajes',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const { texto } = esquemaMensaje.parse(req.body);
    const conversacion = await obtenerConversacionOFallar(id);

    // Reusa el mismo camino de envio que las publicaciones (Fase 3): la
    // misma simulacion de "escribiendo..." aplica tambien aqui.
    const whatsappId = await enviarMensaje(conversacion.numeroId, conversacion.telefono, texto);

    const mensaje = await repo.agregarMensaje(id, 'yo', texto, whatsappId);
    await repo.marcarLeida(id);
    const actualizada = await emitirActualizacion(id);
    if (mensaje) emitir(CANAL_SSE, 'mensaje:nuevo', { conversacionId: id, mensaje });

    res.status(201).json({ mensaje, conversacion: actualizada });
  }),
);

const esquemaNotas = z.object({ notas: z.string().max(4000) });

rutasConversaciones.patch(
  '/conversaciones/:id/notas',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const conversacion = await obtenerConversacionOFallar(id);
    if (!conversacion.leadId) throw solicitudInvalida('Esta conversacion no esta ligada a un lead');

    const { notas } = esquemaNotas.parse(req.body);
    await leadsRepo.actualizarNotas(conversacion.leadId, notas);
    res.json(await emitirActualizacion(id));
  }),
);

// Venta concretada / Descartado: exclusivamente manual (seccion 3.9). Nunca
// se llama desde ningun otro flujo del sistema.
const esquemaEtapaManual = z.object({ etapa: z.enum(['venta_concretada', 'descartado']) });

rutasConversaciones.patch(
  '/conversaciones/:id/etapa',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const conversacion = await obtenerConversacionOFallar(id);
    if (!conversacion.leadId) throw solicitudInvalida('Esta conversacion no esta ligada a un lead');

    const { etapa } = esquemaEtapaManual.parse(req.body);
    await leadsRepo.actualizarEtapaManual(conversacion.leadId, etapa);
    res.json(await emitirActualizacion(id));
  }),
);
