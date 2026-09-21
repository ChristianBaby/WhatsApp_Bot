import path from 'node:path';
import QRCode from 'qrcode';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
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

type CallbacksSesion = {
  onQr: (qrDataUrl: string) => void;
  onConectado: (telefono: string) => void;
  /** motivo 'logout' = cierre definitivo (no reintentar); 'error' = corte inesperado. */
  onDesconectado: (motivo: 'logout' | 'error', mensaje?: string) => void;
};

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

  return {
    sock,
    cerrar: () => {
      sock.ev.removeAllListeners('connection.update');
      sock.end(undefined);
    },
  };
}
