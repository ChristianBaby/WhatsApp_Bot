import path from 'node:path';
import type { WASocket } from 'baileys';
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
    const rutaAbsoluta = path.join(env.rutaSubidas, adjunto.ruta);
    enviado =
      adjunto.tipo === 'imagen'
        ? await sock.sendMessage(jid, { image: { url: rutaAbsoluta }, caption: texto })
        : await sock.sendMessage(jid, { video: { url: rutaAbsoluta }, caption: texto });
  } else {
    enviado = await sock.sendMessage(jid, { text: texto });
  }

  return enviado?.key.id ?? null;
}
