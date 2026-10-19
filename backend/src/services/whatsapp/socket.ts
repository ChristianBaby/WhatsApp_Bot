import { createHash } from 'node:crypto';
import path from 'node:path';
import QRCode from 'qrcode';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadMediaMessage,
  normalizeMessageContent,
  BufferJSON,
  WAMessageStubType,
  type Contact,
  type WACallEvent,
  type WAMessage,
  type WASocket,
  type proto,
} from 'baileys';
import { env } from '../../config/env.js';
import { crearLogger } from '../../lib/logger.js';
import type { ExtraMensaje, MediaInfo, Participante, Reacciones, TipoMensaje } from '../conversaciones/tipos.js';

/**
 * Una sola conexion de Baileys para UN numero. No sabe nada de reintentos,
 * base de datos ni SSE — solo abre el socket, traduce sus eventos a algo
 * simple (onQr/onConectado/onMensaje/onHistorial...) y expone como cerrarlo.
 * La orquestacion (reintentos, persistencia, notificar al panel) vive en
 * gestor.ts.
 */

export type MensajeRecibido = {
  /** El telefono del contacto, o el jid completo del grupo ("...@g.us"). */
  telefono: string;
  /** Grupos: quien lo escribio (null en mensajes propios y en chats 1:1). */
  participante: Participante | null;
  fromMe: boolean;
  texto: string;
  whatsappId: string | null;
  pushName?: string | null;
  /** El jid tal como llega ("...@s.whatsapp.net" o "...@lid"): a el van las confirmaciones de lectura. */
  jidChat: string | null;
  tipo: TipoMensaje;
  media: MediaInfo | null;
  extra: ExtraMensaje | null;
  /** Reacciones que ya trae un mensaje del historial. */
  reacciones: Reacciones | null;
  /** El mensaje original serializado (BufferJSON): para bajar el adjunto solo cuando alguien lo abre. */
  mediaDescarga: string | null;
  /** Fecha real del mensaje segun WhatsApp. */
  fecha: Date | null;
  /** ⭐ Destacado en el telefono (llega con el historial; en vivo, por messages.update). */
  destacado: boolean;
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
  chats: ({ telefono: string; nombre: string | null; noLeidos: number } & EstadoChat)[];
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
  /** Cualquier mensaje NUEVO de un chat 1:1 o de grupo (entrante o saliente) que pase por esta sesion. */
  onMensaje: (mensaje: MensajeRecibido) => void;
  /** Mensajes viejos (historial del telefono): se guardan sin avisos ni IA. */
  onHistorial: (lote: LoteHistorial) => void;
  /** Nombres de la agenda del telefono que cambiaron o llegaron. */
  onContactos: (contactos: ContactoAgenda[]) => void;
  /** Confirmacion de WhatsApp sobre un mensaje NUESTRO: entregado (✓✓) o leido (✓✓ azul). */
  onEstadoEntrega: (whatsappId: string, estado: 'entregado' | 'leido') => void;
  /** Algo cambio en un mensaje ya guardado: una reaccion, una edicion o se elimino. */
  onCambioMensaje: (cambio: CambioMensaje) => void;
  /** Una llamada entrante ya termino (atendida o perdida). */
  onLlamada: (llamada: LlamadaRecibida) => void;
  /** El contacto esta escribiendo, grabando un audio, en linea o se fue (null). En un grupo, participante es quien. */
  onPresencia: (jid: string, estado: PresenciaContacto, participante?: string) => void;
  /** Nombres de los grupos del numero: al conectar, al entrar a uno nuevo o si le cambian el nombre. */
  onGrupos: (grupos: GrupoWhatsapp[]) => void;
  /** Se fijo/desfijo o archivo/desarchivo un chat (en el telefono, o el eco de lo hecho en el panel). */
  onEstadoChats: (chats: ({ telefono: string; jid: string } & EstadoChat)[]) => void;
};

/** Lo que llega sin tocar queda undefined (no cambia). */
export type EstadoChat = { fijadoEn?: Date | null; archivado?: boolean };

/**
 * Cuando se fijo un chat: WhatsApp manda un numero (segundos en el
 * historial, milisegundos en la sincronizacion en vivo); null/0 = no fijado.
 */
function fechaDeFijado(valor: unknown): Date | null {
  const n = aNumero(valor);
  if (!n) return null;
  return new Date(n > 1e12 ? n : n * 1000);
}

