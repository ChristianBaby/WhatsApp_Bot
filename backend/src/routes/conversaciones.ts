import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { manejarAsync } from '../middleware/errorHandler.js';
import { noEncontrado, solicitudInvalida } from '../lib/errors.js';
import { emitir } from '../lib/sse.js';
import * as repo from '../services/conversaciones/repositorio.js';
import { CARPETA_MEDIA_CHAT, obtenerArchivoMedia, tipoDeEnvio } from '../services/conversaciones/media.js';
import type { TipoMensaje } from '../services/conversaciones/tipos.js';
import * as leadsRepo from '../services/leads/repositorio.js';
import { enviarArchivo, enviarMensaje } from '../services/whatsapp/envio.js';

export const rutasConversaciones = Router();

const CANAL_SSE = 'conversaciones';
const CHATS_POR_PAGINA = 30;
const MENSAJES_POR_PAGINA = 40;

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

const esquemaLista = z.object({
  filtro: z.enum(['todos', 'no_leidos', 'leads', 'asesor']).default('todos'),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(200).optional(),
});

/** Lista de chats, mas recientes primero, de a una pagina (ver repo.listar). */
rutasConversaciones.get(
  '/conversaciones',
  manejarAsync(async (req, res) => {
    const { filtro, q, cursor } = esquemaLista.parse(req.query);
    res.json(await repo.listar({ filtro, busqueda: q, cursor, limite: CHATS_POR_PAGINA }));
  }),
);

/** El chat con su ultima pagina de mensajes; los anteriores se piden aparte al subir. */
rutasConversaciones.get(
  '/conversaciones/:id',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const conversacion = await obtenerConversacionOFallar(id);
    const { mensajes, hayMas } = await repo.obtenerMensajesPagina(id, null, MENSAJES_POR_PAGINA);
    res.json({ ...conversacion, mensajes, hayMasMensajes: hayMas });
  }),
);

const esquemaPaginaMensajes = z.object({ antesDe: z.coerce.number().int().positive() });

rutasConversaciones.get(
  '/conversaciones/:id/mensajes',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const { antesDe } = esquemaPaginaMensajes.parse(req.query);
    res.json(await repo.obtenerMensajesPagina(id, antesDe, MENSAJES_POR_PAGINA));
  }),
);

/**
 * El archivo de un mensaje (foto, video, audio, documento). Se baja de
 * WhatsApp recien la primera vez que alguien lo abre (ver media.ts).
 */
rutasConversaciones.get(
  '/conversaciones/:id/mensajes/:mensajeId/media',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const mensajeId = idDesdeParametro(req.params.mensajeId);
    const conversacion = await obtenerConversacionOFallar(id);
    const archivo = await obtenerArchivoMedia(id, conversacion.numeroId, mensajeId);

    const ascii = archivo.nombre.replace(/[^\x20-\x7e]|"/g, '_');
    res.setHeader('Content-Type', archivo.mime);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(archivo.nombre)}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(archivo.rutaAbsoluta, { dotfiles: 'allow' });
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

    const mensaje = await repo.agregarMensaje(id, 'yo', texto, whatsappId, { estadoEntrega: 'enviado' });
    await repo.marcarLeida(id);
    // Responder manualmente (desde el chat integrado) pasa la conversacion
    // a modo manual (seccion 3.6/3.10): que no se cruce con el bot.
    await repo.cambiarModo(id, 'manual');
    const actualizada = await emitirActualizacion(id);
    if (mensaje) emitir(CANAL_SSE, 'mensaje:nuevo', { conversacionId: id, mensaje });

    res.status(201).json({ mensaje, conversacion: actualizada });
  }),
);

/** 16 MB: el limite de WhatsApp para fotos, videos y audios (los documentos admiten mas, pero no hace falta). */
const subidaChat = multer({
  storage: multer.diskStorage({
    destination: (_req, _archivo, cb) => {
      fs.mkdir(CARPETA_MEDIA_CHAT, { recursive: true }, (err) => cb(err, CARPETA_MEDIA_CHAT));
    },
    filename: (_req, archivo, cb) => {
      const extension = path.extname(archivo.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, `envio-${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 16 * 1024 * 1024 },
});

const TEXTO_POR_TIPO: Record<string, (leyenda: string | null, nombre: string) => string> = {
  imagen: (l) => (l ? `📷 ${l}` : '📷 Imagen'),
  video: (l) => (l ? `🎥 ${l}` : '🎥 Video'),
  audio: () => '🎵 Audio',
  documento: (l, nombre) => `📄 ${nombre}${l ? ` — ${l}` : ''}`,
};

const esquemaAdjunto = z.object({ texto: z.string().trim().max(1000).optional() });

/** Enviar una foto, video, audio o documento desde el chat del panel. */
rutasConversaciones.post(
  '/conversaciones/:id/adjuntos',
  subidaChat.single('archivo'),
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    if (!req.file) throw solicitudInvalida('Falta el archivo');
    const archivo = req.file;

    try {
      const conversacion = await obtenerConversacionOFallar(id);
      const leyenda = esquemaAdjunto.parse(req.body).texto || null;
      const mime = archivo.mimetype || 'application/octet-stream';
      const tipoEnvio = tipoDeEnvio(mime);
      // El nombre original llega en latin1 desde multer: se corrige a UTF-8 (tildes, ñ).
      const nombre = Buffer.from(archivo.originalname, 'latin1').toString('utf8');

      const whatsappId = await enviarArchivo(
        conversacion.numeroId,
        conversacion.telefono,
        { rutaAbsoluta: archivo.path, tipo: tipoEnvio, mime, nombre },
        tipoEnvio === 'audio' ? null : leyenda,
      );

      const tipo: TipoMensaje = tipoEnvio;
      const mensaje = await repo.agregarMensaje(id, 'yo', TEXTO_POR_TIPO[tipoEnvio]!(leyenda, nombre), whatsappId, {
        tipo,
        media: { mime, nombre, segundos: null, tamano: archivo.size, leyenda },
        mediaArchivo: archivo.filename,
        estadoEntrega: 'enviado',
      });
      // El eco de WhatsApp pudo guardarlo primero: igual queda ligado al archivo local.
      if (!mensaje && whatsappId) await repo.asociarArchivoLocal(whatsappId, archivo.filename);

      await repo.marcarLeida(id);
      await repo.cambiarModo(id, 'manual');
      const actualizada = await emitirActualizacion(id);
      if (mensaje) emitir(CANAL_SSE, 'mensaje:nuevo', { conversacionId: id, mensaje });
      res.status(201).json({ mensaje, conversacion: actualizada });
    } catch (err) {
      // No se envio: el archivo subido no debe quedar ocupando disco.
      await fs.promises.rm(archivo.path, { force: true }).catch(() => undefined);
      throw err;
    }
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
