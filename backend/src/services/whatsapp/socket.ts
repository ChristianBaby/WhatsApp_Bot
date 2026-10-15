import path from 'node:path';
import QRCode from 'qrcode';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadMediaMessage,
  normalizeMessageContent,
  BufferJSON,
  type Contact,
  type WAMessage,
  type WASocket,
} from 'baileys';
import { env } from '../../config/env.js';
import { crearLogger } from '../../lib/logger.js';
import type { MediaInfo, TipoMensaje } from '../conversaciones/tipos.js';

/**
 * Una sola conexion de Baileys para UN numero. No sabe nada de reintentos,
 * base de datos ni SSE — solo abre el socket, traduce sus eventos a algo
 * simple (onQr/onConectado/onMensaje/onHistorial...) y expone como cerrarlo.
 * La orquestacion (reintentos, persistencia, notificar al panel) vive en
 * gestor.ts.
 */

export type MensajeRecibido = {
  telefono: string;
  fromMe: boolean;
  texto: string;
  whatsappId: string | null;
  pushName?: string | null;
  tipo: TipoMensaje;
  media: MediaInfo | null;
  /** El mensaje original serializado (BufferJSON): para bajar el adjunto solo cuando alguien lo abre. */
  mediaDescarga: string | null;
  /** Fecha real del mensaje segun WhatsApp. */
  fecha: Date | null;
  /** Nota de voz: descarga perezosa (solo si se va a transcribir). */
  audio?: { descargar: () => Promise<Buffer>; mimeType: string; segundos: number } | null;
};

export type ContactoAgenda = {
  telefono: string;
  /** Como lo guardo el usuario en su telefono. */
  nombreAgenda: string | null;
  /** Como se llama el contacto a si mismo en WhatsApp. */
  pushName: string | null;
};

/** Un tramo del historial que WhatsApp manda al vincular (llega en varias partes). */
export type LoteHistorial = {
  chats: { telefono: string; nombre: string | null; noLeidos: number }[];
  contactos: ContactoAgenda[];
  mensajes: MensajeRecibido[];
  /** 0-100 segun WhatsApp, o null si no lo informa. */
  progreso: number | null;
};

type CallbacksSesion = {
  onQr: (qrDataUrl: string) => void;
  onConectado: (telefono: string) => void;
  /** motivo 'logout' = cierre definitivo (no reintentar); 'error' = corte inesperado. */
  onDesconectado: (motivo: 'logout' | 'error', mensaje?: string) => void;
  /** Cualquier mensaje 1:1 NUEVO (entrante o saliente) que pase por esta sesion. */
  onMensaje: (mensaje: MensajeRecibido) => void;
  /** Mensajes viejos (historial del telefono): se guardan sin avisos ni IA. */
  onHistorial: (lote: LoteHistorial) => void;
  /** Nombres de la agenda del telefono que cambiaron o llegaron. */
  onContactos: (contactos: ContactoAgenda[]) => void;
  /** Confirmacion de WhatsApp sobre un mensaje NUESTRO: entregado (✓✓) o leido (✓✓ azul). */
  onEstadoEntrega: (whatsappId: string, estado: 'entregado' | 'leido') => void;
};

// proto.WebMessageInfo.Status de WhatsApp: 3 = entregado, 4 = leido, 5 = reproducido (audio/video).
const ESTADO_ENTREGADO = 3;
const ESTADO_LEIDO = 4;

/** Los numeros grandes de WhatsApp (fechas, tamanos) llegan como number o como Long. */
function aNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') return valor;
  const conMetodo = valor as { toNumber?: () => number };
  if (typeof conMetodo.toNumber === 'function') return conMetodo.toNumber();
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

type Descripcion = {
  /** Texto para el preview, la IA y los avisos ("📷 Imagen", "📄 cotizacion.pdf"...). */
  texto: string;
  tipo: TipoMensaje;
  media: MediaInfo | null;
  /** Campo del mensaje de WhatsApp que tiene el archivo (imageMessage...), si hay. */
  campoMedia: string | null;
};

