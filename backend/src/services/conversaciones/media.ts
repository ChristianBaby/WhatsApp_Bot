import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { noEncontrado } from '../../lib/errors.js';
import { crearLogger } from '../../lib/logger.js';
import { obtenerSocket } from '../whatsapp/gestor.js';
import { descargarMediaGuardada } from '../whatsapp/socket.js';
import type { TipoArchivoEnvio } from '../whatsapp/envio.js';
import * as repo from './repositorio.js';

const log = crearLogger('chat-media');

/**
 * Fotos, videos, audios y documentos de los chats. Viven en una carpeta
 * oculta dentro de uploads: la ruta publica /api/uploads (que exige solo el
 * token del Gateway, no un usuario) no sirve dotfiles, asi que estos
 * archivos privados solo salen por la ruta autenticada del chat.
 */
export const CARPETA_MEDIA_CHAT = path.join(env.rutaSubidas, '.chats');

const EXTENSION_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'video/quicktime': 'mov',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'application/pdf': 'pdf',
};

function extensionDe(mime: string | null, nombre: string | null): string {
  const base = mime?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (EXTENSION_POR_MIME[base]) return EXTENSION_POR_MIME[base];
  const deNombre = nombre ? path.extname(nombre).slice(1).toLowerCase() : '';
  return /^[a-z0-9]{1,8}$/.test(deNombre) ? deNombre : 'bin';
}

export type ArchivoMedia = { rutaAbsoluta: string; mime: string; nombre: string };

// Si dos personas (o dos pestañas) abren la misma foto a la vez, se baja una sola vez.
const descargasEnCurso = new Map<number, Promise<ArchivoMedia>>();

/**
 * El archivo de un mensaje del chat. La primera vez se baja de WhatsApp y
 * se guarda en disco; las siguientes se sirve directo. Asi nada se descarga
 * hasta que alguien lo abre en el panel.
 */
export async function obtenerArchivoMedia(
  conversacionId: number,
  numeroId: number,
  mensajeId: number,
): Promise<ArchivoMedia> {
  const datos = await repo.obtenerMediaDeMensaje(conversacionId, mensajeId);
  if (!datos?.media) throw noEncontrado('Este mensaje no tiene archivo');

  const mime = datos.media.mime?.split(';')[0]?.trim() || 'application/octet-stream';
  const nombre = datos.media.nombre ?? `archivo-${mensajeId}.${extensionDe(datos.media.mime, null)}`;

  if (datos.mediaArchivo) {
    const rutaAbsoluta = path.join(CARPETA_MEDIA_CHAT, path.basename(datos.mediaArchivo));
    const existe = await fs.access(rutaAbsoluta).then(
      () => true,
      () => false,
    );
    if (existe) return { rutaAbsoluta, mime, nombre };
  }

  if (!datos.mediaDescarga) throw noEncontrado('El archivo ya no está disponible');

  const enCurso = descargasEnCurso.get(mensajeId);
  if (enCurso) return enCurso;

  const descarga = (async () => {
    const contenido = await descargarMediaGuardada(obtenerSocket(numeroId), datos.mediaDescarga!).catch((err: unknown) => {
      log.warn({ err, mensajeId }, 'No se pudo descargar un archivo de WhatsApp');
      throw noEncontrado('WhatsApp ya no tiene este archivo (es muy antiguo o fue borrado)');
    });
    await fs.mkdir(CARPETA_MEDIA_CHAT, { recursive: true });
    const archivo = `${mensajeId}.${extensionDe(datos.media!.mime, datos.media!.nombre)}`;
    const rutaAbsoluta = path.join(CARPETA_MEDIA_CHAT, archivo);
    await fs.writeFile(rutaAbsoluta, contenido);
    await repo.guardarArchivoMedia(mensajeId, archivo);
    return { rutaAbsoluta, mime, nombre };
  })();

  descargasEnCurso.set(mensajeId, descarga);
  try {
    return await descarga;
  } finally {
    descargasEnCurso.delete(mensajeId);
  }
}

/** Como mandar un archivo segun su tipo: WhatsApp solo muestra como foto/video algunos formatos. */
export function tipoDeEnvio(mime: string): TipoArchivoEnvio {
  if (['image/jpeg', 'image/png'].includes(mime)) return 'imagen';
  if (mime === 'video/mp4') return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'documento';
}