function estadoDeChat(chat: { pinned?: unknown; archived?: boolean | null }): EstadoChat {
  const estado: EstadoChat = {};
  if ('pinned' in chat) estado.fijadoEn = fechaDeFijado(chat.pinned);
  if (typeof chat.archived === 'boolean') estado.archivado = chat.archived;
  return estado;
}

export type GrupoWhatsapp = { jid: string; nombre: string };

export function esJidDeGrupo(jid: string | null | undefined): boolean {
  return Boolean(jid?.endsWith('@g.us'));
}

/** "51987654321:5@s.whatsapp.net" -> "51987654321" (sin dispositivo ni dominio). */
function usuarioDeJid(jid: string | null | undefined): string | null {
  return jid?.split('@')[0]?.split(':')[0] || null;
}

/** Como se identifica a un integrante de grupo en las reacciones: su telefono si se conoce, si no su @lid. */
function claveParticipante(clave: { participant?: string | null; participantAlt?: string | null } | null | undefined): string {
  const alternativo = clave?.participantAlt;
  const jid = alternativo?.endsWith('@s.whatsapp.net') ? alternativo : clave?.participant;
  return usuarioDeJid(jid) ?? 'lead';
}

export type PresenciaContacto = 'escribiendo' | 'grabando' | 'en_linea' | null;

export type CambioMensaje =
  /** emoji null = quito la reaccion. */
  /** quien: 'yo', 'lead' (chat 1:1) o el integrante del grupo (ver claveParticipante). */
  | { tipo: 'reaccion'; whatsappId: string; quien: string; emoji: string | null }
  | { tipo: 'editado'; whatsappId: string; texto: string; leyenda: string | null }
  | { tipo: 'eliminado'; whatsappId: string }
  | { tipo: 'destacado'; whatsappId: string; destacado: boolean };

export type LlamadaRecibida = {
  telefono: string;
  /** Id de la llamada (no es un mensaje: se guarda con el prefijo "llamada-"). */
  id: string;
  fecha: Date;
  video: boolean;
  perdida: boolean;
};

// proto.WebMessageInfo.Status de WhatsApp: 3 = entregado, 4 = leido, 5 = reproducido (audio/video).
const ESTADO_ENTREGADO = 3;
const ESTADO_LEIDO = 4;

/** Si una llamada no avisa como termino, se da por cerrada a los 3 minutos. */
const LLAMADA_MAX_ESPERA_MS = 3 * 60 * 1000;

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
  extra: ExtraMensaje | null;
  /** Campo del mensaje de WhatsApp que tiene el archivo (imageMessage...), si hay. */
  campoMedia: string | null;
};

/** Miniaturas mas grandes no se guardan (van en cada pagina de mensajes que pide el panel). */
const MAX_MINIATURA_BYTES = 15_000;

/** La miniatura que WhatsApp manda dentro del mensaje, como data URL. */
function miniatura(datos: Uint8Array | null | undefined): string | null {
  if (!datos?.length || datos.length > MAX_MINIATURA_BYTES) return null;
  return `data:image/jpeg;base64,${Buffer.from(datos).toString('base64')}`;
}

function infoMedia(datos: {
  mime?: string | null;
  nombre?: string | null;
  segundos?: unknown;
  tamano?: unknown;
  leyenda?: string | null;
  ancho?: unknown;
  alto?: unknown;
  miniatura?: Uint8Array | null;
  gif?: boolean | null;
  circular?: boolean;
}): MediaInfo {
  return {
    mime: datos.mime ?? null,
    nombre: datos.nombre ?? null,
    segundos: aNumero(datos.segundos),
    tamano: aNumero(datos.tamano),
    leyenda: datos.leyenda?.trim() || null,
    ancho: aNumero(datos.ancho),
    alto: aNumero(datos.alto),
    miniatura: miniatura(datos.miniatura),
    ...(datos.gif ? { gif: true } : {}),
    ...(datos.circular ? { circular: true } : {}),
  };
}

