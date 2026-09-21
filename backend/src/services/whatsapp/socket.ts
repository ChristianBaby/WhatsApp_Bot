import path from 'node:path';
import QRCode from 'qrcode';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  type WAMessage,
  type WASocket,
} from 'baileys';
import { env } from '../../config/env.js';
import { crearLogger } from '../../lib/logger.js';

/**
 * Una sola conexion de Baileys para UN numero. No sabe nada de reintentos,
 * base de datos ni SSE — solo abre el socket, traduce sus eventos a algo
 * simple (onQr/onConectado/onDesconectado) y expone como cerrarlo. La
 * orquestacion (reintentos, persistencia, notificar al panel) vive en
 * gestor.ts.
 */

type MensajeRecibido = {
  telefono: string;
  fromMe: boolean;
  texto: string;
  whatsappId: string | null;
  pushName?: string | null;
};

type CallbacksSesion = {
  onQr: (qrDataUrl: string) => void;
  onConectado: (telefono: string) => void;
  /** motivo 'logout' = cierre definitivo (no reintentar); 'error' = corte inesperado. */
  onDesconectado: (motivo: 'logout' | 'error', mensaje?: string) => void;
  /** Cualquier mensaje 1:1 (entrante o saliente) que pase por esta sesion. */
  onMensaje: (mensaje: MensajeRecibido) => void;
};

/**
 * Saca un texto mostrable de un mensaje de WhatsApp. Para tipos que no son
 * texto plano se usa una etiqueta corta (seccion 3.6 pide guardar "que
 * escribio", no renderizar cada tipo de adjunto). Devuelve '' para eventos
 * sin contenido util (reacciones, mensajes de protocolo) — esos se ignoran.
 */
function extraerTexto(msg: WAMessage): string {
  const m = msg.message;
  if (!m) return '';
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage) return m.imageMessage.caption ? `📷 ${m.imageMessage.caption}` : '📷 Imagen';
  if (m.videoMessage) return m.videoMessage.caption ? `🎥 ${m.videoMessage.caption}` : '🎥 Video';
  if (m.audioMessage) return m.audioMessage.ptt ? '🎤 Audio de voz' : '🎵 Audio';
  if (m.documentMessage) return `📄 ${m.documentMessage.fileName ?? 'Documento'}`;
  if (m.stickerMessage) return '💟 Sticker';
  if (m.locationMessage) return '📍 Ubicación';
  if (m.contactMessage) return '👤 Contacto compartido';
  return '';
}

export type SesionBaileys = {
  sock: WASocket;
  /** Cierra el socket local sin avisar a WhatsApp ni tocar las credenciales guardadas. */
  cerrar: () => void;
};

function carpetaSesion(numeroId: number): string {
  return path.join(env.rutaSesiones, String(numeroId));
}

export async function crearSesion(numeroId: number, callbacks: CallbacksSesion): Promise<SesionBaileys> {
  const carpeta = carpetaSesion(numeroId);
  const { state, saveCreds } = await useMultiFileAuthState(carpeta);
  const { version } = await fetchLatestBaileysVersion();

  // Baileys es extremadamente verboso en debug/trace; solo nos interesan
  // sus advertencias y errores reales. Nuestros propios logs de negocio
  // (conectado, desconectado, reintentando...) van por crearLogger('whatsapp').
  const logBaileys = crearLogger(`baileys:${numeroId}`);
  logBaileys.level = 'warn';

  const sock = makeWASocket({
    version,
    auth: state,
    logger: logBaileys,
    // Identifica el "dispositivo" ante WhatsApp. Un nombre fijo y propio
    // (en vez del generico por defecto) ayuda a que la sesion se vea
    // reconocible en Dispositivos vinculados del telefono del usuario.
    browser: ['Universoft Systems', 'Chrome', '1.0.0'],
    printQRInTerminal: false,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (actualizacion) => {
    const { connection, qr, lastDisconnect } = actualizacion;

    if (qr) {
      QRCode.toDataURL(qr, { margin: 1, width: 280 })
        .then(callbacks.onQr)
        .catch((err) => logBaileys.error({ err }, 'No se pudo generar la imagen del QR'));
    }

    if (connection === 'open') {
      // El jid tiene forma "51987654321:12@s.whatsapp.net" (con dispositivo)
      // o "51987654321@s.whatsapp.net" (dispositivo principal).
      const jid = sock.user?.id ?? '';
      const telefono = jid.split(':')[0]?.split('@')[0] ?? '';
      callbacks.onConectado(telefono);
    }

    if (connection === 'close') {
      const error = lastDisconnect?.error as { output?: { statusCode?: number } } | undefined;
      const esLogout = error?.output?.statusCode === DisconnectReason.loggedOut;
      callbacks.onDesconectado(esLogout ? 'logout' : 'error', lastDisconnect?.error?.message);
    }
  });

  // "51987654321:5@dominio" es un dispositivo secundario del mismo numero;
  // el ":5" no es parte del telefono (mismo criterio que en onConectado).
  function soloTelefono(jid: string): string | null {
    return jid.split('@')[0]?.split(':')[0] ?? null;
  }

  /**
   * WhatsApp esta migrando a JIDs "@lid" (identificador de privacidad) en
   * vez del tradicional "<telefono>@s.whatsapp.net" para algunos contactos.
   * Baileys mantiene su propio mapeo lid<->telefono (se llena solo durante
   * la sesion); lo resolvemos aca para seguir guardando siempre el telefono
   * real, sin importar que formato de JID haya usado WhatsApp esta vez.
   */
  async function telefonoDesdeJid(jidCrudo: string): Promise<string | null> {
    if (jidCrudo.endsWith('@s.whatsapp.net')) return soloTelefono(jidCrudo);

    if (jidCrudo.endsWith('@lid')) {
      const pn = await sock.signalRepository.lidMapping.getPNForLID(jidCrudo).catch(() => null);
      if (!pn) {
        logBaileys.warn({ jidCrudo }, 'No se pudo resolver un JID @lid a un telefono; se ignora el mensaje');
        return null;
      }
      return soloTelefono(pn);
    }

    return null; // grupos (@g.us), estados (@broadcast), etc.
  }

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    // 'notify' = mensaje nuevo de verdad. Los demas tipos ('append', etc.)
    // son sincronizacion de historial viejo al reconectar — no son "nuevos".
    if (type !== 'notify') return;

    for (const msg of messages) {
      const jidCrudo = msg.key.remoteJid ?? '';

      const texto = extraerTexto(msg);
      if (!texto) continue; // reaccion, recibo de lectura, etc. — nada que guardar

      void telefonoDesdeJid(jidCrudo).then((telefono) => {
        if (!telefono) return;
        callbacks.onMensaje({
          telefono,
          fromMe: msg.key.fromMe ?? false,
          texto,
          whatsappId: msg.key.id ?? null,
          pushName: msg.pushName,
        });
      });
    }
  });

  return {
    sock,
    cerrar: () => {
      sock.ev.removeAllListeners('connection.update');
      sock.end(undefined);
    },
  };
}
