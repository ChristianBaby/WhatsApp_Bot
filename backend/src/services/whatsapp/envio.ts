import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnyMessageContent, proto, WAMessage, WAMessageKey, WASocket } from 'baileys';
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

export function jidDeTelefono(telefono: string): string {
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
  /** nota_voz: audio .ogg (opus) que se ve como grabado en el momento; sticker: imagen .webp. */
  tipo: TipoArchivoEnvio | 'nota_voz' | 'sticker';
  mime: string;
  nombre: string;
  segundos?: number | null;
};

/** Opciones del chat del panel: responder citando un mensaje, o marcarlo como reenviado. */
export type OpcionesEnvio = {
  citado?: WAMessage | null;
  reenviado?: boolean;
};

const CONTEXTO_REENVIADO: proto.IContextInfo = { isForwarded: true, forwardingScore: 1 };

/**
 * Un texto escrito por una persona en el chat del panel. Sin la espera de
 * "escribiendo..." de enviarMensaje: aqui el "escribiendo..." es real (lo
 * manda el panel mientras se escribe, ver avisarEscribiendo).
 */
export async function enviarTextoPanel(
  numeroId: number,
  telefono: string,
  texto: string,
  opciones: OpcionesEnvio = {},
): Promise<string | null> {
  const sock = socketDeNumero(numeroId);
  const contenido: AnyMessageContent = opciones.reenviado ? { text: texto, contextInfo: CONTEXTO_REENVIADO } : { text: texto };
  const enviado = await sock.sendMessage(jidDeTelefono(telefono), contenido, opciones.citado ? { quoted: opciones.citado } : undefined);
  return enviado?.key.id ?? null;
}

/** La clave de WhatsApp de un mensaje guardado de este chat (para reaccionar, editar o eliminar). */
export function claveDeMensaje(telefono: string, whatsappId: string, propio: boolean): WAMessageKey {
  return { remoteJid: jidDeTelefono(telefono), id: whatsappId, fromMe: propio };
}

/** Reaccion propia a un mensaje (emoji vacio la quita). */
export async function enviarReaccion(numeroId: number, telefono: string, clave: WAMessageKey, emoji: string): Promise<void> {
  await socketDeNumero(numeroId).sendMessage(jidDeTelefono(telefono), { react: { text: emoji, key: clave } });
}

/** Edita un texto propio (WhatsApp lo permite durante 15 minutos). */
export async function enviarEdicion(numeroId: number, telefono: string, clave: WAMessageKey, texto: string): Promise<void> {
  await socketDeNumero(numeroId).sendMessage(jidDeTelefono(telefono), { text: texto, edit: clave });
}

/** "Eliminar para todos" de un mensaje propio. */
export async function enviarEliminacion(numeroId: number, telefono: string, clave: WAMessageKey): Promise<void> {
  await socketDeNumero(numeroId).sendMessage(jidDeTelefono(telefono), { delete: clave });
}

export type EstadoEscritura = 'composing' | 'recording' | 'paused';

/** "escribiendo..." / "grabando audio..." que ve el contacto mientras se usa el chat del panel. */
export async function avisarEscribiendo(numeroId: number, telefono: string, estado: EstadoEscritura): Promise<boolean> {
  const sock = obtenerSocket(numeroId);
  if (!sock) return false;
  await sock.sendPresenceUpdate(estado, jidDeTelefono(telefono));
  return true;
}

/** Pide a WhatsApp que avise cuando este contacto escribe o se conecta (solo si su privacidad lo permite). */
export async function suscribirPresencia(numeroId: number, jid: string): Promise<boolean> {
  const sock = obtenerSocket(numeroId);
  if (!sock) return false;
  await sock.presenceSubscribe(jid);
  return true;
}

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
  opciones: OpcionesEnvio = {},
): Promise<string | null> {
  const sock = socketDeNumero(numeroId);
  const url = { url: archivo.rutaAbsoluta };
  const caption = leyenda ?? undefined;
  const contextInfo = opciones.reenviado ? CONTEXTO_REENVIADO : undefined;

  const contenido: AnyMessageContent =
    archivo.tipo === 'imagen'
      ? { image: url, caption, contextInfo }
      : archivo.tipo === 'video'
        ? { video: url, caption, mimetype: archivo.mime, contextInfo }
        : archivo.tipo === 'nota_voz'
          ? { audio: url, ptt: true, mimetype: 'audio/ogg; codecs=opus', seconds: archivo.segundos ?? undefined, contextInfo }
          : archivo.tipo === 'audio'
            ? { audio: url, mimetype: archivo.mime, contextInfo }
            : archivo.tipo === 'sticker'
              ? { sticker: url, contextInfo }
              : { document: url, mimetype: archivo.mime, fileName: archivo.nombre, caption, contextInfo };

  const enviado = await sock.sendMessage(
    jidDeTelefono(telefono),
    contenido,
    opciones.citado ? { quoted: opciones.citado } : undefined,
  );
  return enviado?.key.id ?? null;
}
