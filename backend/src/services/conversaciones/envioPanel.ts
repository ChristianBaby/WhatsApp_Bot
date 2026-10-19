import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BufferJSON, type proto, type WAMessage } from 'baileys';
import { conflicto, solicitudInvalida } from '../../lib/errors.js';
import { emitir } from '../../lib/sse.js';
import {
  claveDeMensaje,
  enviarArchivo,
  enviarEdicion,
  enviarEliminacion,
  enviarReaccion,
  enviarTextoPanel,
  jidDeTelefono,
  type ArchivoEnvio,
} from '../whatsapp/envio.js';
import { marcarLeidaYConfirmar } from './lectura.js';
import { CARPETA_MEDIA_CHAT, obtenerArchivoMedia, tipoDeEnvio } from './media.js';
import { convertirANotaDeVoz } from './notaVoz.js';
import * as repo from './repositorio.js';
import type { ExtraMensaje, MediaInfo, MensajeConversacion, TipoMensaje } from './tipos.js';

/**
 * Todo lo que se hace desde el chat del panel como en WhatsApp: escribir
 * (citando un mensaje), mandar archivos y notas de voz, reaccionar, editar,
 * eliminar para todos y reenviar. Cada accion va primero a WhatsApp y recien
 * si WhatsApp la acepta se guarda y se avisa al panel.
 */

const CANAL_SSE = 'conversaciones';

/** WhatsApp deja editar un mensaje durante 15 minutos. */
export const EDITAR_MAX_MS = 15 * 60 * 1000;
/** Y eliminarlo para todos durante unos 2 dias. */
export const ELIMINAR_MAX_MS = 48 * 60 * 60 * 1000;
/** Como en WhatsApp: se reenvia a un maximo de 5 chats a la vez. */
export const REENVIAR_MAX_CHATS = 5;

const TIPOS_REENVIABLES: TipoMensaje[] = ['texto', 'imagen', 'video', 'audio', 'nota_voz', 'documento', 'sticker'];

const TEXTO_POR_TIPO: Record<string, (leyenda: string | null, nombre: string) => string> = {
  imagen: (l) => (l ? `📷 ${l}` : '📷 Imagen'),
  video: (l) => (l ? `🎥 ${l}` : '🎥 Video'),
  audio: () => '🎵 Audio',
  nota_voz: () => '🎤 Nota de voz',
  sticker: () => '💟 Sticker',
  documento: (l, nombre) => `📄 ${nombre}${l ? ` — ${l}` : ''}`,
};

async function emitirConversacion(id: number) {
  const detalle = await repo.obtenerDetalle(id);
  if (detalle) emitir(CANAL_SSE, 'conversacion:actualizada', detalle);
  return detalle;
}

/** Despues de que una persona escribe en el chat: queda leido y el bot se pausa ahi (seccion 3.6/3.10). */
async function trasEnvioManual(conversacionId: number, mensaje: MensajeConversacion | null) {
  await marcarLeidaYConfirmar(conversacionId);
  await repo.cambiarModo(conversacionId, 'manual');
  const conversacion = await emitirConversacion(conversacionId);
  if (mensaje) emitir(CANAL_SSE, 'mensaje:nuevo', { conversacionId, mensaje });
  return { mensaje, conversacion };
}

function emitirCambio(cambio: repo.MensajeCambiado | null) {
  if (cambio) emitir(CANAL_SSE, 'mensaje:actualizado', cambio);
  return cambio?.mensaje ?? null;
}

// ==================== Citas ====================

type Cita = { citado: WAMessage; extra: NonNullable<ExtraMensaje['cita']> };

/**
 * El mensaje citado tal como WhatsApp lo espera. Si es un archivo que llego
 * por WhatsApp se cita el original (en el telefono se ve su miniatura); si
 * no, basta su texto.
 */