/** Telefonos de una tarjeta de contacto (vCard): "TEL;type=CELL;waid=51987654321:+51 987 654 321". */
function telefonosDeVcard(vcard: string | null | undefined): string[] {
  const telefonos: string[] = [];
  for (const linea of (vcard ?? '').split(/\r?\n/)) {
    if (!/^(item\d+\.)?TEL\b/i.test(linea)) continue;
    const valor = linea.slice(linea.lastIndexOf(':') + 1).trim();
    const waid = /waid=(\d+)/i.exec(linea)?.[1];
    const numero = valor || (waid ? `+${waid}` : '');
    if (numero && !telefonos.includes(numero)) telefonos.push(numero);
  }
  return telefonos;
}

/** El contextInfo (cita, reenviado) vive dentro del sub-mensaje, sea cual sea su tipo. */
function contextoDe(m: proto.IMessage): proto.IContextInfo | null {
  for (const valor of Object.values(m)) {
    if (valor && typeof valor === 'object' && 'contextInfo' in valor && valor.contextInfo) {
      return valor.contextInfo as proto.IContextInfo;
    }
  }
  return null;
}

function soloTexto(texto: string): Descripcion {
  return { texto, tipo: 'texto', media: null, extra: null, campoMedia: null };
}

/** El contenido de un mensaje (ya sin envoltorios), sin lo que depende del chat (cita, reenviado). */
export function describirContenido(m: proto.IMessage): Descripcion | null {
  if (m.conversation) return soloTexto(m.conversation);
  if (m.extendedTextMessage?.text) {
    const x = m.extendedTextMessage;
    const url = x.matchedText;
    const enlace =
      url && (x.title || x.description)
        ? { url, titulo: x.title || null, descripcion: x.description || null, miniatura: miniatura(x.jpegThumbnail) }
        : null;
    return { ...soloTexto(x.text ?? ''), extra: enlace ? { enlace } : null };
  }
  if (m.imageMessage) {
    const x = m.imageMessage;
    return {
      texto: x.caption ? `📷 ${x.caption}` : '📷 Imagen',
      tipo: 'imagen',
      media: infoMedia({
        mime: x.mimetype,
        tamano: x.fileLength,
        leyenda: x.caption,
        ancho: x.width,
        alto: x.height,
        miniatura: x.jpegThumbnail,
      }),
      extra: null,
      campoMedia: 'imageMessage',
    };
  }
  const video = m.videoMessage ?? m.ptvMessage;
  if (video) {
    const circular = !m.videoMessage;
    return {
      texto: video.caption ? `🎥 ${video.caption}` : video.gifPlayback ? '🎞️ GIF' : '🎥 Video',
      tipo: 'video',
      media: infoMedia({
        mime: video.mimetype,
        segundos: video.seconds,
        tamano: video.fileLength,
        leyenda: video.caption,
        ancho: video.width,
        alto: video.height,
        miniatura: video.jpegThumbnail,
        gif: video.gifPlayback,
        circular,
      }),
      extra: null,
      campoMedia: circular ? 'ptvMessage' : 'videoMessage',
    };
  }
  if (m.audioMessage) {
    const x = m.audioMessage;
    return {
      texto: x.ptt ? '🎤 Audio de voz' : '🎵 Audio',
      tipo: x.ptt ? 'nota_voz' : 'audio',
      media: infoMedia({ mime: x.mimetype, segundos: x.seconds, tamano: x.fileLength }),
      extra: null,
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
      extra: null,
      campoMedia: 'documentMessage',
    };
  }
  if (m.stickerMessage) {
    const x = m.stickerMessage;
    return {
      texto: '💟 Sticker',
      tipo: 'sticker',
      media: infoMedia({ mime: x.mimetype, tamano: x.fileLength }),
      extra: null,
      campoMedia: 'stickerMessage',
    };
  }
  const ubicacion = m.locationMessage ?? m.liveLocationMessage;
  if (ubicacion) {
    const enVivo = !m.locationMessage;
    const nombre = m.locationMessage?.name || null;
    const direccion = m.locationMessage?.address || null;
    const lugar = [nombre, direccion].filter(Boolean).join(', ');
    const lat = aNumero(ubicacion.degreesLatitude);
    const lng = aNumero(ubicacion.degreesLongitude);
    return {
      texto: `📍 ${enVivo ? 'Ubicación en tiempo real' : 'Ubicación'}${lugar ? `: ${lugar}` : ''}`,
      tipo: 'ubicacion',
      media: null,
      extra:
        lat !== null && lng !== null
          ? { ubicacion: { lat, lng, nombre, direccion, enVivo, miniatura: miniatura(ubicacion.jpegThumbnail) } }
          : null,
      campoMedia: null,
    };
  }
  if (m.contactMessage || m.contactsArrayMessage) {
    const tarjetas = m.contactMessage ? [m.contactMessage] : (m.contactsArrayMessage?.contacts ?? []);
    const contactos = tarjetas.map((c) => ({ nombre: c.displayName || 'Contacto', telefonos: telefonosDeVcard(c.vcard) }));
    const nombres = contactos.map((c) => c.nombre).join(', ');
    return {
      texto: `👤 ${contactos.length > 1 ? 'Contactos' : 'Contacto'}: ${nombres || 'compartido'}`,
      tipo: 'contacto',
      media: null,
      extra: { contactos },
      campoMedia: null,
    };
  }
  const encuesta = m.pollCreationMessage ?? m.pollCreationMessageV2 ?? m.pollCreationMessageV3;
  if (encuesta) {
    const opciones = (encuesta.options ?? []).map((o) => o.optionName ?? '').filter(Boolean);
    const pregunta = encuesta.name ?? 'Encuesta';
    return {
      texto: `📊 Encuesta: ${pregunta}`,
      tipo: 'encuesta',
      media: null,
      extra: { encuesta: { pregunta, opciones, maxSeleccion: encuesta.selectableOptionsCount ?? 0, votos: {} } },
      campoMedia: null,
    };
  }

  // Mensajes de cuentas de empresa (botones, listas, catalogo): se muestran como texto.
  const textoEmpresa =
    m.buttonsResponseMessage?.selectedDisplayText ??
    m.templateButtonReplyMessage?.selectedDisplayText ??
    m.listResponseMessage?.title ??
    m.interactiveResponseMessage?.body?.text ??
    m.buttonsMessage?.contentText ??
    m.templateMessage?.hydratedTemplate?.hydratedContentText ??
    m.interactiveMessage?.body?.text ??
    (m.listMessage ? [m.listMessage.title, m.listMessage.description].filter(Boolean).join('\n') : null);
  if (textoEmpresa) return soloTexto(textoEmpresa);
  if (m.productMessage) return soloTexto(`🛍️ Producto: ${m.productMessage.product?.title ?? 'del catálogo'}`);
  if (m.orderMessage) return soloTexto(`🛒 Pedido${m.orderMessage.itemCount ? ` (${m.orderMessage.itemCount} productos)` : ''}`);
  if (m.eventMessage) return soloTexto(`📅 Evento: ${m.eventMessage.name ?? ''}`.trim());
  return null;
}

