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
import { marcarLeidaYConfirmar } from '../services/conversaciones/lectura.js';
import * as panel from '../services/conversaciones/envioPanel.js';
import { CARPETA_MEDIA_CHAT, obtenerArchivoMedia } from '../services/conversaciones/media.js';
import { suscribir as suscribirPresenciaChat } from '../services/conversaciones/presencia.js';
import * as leadsRepo from '../services/leads/repositorio.js';
import { avisarEscribiendo } from '../services/whatsapp/envio.js';

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
    const actualizada = await marcarLeidaYConfirmar(id);
    emitir(CANAL_SSE, 'conversacion:actualizada', actualizada);
    res.json(actualizada);
  }),
);

const esquemaMensaje = z.object({
  texto: z.string().trim().min(1).max(4000),
  /** Responder citando este mensaje (id del panel). */
  citaId: z.coerce.number().int().positive().optional(),
});

rutasConversaciones.post(
  '/conversaciones/:id/mensajes',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const { texto, citaId } = esquemaMensaje.parse(req.body);
    await obtenerConversacionOFallar(id);
    res.status(201).json(await panel.enviarTexto(id, texto, citaId));
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

function archivoSubido(archivo: Express.Multer.File): panel.ArchivoSubido {
  return {
    ruta: archivo.path,
    nombreGuardado: archivo.filename,
    // El nombre original llega en latin1 desde multer: se corrige a UTF-8 (tildes, ñ).
    nombreOriginal: Buffer.from(archivo.originalname, 'latin1').toString('utf8'),
    mime: archivo.mimetype || 'application/octet-stream',
    tamano: archivo.size,
  };
}

/** Si el envio falla, el archivo subido no debe quedar ocupando disco. */
async function conArchivo<T>(archivo: Express.Multer.File, accion: () => Promise<T>): Promise<T> {
  try {
    return await accion();
  } catch (err) {
    await fs.promises.rm(archivo.path, { force: true }).catch(() => undefined);
    throw err;
  }
}

const esquemaAdjunto = z.object({
  texto: z.string().trim().max(1000).optional(),
  citaId: z.coerce.number().int().positive().optional(),
});

/** Enviar una foto, video, audio o documento desde el chat del panel (elegido, pegado o arrastrado). */
rutasConversaciones.post(
  '/conversaciones/:id/adjuntos',
  subidaChat.single('archivo'),
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    if (!req.file) throw solicitudInvalida('Falta el archivo');
    const archivo = req.file;
    const resultado = await conArchivo(archivo, async () => {
      await obtenerConversacionOFallar(id);
      const { texto, citaId } = esquemaAdjunto.parse(req.body);
      return panel.enviarAdjunto(id, archivoSubido(archivo), texto || null, citaId);
    });
    res.status(201).json(resultado);
  }),
);

/** Hasta 15 minutos, como en WhatsApp. */
const esquemaNotaVoz = z.object({
  segundos: z.coerce.number().min(1).max(15 * 60),
  citaId: z.coerce.number().int().positive().optional(),
});

/** Nota de voz grabada en el panel (el navegador manda WebM u Ogg; se convierte a lo que usa WhatsApp). */
rutasConversaciones.post(
  '/conversaciones/:id/nota-voz',
  subidaChat.single('audio'),
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    if (!req.file) throw solicitudInvalida('Falta la grabación');
    const archivo = req.file;
    const resultado = await conArchivo(archivo, async () => {
      await obtenerConversacionOFallar(id);
      const { segundos, citaId } = esquemaNotaVoz.parse(req.body);
      return panel.enviarNotaVoz(id, archivoSubido(archivo), Math.round(segundos), citaId);
    });
    res.status(201).json(resultado);
  }),
);

const esquemaReaccion = z.object({ emoji: z.string().min(1).max(32).nullable() });

rutasConversaciones.post(
  '/conversaciones/:id/mensajes/:mensajeId/reaccion',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const mensajeId = idDesdeParametro(req.params.mensajeId);
    const { emoji } = esquemaReaccion.parse(req.body);
    res.json(await panel.reaccionar(id, mensajeId, emoji));
  }),
);

const esquemaEdicion = z.object({ texto: z.string().trim().min(1).max(4000) });

rutasConversaciones.patch(
  '/conversaciones/:id/mensajes/:mensajeId',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const mensajeId = idDesdeParametro(req.params.mensajeId);
    const { texto } = esquemaEdicion.parse(req.body);
    res.json(await panel.editar(id, mensajeId, texto));
  }),
);

/** "Eliminar para todos". */
rutasConversaciones.delete(
  '/conversaciones/:id/mensajes/:mensajeId',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const mensajeId = idDesdeParametro(req.params.mensajeId);
    res.json(await panel.eliminarParaTodos(id, mensajeId));
  }),
);

const esquemaReenvio = z.object({
  destinos: z.array(z.number().int().positive()).min(1).max(panel.REENVIAR_MAX_CHATS),
});

rutasConversaciones.post(
  '/conversaciones/:id/mensajes/:mensajeId/reenviar',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const mensajeId = idDesdeParametro(req.params.mensajeId);
    const { destinos } = esquemaReenvio.parse(req.body);
    res.json({ resultados: await panel.reenviar(id, mensajeId, destinos) });
  }),
);

const esquemaEscribiendo = z.object({ estado: z.enum(['composing', 'recording', 'paused']) });

/** Lo que ve el contacto mientras se usa el chat: "escribiendo..." o "grabando audio...". */
rutasConversaciones.post(
  '/conversaciones/:id/escribiendo',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const { estado } = esquemaEscribiendo.parse(req.body);
    const chat = await repo.obtenerDatosChat(id);
    // No es critico: si el numero no esta conectado o falla, no se avisa y listo.
    const enviado = await avisarEscribiendo(chat.numeroId, chat.telefono, estado).catch(() => false);
    res.json({ enviado });
  }),
);

/** Al abrir un chat: avisar al panel cuando el contacto este escribiendo o en linea. */
rutasConversaciones.post(
  '/conversaciones/:id/presencia',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    await suscribirPresenciaChat(id);
    res.json({ ok: true });
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
