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
    // Responder manualmente (desde el chat integrado) pasa la conversacion
    // a modo manual (seccion 3.6/3.10): que no se cruce con el bot.
    await repo.cambiarModo(id, 'manual');
    const actualizada = await emitirActualizacion(id);
    if (mensaje) emitir(CANAL_SSE, 'mensaje:nuevo', { conversacionId: id, mensaje });

    res.status(201).json({ mensaje, conversacion: actualizada });
  }),
);

const esquemaModo = z.object({ modo: z.enum(['bot', 'manual']) });

rutasConversaciones.post(
  '/conversaciones/:id/modo',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    await obtenerConversacionOFallar(id);
    const { modo } = esquemaModo.parse(req.body);
    await repo.cambiarModo(id, modo);
    res.json(await emitirActualizacion(id));
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

// Las 3 primeras son "Confirmar"/"Corregir" una sugerencia de la IA
// (seccion 3.9); las ultimas 2 son exclusivamente manuales y nunca se
// llaman desde ningun flujo automatico del sistema.
const esquemaEtapa = z.object({
  etapa: z.enum(['interesado', 'no_interesado', 'duda_precio', 'venta_concretada', 'descartado']),
});

rutasConversaciones.patch(
  '/conversaciones/:id/etapa',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const conversacion = await obtenerConversacionOFallar(id);
    if (!conversacion.leadId) throw solicitudInvalida('Esta conversacion no esta ligada a un lead');

    const { etapa } = esquemaEtapa.parse(req.body);
    await leadsRepo.actualizarEtapaManual(conversacion.leadId, etapa);
    // Ya se decidio (confirmada o corregida): la sugerencia pendiente desaparece.
    await repo.limpiarSugerenciaIA(id);
    res.json(await emitirActualizacion(id));
  }),
);