const LLAMADAS_PERDIDAS = new Set<number>([WAMessageStubType.CALL_MISSED_VOICE, WAMessageStubType.CALL_MISSED_VIDEO]);
const REENVIADO_MUCHAS_VECES = 5;

/**
 * Que es un mensaje de WhatsApp y como mostrarlo. Devuelve null para eventos
 * sin contenido para el chat (reacciones, ediciones y eliminaciones — esas
 * llegan por messages.reaction / messages.update — y mensajes de protocolo).
 *
 * conLlamadas: en el historial, las llamadas perdidas vienen como mensajes de
 * sistema; en vivo llegan por el evento 'call' (no se cuentan dos veces).
 * esMio: si un jid es el propio numero (para saber de quien es lo citado).
 */
export function describirMensaje(msg: WAMessage, conLlamadas: boolean, esMio: (jid: string) => boolean): Descripcion | null {
  if (conLlamadas && msg.messageStubType != null && LLAMADAS_PERDIDAS.has(msg.messageStubType)) {
    const video = msg.messageStubType === WAMessageStubType.CALL_MISSED_VIDEO;
    return {
      texto: video ? '📹 Videollamada perdida' : '📞 Llamada perdida',
      tipo: 'llamada',
      media: null,
      extra: { llamada: { video, perdida: true } },
      campoMedia: null,
    };
  }

  const crudo = msg.message;
  if (!crudo) return null;
  const m = normalizeMessageContent(crudo);
  if (!m) return null;

  // "Ver una vez": WhatsApp no entrega el archivo a los dispositivos vinculados.
  const unaVez = crudo.viewOnceMessage ?? crudo.viewOnceMessageV2 ?? crudo.viewOnceMessageV2Extension;
  if (unaVez || m.imageMessage?.viewOnce || m.videoMessage?.viewOnce || m.audioMessage?.viewOnce) {
    const que = m.videoMessage ? 'Video' : m.audioMessage ? 'Audio' : 'Foto';
    return { ...soloTexto(`👁 ${que} de ver una vez`), extra: { verUnaVez: true } };
  }

  const descripcion = describirContenido(m);
  if (!descripcion) return null;

  const ctx = contextoDe(m);
  const extra: ExtraMensaje = { ...descripcion.extra };
  if (ctx?.stanzaId && ctx.quotedMessage) {
    const citado = describirContenido(normalizeMessageContent(ctx.quotedMessage) ?? ctx.quotedMessage);
    extra.cita = {
      whatsappId: ctx.stanzaId,
      autor: ctx.participant && esMio(ctx.participant) ? 'yo' : 'lead',
      texto: citado?.texto ?? 'Mensaje',
    };
  }
  if (ctx?.isForwarded) extra.reenviado = (ctx.forwardingScore ?? 0) >= REENVIADO_MUCHAS_VECES ? 'muchas' : 'una';

  return { ...descripcion, extra: Object.keys(extra).length ? extra : null };
}