function infoMedia(datos: {
  mime?: string | null;
  nombre?: string | null;
  segundos?: unknown;
  tamano?: unknown;
  leyenda?: string | null;
}): MediaInfo {
  return {
    mime: datos.mime ?? null,
    nombre: datos.nombre ?? null,
    segundos: aNumero(datos.segundos),
    tamano: aNumero(datos.tamano),
    leyenda: datos.leyenda?.trim() || null,
  };
}

/**
 * Que es un mensaje de WhatsApp y como mostrarlo. Devuelve null para eventos
 * sin contenido util (reacciones, mensajes de protocolo, encuestas...) —
 * esos se ignoran.
 */
function describirMensaje(msg: WAMessage): Descripcion | null {
  const m = normalizeMessageContent(msg.message);
  if (!m) return null;

  if (m.conversation) return { texto: m.conversation, tipo: 'texto', media: null, campoMedia: null };
  if (m.extendedTextMessage?.text) {
    return { texto: m.extendedTextMessage.text, tipo: 'texto', media: null, campoMedia: null };
  }
  if (m.imageMessage) {
    const x = m.imageMessage;
    return {
      texto: x.caption ? `📷 ${x.caption}` : '📷 Imagen',
      tipo: 'imagen',
      media: infoMedia({ mime: x.mimetype, tamano: x.fileLength, leyenda: x.caption }),
      campoMedia: 'imageMessage',
    };
  }
  if (m.videoMessage) {
    const x = m.videoMessage;
    return {
      texto: x.caption ? `🎥 ${x.caption}` : '🎥 Video',
      tipo: 'video',
      media: infoMedia({ mime: x.mimetype, segundos: x.seconds, tamano: x.fileLength, leyenda: x.caption }),
      campoMedia: 'videoMessage',
    };
  }
  if (m.audioMessage) {
    const x = m.audioMessage;
    return {
      texto: x.ptt ? '🎤 Audio de voz' : '🎵 Audio',
      tipo: x.ptt ? 'nota_voz' : 'audio',
      media: infoMedia({ mime: x.mimetype, segundos: x.seconds, tamano: x.fileLength }),
      campoMedia: 'audioMessage',
    };
  }
  if (m.documentMessage) {
    const x = m.documentMessage;
    const nombre = x.fileName ?? x.title ?? 'Documento';
    return {
      texto: `📄 ${nombre}${x.caption ? ` — ${x.caption}` : ''}`,
      tipo: 'documento',
      media: infoMedia({ mime: x.mimetype, nombre, tamano: x.fileLength, leyenda: x.caption }),
      campoMedia: 'documentMessage',
    };
  }
  if (m.stickerMessage) {
    const x = m.stickerMessage;
    return {
      texto: '💟 Sticker',
      tipo: 'sticker',
      media: infoMedia({ mime: x.mimetype, tamano: x.fileLength }),
      campoMedia: 'stickerMessage',
    };
  }
  if (m.locationMessage) {
    const x = m.locationMessage;
    const lugar = [x.name, x.address].filter(Boolean).join(', ');
    const enlace =
      x.degreesLatitude != null && x.degreesLongitude != null
        ? ` https://maps.google.com/?q=${x.degreesLatitude},${x.degreesLongitude}`
        : '';
    return { texto: `📍 Ubicación${lugar ? `: ${lugar}` : ''}${enlace}`, tipo: 'ubicacion', media: null, campoMedia: null };
  }
  if (m.contactMessage) {
    return {
      texto: `👤 Contacto: ${m.contactMessage.displayName ?? 'compartido'}`,
      tipo: 'contacto',
      media: null,
      campoMedia: null,
    };
  }
  return null;
}

/**
 * Lo minimo del mensaje original para descargar su archivo despues: la key
 * (para pedir que lo vuelvan a subir si ya expiro en el servidor) y el
 * sub-mensaje con la llave y la ruta del archivo. Sin la miniatura: ocupa
 * espacio y el panel no la usa.
 */
