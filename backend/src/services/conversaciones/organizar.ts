import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { conflicto, solicitudInvalida } from '../../lib/errors.js';
import { crearLogger } from '../../lib/logger.js';
import { emitir } from '../../lib/sse.js';
import { claveDeMensaje, jidDeTelefono, modificarChat, urlFotoDePerfil } from '../whatsapp/envio.js';
import type { EstadoChat } from '../whatsapp/socket.js';
import * as repo from './repositorio.js';

/**
 * Organizar los chats como en WhatsApp Web: fijar, archivar y destacar
 * mensajes, sincronizado con el telefono en los dos sentidos (lo que se
 * hace aca se ve en el celular y al reves). Y las fotos de perfil.
 */

const log = crearLogger('conversaciones-organizar');
const CANAL_SSE = 'conversaciones';

async function emitirConversacion(id: number) {
  const detalle = await repo.obtenerDetalle(id);
  if (detalle) emitir(CANAL_SSE, 'conversacion:actualizada', detalle);
  return detalle;
}

/** El jid con que el telefono conoce el chat (con los contactos @lid, el @lid). */
const jidDelChat = (chat: repo.DatosChat) => chat.jidChat ?? jidDeTelefono(chat.telefono);

// ==================== Fijar y archivar ====================

export async function fijar(conversacionId: number, fijado: boolean) {
  const chat = await repo.obtenerDatosChat(conversacionId);
  if (fijado && (await repo.contarFijados(chat.numeroId, conversacionId)) >= repo.MAX_FIJADOS) {
    throw conflicto(`Solo puedes fijar ${repo.MAX_FIJADOS} chats, como en WhatsApp. Desfija otro primero.`);
  }
  await modificarChat(chat.numeroId, jidDelChat(chat), { pin: fijado });
  await repo.aplicarEstadoChat(conversacionId, { fijadoEn: fijado ? new Date() : null });
  return emitirConversacion(conversacionId);
}

export async function archivar(conversacionId: number, archivado: boolean) {
  const chat = await repo.obtenerDatosChat(conversacionId);
  // WhatsApp pide hasta que mensaje se archiva (si despues llega otro, el telefono decide si lo desarchiva).
  const ultimo = await repo.ultimoMensajeDeWhatsapp(conversacionId);
  const lastMessages = ultimo
    ? [
        {
          key: claveDeMensaje(chat.telefono, ultimo.whatsappId, ultimo.propio, ultimo.participante),
          messageTimestamp: Math.floor(new Date(ultimo.creadoEn).getTime() / 1000),
        },
      ]
    : [];
  if (lastMessages[0]) lastMessages[0].key.remoteJid = jidDelChat(chat);
  await modificarChat(chat.numeroId, jidDelChat(chat), { archive: archivado, lastMessages });
  await repo.aplicarEstadoChat(conversacionId, { archivado });
  return emitirConversacion(conversacionId);
}

/** Lo que llega del telefono: se aplica y se avisa al panel (el eco de lo hecho aca no cambia nada). */
export async function aplicarDesdeTelefono(
  numeroId: number,
  cambios: ({ telefono: string; jid: string } & EstadoChat)[],
): Promise<void> {
  for (const cambio of cambios) {
    const id = await repo.idDeChat(numeroId, cambio.telefono);
    if (!id) continue;
    if (cambio.jid.endsWith('@lid')) await repo.guardarJidChat(id, cambio.jid);
    if (await repo.aplicarEstadoChat(id, cambio)) await emitirConversacion(id);
  }
}

// ==================== Destacar ====================

export async function destacar(conversacionId: number, mensajeId: number, destacado: boolean) {
  const chat = await repo.obtenerDatosChat(conversacionId);
  const mensaje = await repo.obtenerMensajeParaAccion(conversacionId, mensajeId);
  if (!mensaje.whatsappId || mensaje.whatsappId.startsWith('llamada-')) {
    throw solicitudInvalida('Este mensaje no está en WhatsApp');
  }
  await modificarChat(chat.numeroId, jidDelChat(chat), {
    star: { messages: [{ id: mensaje.whatsappId, fromMe: mensaje.autor !== 'lead' }], star: destacado },
  });
  const cambio = await repo.marcarDestacado(mensaje.whatsappId, destacado);
  if (cambio) emitir(CANAL_SSE, 'mensaje:actualizado', cambio);
  return cambio?.mensaje ?? { ...mensaje, destacado };
}