/** Reacciones que trae un mensaje del historial (en vivo llegan por messages.reaction). */
export function reaccionesDeHistorial(msg: WAMessage): Reacciones | null {
  const reacciones: Reacciones = {};
  const enGrupo = esJidDeGrupo(msg.key.remoteJid);
  for (const r of msg.reactions ?? []) {
    const quien = r.key?.fromMe ? 'yo' : enGrupo ? claveParticipante(r.key) : 'lead';
    // Texto vacio = quito su reaccion.
    if (r.text) reacciones[quien] = r.text;
    else delete reacciones[quien];
  }
  return Object.keys(reacciones).length ? reacciones : null;
}

/**
 * Votos de una encuesta que vienen con el historial (ya descifrados). Cada
 * opcion elegida llega como el SHA-256 de su nombre. En vivo los votos
 * llegan cifrados y Baileys 7 tiene su descifrado desactivado: por eso solo
 * se ven los del historial.
 */
export function votosDeHistorial(msg: WAMessage, opciones: string[]): Record<string, string[]> {
  const porHash = new Map(opciones.map((o) => [createHash('sha256').update(o).digest('hex'), o]));
  const ultimos: Record<string, { momento: number; elegidas: string[] }> = {};
  for (const voto of msg.pollUpdates ?? []) {
    const quien = voto.pollUpdateMessageKey?.fromMe ? 'yo' : 'lead';
    const momento = aNumero(voto.senderTimestampMs) ?? 0;
    if ((ultimos[quien]?.momento ?? -1) > momento) continue;
    const elegidas = (voto.vote?.selectedOptions ?? [])
      .map((hash) => porHash.get(Buffer.from(hash).toString('hex')))
      .filter((o): o is string => Boolean(o));
    ultimos[quien] = { momento, elegidas };
  }
  return Object.fromEntries(Object.entries(ultimos).map(([quien, v]) => [quien, v.elegidas]));
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

  /** Si un jid (telefono o @lid) es el propio numero vinculado. */
  function esMio(jid: string): boolean {
    const id = soloTelefono(jid);
    if (!id) return false;
    return [sock.user?.id, sock.user?.lid].some((propio) => propio && soloTelefono(propio) === id);
  }

  /** Quien escribio un mensaje de grupo: su jid, su telefono (si se puede saber) y su nombre de WhatsApp. */
  async function participanteDe(
    msg: WAMessage,
    opciones: { mapeoLote?: Map<string, string> },
  ): Promise<Participante | null> {
    const jid = msg.key.participant;
    if (!jid) return null;
    // Sin esperas: un integrante sin telefono conocido igual se muestra (con su nombre).
    const telefono = await telefonoDesdeJid(jid, msg.key.participantAlt, { esperarMapeo: false, mapeoLote: opciones.mapeoLote });
    return { jid, telefono, nombre: msg.pushName?.trim() || null };
  }

  /** Convierte un mensaje de WhatsApp en algo guardable; null si no es de un chat 1:1 o de grupo, o no tiene contenido. */
  async function convertir(
    msg: WAMessage,
    opciones: { esperarMapeo: boolean; mapeoLote?: Map<string, string> },
  ): Promise<MensajeRecibido | null> {
    // Llamadas perdidas como mensaje de sistema: solo en el historial (en vivo llegan por 'call').
    const descripcion = describirMensaje(msg, !opciones.esperarMapeo, esMio);
    if (!descripcion) return null; // reaccion, recibo de lectura, etc. — nada que guardar

    const remoteJid = msg.key.remoteJid ?? '';
    const enGrupo = esJidDeGrupo(remoteJid);
    const telefono = enGrupo ? remoteJid : await telefonoDesdeJid(remoteJid, msg.key.remoteJidAlt, opciones);
    if (!telefono) return null;
    const participante = enGrupo && !msg.key.fromMe ? await participanteDe(msg, opciones) : null;
    if (enGrupo && !msg.key.fromMe && !participante) return null;

    const encuesta = descripcion.extra?.encuesta;
    if (encuesta) encuesta.votos = votosDeHistorial(msg, encuesta.opciones);

    const notaDeVoz = normalizeMessageContent(msg.message)?.audioMessage;
    const segundos = aNumero(msg.messageTimestamp);
    return {
      telefono,
      participante,
      fromMe: msg.key.fromMe ?? false,
      texto: descripcion.texto,
      whatsappId: msg.key.id ?? null,
      pushName: msg.pushName,
      jidChat: msg.key.remoteJid ?? null,
      tipo: descripcion.tipo,
      media: descripcion.media,
      extra: descripcion.extra,
      reacciones: reaccionesDeHistorial(msg),
      mediaDescarga: serializarParaDescarga(msg, descripcion.campoMedia),
      fecha: segundos ? new Date(segundos * 1000) : null,
      destacado: Boolean(msg.starred),
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
        // El nombre de un grupo es su asunto: viene en chat.name.
        const telefono = esJidDeGrupo(chat.id)
          ? chat.id
          : await telefonoDesdeJid(chat.id ?? '', null, { esperarMapeo: false, mapeoLote });
        if (telefono) {
          chatsUtiles.push({ telefono, nombre: chat.name ?? null, noLeidos: chat.unreadCount ?? 0, ...estadoDeChat(chat) });
        }
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
      if (!key.id) continue;

      // Baileys ya traduce el mensaje de protocolo "eliminar para todos" / "editar" a esto.
      if (update.message === null && update.messageStubType === WAMessageStubType.REVOKE) {
        callbacks.onCambioMensaje({ tipo: 'eliminado', whatsappId: key.id });
        continue;
      }
      const editado = update.message?.editedMessage?.message;
      if (editado) {
        const nuevo = describirContenido(normalizeMessageContent(editado) ?? editado);
        if (nuevo) {
          callbacks.onCambioMensaje({
            tipo: 'editado',
            whatsappId: key.id,
            texto: nuevo.texto,
            // Si se edito la leyenda de una foto puede llegar como texto suelto.
            leyenda: nuevo.media ? nuevo.media.leyenda : nuevo.texto,
          });
        }
        continue;
      }

      // ⭐ destacado / sin destacar desde el telefono (o el eco del panel).
      if (typeof update.starred === 'boolean') {
        callbacks.onCambioMensaje({ tipo: 'destacado', whatsappId: key.id, destacado: update.starred });
      }

      const estado = update.status;
      if (!key.fromMe || typeof estado !== 'number' || estado < ESTADO_ENTREGADO) continue;
      callbacks.onEstadoEntrega(key.id, estado >= ESTADO_LEIDO ? 'leido' : 'entregado');
    }
  });

  sock.ev.on('messages.reaction', (reacciones) => {
    for (const { key, reaction } of reacciones) {
      if (!key.id) continue;
      const quien = reaction.key?.fromMe
        ? 'yo'
        : esJidDeGrupo(key.remoteJid)
          ? claveParticipante(reaction.key)
          : 'lead';
      callbacks.onCambioMensaje({ tipo: 'reaccion', whatsappId: key.id, quien, emoji: reaction.text || null });
    }
  });

  // Nombres de los grupos: todos al conectar, y despues los que cambian o los nuevos.
  function avisarGrupos(lista: { id?: string | null; subject?: string | null }[]): void {
    const grupos = lista
      .filter((g): g is { id: string; subject: string } => esJidDeGrupo(g.id) && Boolean(g.subject?.trim()))
      .map((g) => ({ jid: g.id, nombre: g.subject.trim() }));
    if (grupos.length) callbacks.onGrupos(grupos);
  }

  sock.ev.on('connection.update', ({ connection }) => {
    if (connection !== 'open') return;
    sock
      .groupFetchAllParticipating()
      .then((grupos) => avisarGrupos(Object.values(grupos)))
      .catch((err: unknown) => logBaileys.warn({ err }, 'No se pudieron leer los nombres de los grupos'));
  });
  sock.ev.on('groups.upsert', avisarGrupos);
  sock.ev.on('groups.update', avisarGrupos);

  // Fijado y archivado de los chats: llegan de la sincronizacion con el telefono.
  function avisarEstadoChats(lista: { id?: string | null; pinned?: unknown; archived?: boolean | null }[]): void {
    void (async () => {
      const cambios: ({ telefono: string; jid: string } & EstadoChat)[] = [];
      for (const chat of lista) {
        const estado = estadoDeChat(chat);
        if (!chat.id || (estado.fijadoEn === undefined && estado.archivado === undefined)) continue;
        const telefono = esJidDeGrupo(chat.id) ? chat.id : await telefonoDesdeJid(chat.id, null, { esperarMapeo: false });
        if (telefono) cambios.push({ telefono, jid: chat.id, ...estado });
      }
      if (cambios.length) callbacks.onEstadoChats(cambios);
    })().catch((err: unknown) => logBaileys.warn({ err }, 'No se pudo leer el fijado/archivado de los chats'));
  }
  sock.ev.on('chats.update', avisarEstadoChats);
  sock.ev.on('chats.upsert', avisarEstadoChats);

  // Llamadas entrantes: suenan aca tambien (como en WhatsApp Web). Se guarda
  // una sola entrada en el chat cuando la llamada termina: atendida o perdida.
  const llamadas = new Map<string, { evento: WACallEvent; atendida: boolean; limite: NodeJS.Timeout }>();

  function cerrarLlamada(id: string): void {
    const llamada = llamadas.get(id);
    if (!llamada) return;
    clearTimeout(llamada.limite);
    llamadas.delete(id);
    const { evento, atendida } = llamada;
    void telefonoDesdeJid(evento.from, evento.callerPn ?? null)
      .then((telefono) => {
        if (!telefono) return;
        callbacks.onLlamada({ telefono, id, fecha: evento.date, video: Boolean(evento.isVideo), perdida: !atendida });
      })
      .catch((err: unknown) => logBaileys.error({ err }, 'No se pudo registrar una llamada'));
  }

  sock.ev.on('call', (eventos) => {
    for (const evento of eventos) {
      if (evento.isGroup) continue;
      if (evento.status === 'offer' || evento.status === 'ringing') {
        if (!llamadas.has(evento.id)) {
          llamadas.set(evento.id, {
            evento,
            atendida: false,
            // Por si WhatsApp no avisa como termino.
            limite: setTimeout(() => cerrarLlamada(evento.id), LLAMADA_MAX_ESPERA_MS),
          });
        }
        continue;
      }
      const llamada = llamadas.get(evento.id);
      if (!llamada) continue;
      if (evento.status === 'accept') llamada.atendida = true;
      else cerrarLlamada(evento.id); // timeout, reject, terminate
    }
  });

  sock.ev.on('presence.update', ({ id, presences }) => {
    const enGrupo = esJidDeGrupo(id);
    if (!enGrupo && !id.endsWith('@s.whatsapp.net') && !id.endsWith('@lid')) return;
    for (const [participante, presencia] of Object.entries(presences)) {
      if (enGrupo && esMio(participante)) continue;
      const ultima = presencia.lastKnownPresence;
      const estado: PresenciaContacto =
        ultima === 'composing' ? 'escribiendo' : ultima === 'recording' ? 'grabando' : ultima === 'available' ? 'en_linea' : null;
      // En un grupo "en linea" no dice nada: solo quien esta escribiendo o grabando.
      if (enGrupo) callbacks.onPresencia(id, estado === 'en_linea' ? null : estado, participante);
      else callbacks.onPresencia(id, estado);
    }
  });

  return {
    sock,
    cerrar: () => {
      for (const { limite } of llamadas.values()) clearTimeout(limite);
      llamadas.clear();
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
