import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnyMessageContent, WASocket } from 'baileys';
import { env } from '../../config/env.js';
import { crearLogger } from '../../lib/logger.js';
import { obtenerSocket } from './gestor.js';

const log = crearLogger('whatsapp-envio');

export class NumeroNoConectadoError extends Error {
  constructor(numeroId: number) {
    super(`El numero ${numeroId} no esta conectado ahora mismo`);
    this.name = 'NumeroNoConectadoError';
  }
}

function jidDeTelefono(telefono: string): string {
  return `${telefono}@s.whatsapp.net`;
}

function socketDeNumero(numeroId: number): WASocket {
  const sock = obtenerSocket(numeroId);
  if (!sock) throw new NumeroNoConectadoError(numeroId);
  return sock;
}

/**
 * Verifica si un telefono esta registrado en WhatsApp (seccion 3.4: antes
 * de enviar, comprobar que el numero existe, para no intentar escribirle a
 * alguien que no tiene WhatsApp).
 */
export async function verificarEnWhatsapp(numeroId: number, telefono: string): Promise<boolean> {
  const sock = socketDeNumero(numeroId);
  const resultados = await sock.onWhatsApp(telefono);
  return (resultados ?? []).some((r) => r.exists);
}

/**
 * Ruta absoluta de un adjunto dentro de la carpeta de subidas. Solo acepta un
 * nombre de archivo simple (como los que genera routes/adjuntos.ts): una ruta
 * con "../" permitiria mandar por WhatsApp cualquier archivo del servidor.
 */
function rutaDeAdjunto(ruta: string): string {
  if (!ruta || ruta !== path.basename(ruta)) throw new Error(`Ruta de adjunto invalida: ${ruta}`);
  return path.join(env.rutaSubidas, ruta);
}

export async function existeAdjunto(ruta: string): Promise<boolean> {
  try {
    await fs.access(rutaDeAdjunto(ruta));
    return true;
  } catch {
    return false;
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type AdjuntoEnvio = { ruta: string; tipo: 'imagen' | 'video' };

/**
 * Simula "escribiendo..." un par de segundos y despues manda el mensaje real
 * (seccion 3.5: ayuda a que el envio no se sienta 100% instantaneo/robotico).
 * Si hay adjunto, va como imagen/video con el texto de caption.
 *
 * Devuelve el whatsapp_id real del mensaje enviado (key.id) para que quien
 * lo llama pueda registrarlo en la conversacion sin duplicarlo si Baileys
 * tambien reemite el mismo mensaje por su propio eco de mensajes.upsert.
 */
/**
 * Checks azules: le dice a WhatsApp que ya se leyeron esos mensajes. Baileys
 * respeta la privacidad del telefono: si ahi estan apagadas las
 * confirmaciones de lectura, el contacto no ve el azul (igual que en WhatsApp).
 * Devuelve false si el numero no esta conectado (no es un error: es opcional).
 */
export async function confirmarLectura(
  numeroId: number,
  telefono: string,
  jid: string | null,
  ids: string[],
): Promise<boolean> {
  const sock = obtenerSocket(numeroId);
  if (!sock || !ids.length) return false;
  const remoteJid = jid ?? jidDeTelefono(telefono);
  await sock.readMessages(ids.map((id) => ({ remoteJid, id, fromMe: false })));
  return true;
}

export async function enviarMensaje(
  numeroId: number,
  telefono: string,
  texto: string,
  adjunto?: AdjuntoEnvio | null,
): Promise<string | null> {
  const sock = socketDeNumero(numeroId);
  const jid = jidDeTelefono(telefono);

  try {
    await sock.sendPresenceUpdate('composing', jid);
  } catch (err) {
    // No es critico: si falla el "escribiendo...", se manda el mensaje igual.
    log.debug({ err, numeroId }, 'No se pudo simular "escribiendo..."');
  }

  await esperar(1200 + Math.random() * 1500);

  let enviado;
  if (adjunto) {
    const rutaAbsoluta = rutaDeAdjunto(adjunto.ruta);
    enviado =
      adjunto.tipo === 'imagen'
        ? await sock.sendMessage(jid, { image: { url: rutaAbsoluta }, caption: texto })
        : await sock.sendMessage(jid, { video: { url: rutaAbsoluta }, caption: texto });
  } else {
    enviado = await sock.sendMessage(jid, { text: texto });
  }

  return enviado?.key.id ?? null;
}

export type TipoArchivoEnvio = 'imagen' | 'video' | 'audio' | 'documento';

export type ArchivoEnvio = {
  rutaAbsoluta: string;
  tipo: TipoArchivoEnvio;
  mime: string;
  nombre: string;
};

/**
 * Envia un archivo desde el chat del panel (foto, video, audio o documento).
 * Sin "escribiendo...": es una persona mandando un archivo, no un texto.
 * Devuelve el whatsapp_id, igual que enviarMensaje.
 */
export async function enviarArchivo(
  numeroId: number,
  telefono: string,
  archivo: ArchivoEnvio,
  leyenda: string | null,
): Promise<string | null> {
  const sock = socketDeNumero(numeroId);
  const url = { url: archivo.rutaAbsoluta };
  const caption = leyenda ?? undefined;

  const contenido: AnyMessageContent =
    archivo.tipo === 'imagen'
      ? { image: url, caption }
      : archivo.tipo === 'video'
        ? { video: url, caption, mimetype: archivo.mime }
        : archivo.tipo === 'audio'
          ? { audio: url, mimetype: archivo.mime }
          : { document: url, mimetype: archivo.mime, fileName: archivo.nombre, caption };

  const enviado = await sock.sendMessage(jidDeTelefono(telefono), contenido);
  return enviado?.key.id ?? null;
}