async function prepararCita(chat: repo.DatosChat, citaId: number | null | undefined): Promise<Cita | null> {
  if (!citaId) return null;
  const original = await repo.obtenerMensajeParaAccion(chat.id, citaId);
  if (!original.whatsappId || original.whatsappId.startsWith('llamada-')) {
    throw solicitudInvalida('Ese mensaje no se puede citar');
  }
  const propio = original.autor !== 'lead';
  let contenido: proto.IMessage = { conversation: original.texto };
  if (original.mediaDescarga) {
    const guardado = JSON.parse(original.mediaDescarga, BufferJSON.reviver) as WAMessage;
    if (guardado.message) contenido = guardado.message;
  }
  return {
    citado: { key: claveDeMensaje(chat.telefono, original.whatsappId, propio), message: contenido },
    extra: { whatsappId: original.whatsappId, autor: propio ? 'yo' : 'lead', texto: original.texto },
  };
}

// ==================== Escribir ====================

export async function enviarTexto(conversacionId: number, texto: string, citaId?: number | null) {
  const chat = await repo.obtenerDatosChat(conversacionId);
  const cita = await prepararCita(chat, citaId);
  const whatsappId = await enviarTextoPanel(chat.numeroId, chat.telefono, texto, { citado: cita?.citado });
  const mensaje = await repo.agregarMensaje(conversacionId, 'yo', texto, whatsappId, {
    estadoEntrega: 'enviado',
    extra: cita ? { cita: cita.extra } : null,
  });
  return trasEnvioManual(conversacionId, mensaje);
}

export type ArchivoSubido = { ruta: string; nombreGuardado: string; nombreOriginal: string; mime: string; tamano: number };

/** Foto, video, audio o documento elegido, pegado o arrastrado al chat. */
export async function enviarAdjunto(
  conversacionId: number,
  archivo: ArchivoSubido,
  leyenda: string | null,
  citaId?: number | null,
) {
  const chat = await repo.obtenerDatosChat(conversacionId);
  const cita = await prepararCita(chat, citaId);
  const tipo = tipoDeEnvio(archivo.mime);
  const textoArchivo = tipo === 'audio' ? null : leyenda;

  const whatsappId = await enviarArchivo(
    chat.numeroId,
    chat.telefono,
    { rutaAbsoluta: archivo.ruta, tipo, mime: archivo.mime, nombre: archivo.nombreOriginal },
    textoArchivo,
    { citado: cita?.citado },
  );
  return guardarArchivoEnviado(conversacionId, whatsappId, {
    tipo,
    texto: TEXTO_POR_TIPO[tipo]!(textoArchivo, archivo.nombreOriginal),
    media: { mime: archivo.mime, nombre: archivo.nombreOriginal, segundos: null, tamano: archivo.tamano, leyenda: textoArchivo },
    nombreGuardado: archivo.nombreGuardado,
    extra: cita ? { cita: cita.extra } : null,
  });
}

/** Nota de voz grabada en el panel: se convierte a Ogg/Opus y se manda como grabada en el momento. */
export async function enviarNotaVoz(conversacionId: number, archivo: ArchivoSubido, segundos: number, citaId?: number | null) {
  const chat = await repo.obtenerDatosChat(conversacionId);
  const cita = await prepararCita(chat, citaId);
  const rutaOgg = await convertirANotaDeVoz(archivo.ruta);
  try {
    const tamano = (await fs.stat(rutaOgg)).size;
    const nombre = 'nota-de-voz.ogg';
    const whatsappId = await enviarArchivo(
      chat.numeroId,
      chat.telefono,
      { rutaAbsoluta: rutaOgg, tipo: 'nota_voz', mime: 'audio/ogg', nombre, segundos },
      null,
      { citado: cita?.citado },
    );
    return await guardarArchivoEnviado(conversacionId, whatsappId, {
      tipo: 'nota_voz',
      texto: TEXTO_POR_TIPO.nota_voz!(null, nombre),
      media: { mime: 'audio/ogg; codecs=opus', nombre, segundos, tamano, leyenda: null },
      nombreGuardado: path.basename(rutaOgg),
      extra: cita ? { cita: cita.extra } : null,
    });
  } catch (err) {
    await fs.rm(rutaOgg, { force: true }).catch(() => undefined);
    throw err;
  }
}