function serializarParaDescarga(msg: WAMessage, campoMedia: string | null): string | null {
  if (!campoMedia) return null;
  const contenido = normalizeMessageContent(msg.message) as Record<string, unknown> | undefined;
  const sub = contenido?.[campoMedia];
  if (!sub || typeof sub !== 'object') return null;
  const copia: Record<string, unknown> = { ...(sub as Record<string, unknown>) };
  delete copia.jpegThumbnail;
  return JSON.stringify({ key: msg.key, message: { [campoMedia]: copia } }, BufferJSON.replacer);
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
    // Historial "reciente" (lo que WhatsApp decide mandar al vincular, unos
    // meses), no el completo: el completo tarda mucho y casi no se usa.
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
   *
   * esperarMapeo: un mensaje nuevo puede llegar antes que el mapeo de su
   * @lid, asi que se reintenta un par de veces. En el historial no (son
   * miles de mensajes): el mapeo viene en el mismo lote.
   */
  async function telefonoDesdeJid(
    jidCrudo: string,
    jidAlternativo?: string | null,
    opciones: { esperarMapeo: boolean; mapeoLote?: Map<string, string> } = { esperarMapeo: true },
  ): Promise<string | null> {
    if (jidCrudo.endsWith('@s.whatsapp.net')) return soloTelefono(jidCrudo);

    if (jidCrudo.endsWith('@lid')) {
      // Baileys 7 suele traer el telefono real en remoteJidAlt: es lo mas confiable.
      if (jidAlternativo?.endsWith('@s.whatsapp.net')) return soloTelefono(jidAlternativo);

      const delLote = opciones.mapeoLote?.get(jidCrudo);
      if (delLote) return soloTelefono(delLote);

      for (const esperaMs of opciones.esperarMapeo ? [0, 2_000, 5_000] : [0]) {
        if (esperaMs) await new Promise((r) => setTimeout(r, esperaMs));
        const pn = await sock.signalRepository.lidMapping.getPNForLID(jidCrudo).catch(() => null);
        if (pn) return soloTelefono(pn);
      }
      if (opciones.esperarMapeo) {
        // Es la respuesta de un contacto que no se puede asociar a un telefono:
        // error (no warn) para que se vea en los logs.
        logBaileys.error({ jidCrudo }, 'Mensaje perdido: no se pudo resolver un JID @lid a un telefono');
      }
      return null;
    }

    return null; // grupos (@g.us), estados (@broadcast), canales, etc.
  }

  /** Convierte un mensaje de WhatsApp en algo guardable; null si no es de un chat individual o no tiene contenido. */
  async function convertir(
    msg: WAMessage,
    opciones: { esperarMapeo: boolean; mapeoLote?: Map<string, string> },
  ): Promise<MensajeRecibido | null> {
    const descripcion = describirMensaje(msg);
    if (!descripcion) return null; // reaccion, recibo de lectura, etc. — nada que guardar

    const telefono = await telefonoDesdeJid(msg.key.remoteJid ?? '', msg.key.remoteJidAlt, opciones);
    if (!telefono) return null;

    const notaDeVoz = normalizeMessageContent(msg.message)?.audioMessage;
    const segundos = aNumero(msg.messageTimestamp);
    return {
      telefono,
      fromMe: msg.key.fromMe ?? false,
      texto: descripcion.texto,
      whatsappId: msg.key.id ?? null,
      pushName: msg.pushName,
      tipo: descripcion.tipo,
      media: descripcion.media,
      mediaDescarga: serializarParaDescarga(msg, descripcion.campoMedia),
      fecha: segundos ? new Date(segundos * 1000) : null,
      audio: notaDeVoz
        ? {
            mimeType: notaDeVoz.mimetype ?? 'audio/ogg',
            segundos: notaDeVoz.seconds ?? 0,
            descargar: () =>
              downloadMediaMessage(msg, 'buffer', {}, { logger: logBaileys, reuploadRequest: sock.updateMediaMessage }),
          }
        : null,
    };
  }

  /** Telefono de un contacto de la agenda (puede venir con id @lid y el telefono aparte). */
  function telefonoDeContacto(contacto: Partial<Contact>, mapeoLote?: Map<string, string>): string | null {
    if (contacto.phoneNumber?.endsWith('@s.whatsapp.net')) return soloTelefono(contacto.phoneNumber);
    const id = contacto.id ?? '';
    if (id.endsWith('@s.whatsapp.net')) return soloTelefono(id);
    const delLote = mapeoLote?.get(id);
    return delLote ? soloTelefono(delLote) : null;
  }

  function contactosUtiles(lista: Partial<Contact>[], mapeoLote?: Map<string, string>): ContactoAgenda[] {
    const resultado: ContactoAgenda[] = [];
    for (const c of lista) {
      const telefono = telefonoDeContacto(c, mapeoLote);
      const nombreAgenda = c.name?.trim() || null;
      const pushName = c.notify?.trim() || null;
      if (telefono && (nombreAgenda || pushName)) resultado.push({ telefono, nombreAgenda, pushName });
    }
    return resultado;
  }

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    // 'notify' = mensaje nuevo de verdad. 'append' = mensajes viejos que se
    // suman al reconectar (p. ej. enviados desde el telefono mientras el bot
    // estaba apagado): se guardan como historial, sin avisos ni IA.
    if (type === 'notify') {
      for (const msg of messages) {
        void convertir(msg, { esperarMapeo: true }).then((mensaje) => {
          if (mensaje) callbacks.onMensaje(mensaje);
        });
      }
      return;
    }

    void Promise.all(messages.map((msg) => convertir(msg, { esperarMapeo: false })))
      .then((convertidos) => {
        const mensajes = convertidos.filter((m): m is MensajeRecibido => m !== null);
        if (mensajes.length) callbacks.onHistorial({ chats: [], contactos: [], mensajes, progreso: null });
      })
      .catch((err: unknown) => logBaileys.error({ err }, 'No se pudieron procesar mensajes agregados'));
  });

  sock.ev.on('messaging-history.set', ({ chats, contacts, messages, lidPnMappings, progress }) => {
    void (async () => {
      const mapeoLote = new Map((lidPnMappings ?? []).map((m) => [m.lid, m.pn]));

      const chatsUtiles: LoteHistorial['chats'] = [];
      for (const chat of chats) {
        const telefono = await telefonoDesdeJid(chat.id ?? '', null, { esperarMapeo: false, mapeoLote });
        if (telefono) chatsUtiles.push({ telefono, nombre: chat.name ?? null, noLeidos: chat.unreadCount ?? 0 });
      }

      const mensajes: MensajeRecibido[] = [];
      for (const msg of messages) {
        const convertido = await convertir(msg, { esperarMapeo: false, mapeoLote });
        if (convertido) mensajes.push(convertido);
      }

      callbacks.onHistorial({
        chats: chatsUtiles,
        contactos: contactosUtiles(contacts, mapeoLote),
        mensajes,
        progreso: progress ?? null,
      });
    })().catch((err: unknown) => logBaileys.error({ err }, 'No se pudo procesar un lote del historial'));
  });

  sock.ev.on('contacts.upsert', (contactos) => {
    const utiles = contactosUtiles(contactos);
    if (utiles.length) callbacks.onContactos(utiles);
  });

  sock.ev.on('contacts.update', (contactos) => {
    const utiles = contactosUtiles(contactos);
    if (utiles.length) callbacks.onContactos(utiles);
  });

  sock.ev.on('messages.update', (actualizaciones) => {
    for (const { key, update } of actualizaciones) {
      const estado = update.status;
      if (!key.fromMe || !key.id || typeof estado !== 'number' || estado < ESTADO_ENTREGADO) continue;
      callbacks.onEstadoEntrega(key.id, estado >= ESTADO_LEIDO ? 'leido' : 'entregado');
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

/**
 * Baja el archivo de un mensaje guardado (serializado con BufferJSON). Si
 * WhatsApp ya lo borro de su servidor (pasa con mensajes de semanas atras),
 * se le pide al telefono que lo vuelva a subir: para eso hace falta el socket.
 */
export async function descargarMediaGuardada(sock: WASocket | null, serializado: string): Promise<Buffer> {
  const mensaje = JSON.parse(serializado, BufferJSON.reviver) as WAMessage;
  const logDescarga = crearLogger('whatsapp-media');
  return downloadMediaMessage(
    mensaje,
    'buffer',
    {},
    sock ? { logger: logDescarga, reuploadRequest: sock.updateMediaMessage } : undefined,
  );
}