// ==================== Fotos de perfil ====================

/** Las fotos se vuelven a pedir a WhatsApp una vez al dia (la gente las cambia poco). */
export const FOTO_VIGENCIA_MS = 24 * 60 * 60 * 1000;
/** Si no se pudo preguntar (numero desconectado), se reintenta antes. */
const FOTO_REINTENTO_MS = 10 * 60 * 1000;
const FOTO_MAX_BYTES = 2 * 1024 * 1024;
/** Junto a los adjuntos de los chats: carpeta oculta, solo sale por la ruta autenticada. */
export const CARPETA_FOTOS = path.join(env.rutaSubidas, '.fotos');

// La lista de chats pide muchas fotos a la vez: a WhatsApp se le pregunta de a pocas.
const MAX_EN_PARALELO = 3;
let enCurso = 0;
const enEspera: (() => void)[] = [];
const enProceso = new Map<number, Promise<string | null>>();
/** Fallos recientes (numero desconectado...): no se reintenta en cada pedido. */
const fallidas = new Map<number, number>();

async function turno<T>(tarea: () => Promise<T>): Promise<T> {
  if (enCurso >= MAX_EN_PARALELO) await new Promise<void>((ok) => enEspera.push(ok));
  enCurso++;
  try {
    return await tarea();
  } finally {
    enCurso--;
    enEspera.shift()?.();
  }
}

/**
 * La ruta en disco de la foto del chat, o null si no tiene (o la oculta).
 * Sirve la guardada mientras este vigente; si no, la pide de nuevo. Si
 * WhatsApp no responde, se sigue mostrando la anterior.
 */
export async function rutaFoto(conversacionId: number): Promise<string | null> {
  const guardada = await repo.obtenerFoto(conversacionId);
  const rutaGuardada = guardada.archivo ? path.join(CARPETA_FOTOS, path.basename(guardada.archivo)) : null;
  const vigente = guardada.revisadaEn && Date.now() - new Date(guardada.revisadaEn).getTime() < FOTO_VIGENCIA_MS;
  const fallo = fallidas.get(conversacionId);
  if (vigente || (fallo && Date.now() - fallo < FOTO_REINTENTO_MS)) return rutaGuardada;

  let pedido = enProceso.get(conversacionId);
  if (!pedido) {
    pedido = turno(() => actualizarFoto(conversacionId, guardada.archivo))
      .catch((err: unknown) => {
        fallidas.set(conversacionId, Date.now());
        log.debug({ err, conversacionId }, 'No se pudo actualizar la foto de perfil');
        return rutaGuardada;
      })
      .finally(() => enProceso.delete(conversacionId));
    enProceso.set(conversacionId, pedido);
  }
  return pedido;
}

async function actualizarFoto(conversacionId: number, anterior: string | null): Promise<string | null> {
  const chat = await repo.obtenerDatosChat(conversacionId);
  const url = await urlFotoDePerfil(chat.numeroId, jidDelChat(chat));
  let nombre: string | null = null;
  if (url) {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!resp.ok) throw new Error(`WhatsApp devolvio ${resp.status} al bajar la foto`);
    const datos = Buffer.from(await resp.arrayBuffer());
    if (datos.length > FOTO_MAX_BYTES) throw new Error('Foto de perfil demasiado grande');
    nombre = `foto-${conversacionId}-${crypto.randomUUID()}.jpg`;
    await fs.mkdir(CARPETA_FOTOS, { recursive: true });
    await fs.writeFile(path.join(CARPETA_FOTOS, nombre), datos);
  }
  await repo.guardarFoto(conversacionId, nombre);
  fallidas.delete(conversacionId);
  if (anterior) await fs.rm(path.join(CARPETA_FOTOS, path.basename(anterior)), { force: true }).catch(() => undefined);
  return nombre ? path.join(CARPETA_FOTOS, nombre) : null;
}