async function guardarArchivoEnviado(
  conversacionId: number,
  whatsappId: string | null,
  datos: { tipo: TipoMensaje; texto: string; media: MediaInfo; nombreGuardado: string; extra: ExtraMensaje | null },
) {
  const mensaje = await repo.agregarMensaje(conversacionId, 'yo', datos.texto, whatsappId, {
    tipo: datos.tipo,
    media: datos.media,
    mediaArchivo: datos.nombreGuardado,
    estadoEntrega: 'enviado',
    extra: datos.extra,
  });
  // El eco de WhatsApp pudo guardarlo primero: igual queda ligado al archivo local.
  if (!mensaje && whatsappId) await repo.asociarArchivoLocal(whatsappId, datos.nombreGuardado);
  return trasEnvioManual(conversacionId, mensaje);
}

// ==================== Reaccionar, editar, eliminar ====================

function exigirWhatsappId(mensaje: repo.MensajeParaAccion): string {
  if (!mensaje.whatsappId || mensaje.whatsappId.startsWith('llamada-')) {
    throw solicitudInvalida('Este mensaje no está en WhatsApp');
  }
  return mensaje.whatsappId;
}

/** emoji null = quitar mi reaccion. */
export async function reaccionar(conversacionId: number, mensajeId: number, emoji: string | null) {
  const chat = await repo.obtenerDatosChat(conversacionId);
  const mensaje = await repo.obtenerMensajeParaAccion(conversacionId, mensajeId);
  const whatsappId = exigirWhatsappId(mensaje);
  if (mensaje.eliminado) throw conflicto('No se puede reaccionar a un mensaje eliminado');
  const clave = claveDeMensaje(chat.telefono, whatsappId, mensaje.autor !== 'lead');
  await enviarReaccion(chat.numeroId, chat.telefono, clave, emoji ?? '');
  return emitirCambio(await repo.aplicarReaccion(whatsappId, 'yo', emoji));
}

function exigirPropio(mensaje: repo.MensajeParaAccion, maxMs: number, accion: string) {
  if (mensaje.autor === 'lead') throw solicitudInvalida(`Solo puedes ${accion} tus propios mensajes`);
  if (mensaje.eliminado) throw conflicto('Este mensaje ya fue eliminado');
  if (Date.now() - new Date(mensaje.creadoEn).getTime() > maxMs) {
    throw conflicto(`WhatsApp ya no permite ${accion} este mensaje: pasó demasiado tiempo`);
  }
}

export async function editar(conversacionId: number, mensajeId: number, texto: string) {
  const chat = await repo.obtenerDatosChat(conversacionId);
  const mensaje = await repo.obtenerMensajeParaAccion(conversacionId, mensajeId);
  const whatsappId = exigirWhatsappId(mensaje);
  exigirPropio(mensaje, EDITAR_MAX_MS, 'editar');
  if (mensaje.tipo !== 'texto') throw solicitudInvalida('Solo se pueden editar mensajes de texto');
  if (texto === mensaje.texto) return mensaje;

  await enviarEdicion(chat.numeroId, chat.telefono, claveDeMensaje(chat.telefono, whatsappId, true), texto);
  const cambio = await repo.aplicarEdicion(whatsappId, texto, null);
  if (cambio) await emitirConversacion(conversacionId);
  return emitirCambio(cambio);
}

export async function eliminarParaTodos(conversacionId: number, mensajeId: number) {
  const chat = await repo.obtenerDatosChat(conversacionId);
  const mensaje = await repo.obtenerMensajeParaAccion(conversacionId, mensajeId);
  const whatsappId = exigirWhatsappId(mensaje);
  exigirPropio(mensaje, ELIMINAR_MAX_MS, 'eliminar');

  await enviarEliminacion(chat.numeroId, chat.telefono, claveDeMensaje(chat.telefono, whatsappId, true));
  const cambio = await repo.marcarEliminado(whatsappId);
  if (cambio) await emitirConversacion(conversacionId);
  return emitirCambio(cambio);
}

// ==================== Reenviar ====================

/**
 * Reenvia un mensaje a otros chats (de cualquier numero). Como en WhatsApp,
 * lo que te mando el cliente llega como "Reenviado"; lo tuyo no. Los
 * archivos se copian: cada mensaje tiene su propio archivo, asi la limpieza
 * automatica de uno no deja sin archivo al otro.
 */
export async function reenviar(conversacionId: number, mensajeId: number, destinos: number[]) {
  const chat = await repo.obtenerDatosChat(conversacionId);
  const original = await repo.obtenerMensajeParaAccion(conversacionId, mensajeId);
  if (original.eliminado) throw conflicto('No se puede reenviar un mensaje eliminado');
  if (!TIPOS_REENVIABLES.includes(original.tipo)) throw solicitudInvalida('Este tipo de mensaje no se puede reenviar');
  const unicos = [...new Set(destinos)];
  if (!unicos.length || unicos.length > REENVIAR_MAX_CHATS) {
    throw solicitudInvalida(`Elige entre 1 y ${REENVIAR_MAX_CHATS} chats`);
  }

  const reenviado = original.autor === 'lead';
  const extra: ExtraMensaje | null = reenviado ? { reenviado: 'una' } : null;
  const archivoOriginal = original.media ? await obtenerArchivoMedia(conversacionId, chat.numeroId, mensajeId) : null;

  const resultados: { conversacionId: number; ok: boolean; error?: string }[] = [];
  for (const destinoId of unicos) {
    try {
      const destino = await repo.obtenerDatosChat(destinoId);
      if (!archivoOriginal) {
        const whatsappId = await enviarTextoPanel(destino.numeroId, destino.telefono, original.texto, { reenviado });
        const mensaje = await repo.agregarMensaje(destinoId, 'yo', original.texto, whatsappId, {
          estadoEntrega: 'enviado',
          extra,
        });
        await trasEnvioManual(destinoId, mensaje);
      } else {
        const copia = await copiarArchivo(archivoOriginal.rutaAbsoluta);
        try {
          const media = original.media!;
          const tipo = original.tipo as ArchivoEnvio['tipo'];
          const leyenda = media.leyenda ?? null;
          const whatsappId = await enviarArchivo(
            destino.numeroId,
            destino.telefono,
            { rutaAbsoluta: copia.ruta, tipo, mime: archivoOriginal.mime, nombre: archivoOriginal.nombre, segundos: media.segundos },
            leyenda,
            { reenviado },
          );
          const mensaje = await repo.agregarMensaje(destinoId, 'yo', original.texto, whatsappId, {
            tipo: original.tipo,
            media,
            mediaArchivo: copia.nombre,
            estadoEntrega: 'enviado',
            extra,
          });
          if (!mensaje && whatsappId) await repo.asociarArchivoLocal(whatsappId, copia.nombre);
          await trasEnvioManual(destinoId, mensaje);
        } catch (err) {
          await fs.rm(copia.ruta, { force: true }).catch(() => undefined);
          throw err;
        }
      }
      resultados.push({ conversacionId: destinoId, ok: true });
    } catch (err) {
      resultados.push({ conversacionId: destinoId, ok: false, error: (err as Error).message });
    }
  }
  return resultados;
}

async function copiarArchivo(origen: string): Promise<{ ruta: string; nombre: string }> {
  const nombre = `envio-${crypto.randomUUID()}${path.extname(origen).toLowerCase()}`;
  const ruta = path.join(CARPETA_MEDIA_CHAT, nombre);
  await fs.mkdir(CARPETA_MEDIA_CHAT, { recursive: true });
  await fs.copyFile(origen, ruta);
  return { ruta, nombre };
}

/** El jid al que suscribirse para ver "escribiendo..." / "en linea" del contacto. */
export function jidParaPresencia(chat: repo.DatosChat): string {
  return chat.jidChat ?? jidDeTelefono(chat.telefono);
}
