export type AutorMensaje = 'lead' | 'yo' | 'bot';

/** bot: el auto-responder puede contestar aqui. manual: el usuario esta al mando (seccion 3.10). */
export type ModoConversacion = 'bot' | 'manual';

/** Por que se paso a modo manual de forma automatica (null = lo tomo el usuario a proposito). */
export type EscaladoMotivo = 'palabra_clave' | 'baja_confianza' | 'limite_respuestas' | 'pidio_baja';

export type TipoMensaje =
  | 'texto'
  | 'imagen'
  | 'video'
  | 'audio'
  | 'nota_voz'
  | 'documento'
  | 'sticker'
  | 'ubicacion'
  | 'contacto'
  | 'encuesta'
  | 'llamada';

/** Lo necesario para mostrar un adjunto sin descargarlo. */
export type MediaInfo = {
  mime: string | null;
  /** Nombre del archivo (documentos). */
  nombre: string | null;
  segundos: number | null;
  tamano: number | null;
  /** Texto que acompaña a la foto, video o documento. */
  leyenda: string | null;
  /** Medidas de la foto/video: el panel reserva el espacio antes de bajarla (sin saltos al desplazarse). */
  ancho?: number | null;
  alto?: number | null;
  /** Miniatura borrosa que WhatsApp manda con el mensaje (data URL): se ve mientras baja la foto. */
  miniatura?: string | null;
  /** Video que se reproduce como GIF (en bucle, sin sonido). */
  gif?: boolean;
  /** Nota de video (video circular). */
  circular?: boolean;
};

/** Datos propios de cada tipo de mensaje que no son un archivo. */
export type ExtraMensaje = {
  /** Respuesta citada: a que mensaje responde. */
  cita?: { whatsappId: string; autor: 'yo' | 'lead'; texto: string } | null;
  /** 'muchas' = "Reenviado muchas veces" (WhatsApp lo marca a partir de 5 reenvios). */
  reenviado?: 'una' | 'muchas' | null;
  ubicacion?: {
    lat: number;
    lng: number;
    nombre: string | null;
    direccion: string | null;
    enVivo: boolean;
    miniatura: string | null;
  } | null;
  contactos?: { nombre: string; telefonos: string[] }[] | null;
  /** votos: quien (yo / lead) eligio que opciones. Solo llegan con el historial (ver socket.ts). */
  encuesta?: { pregunta: string; opciones: string[]; maxSeleccion: number; votos: Record<string, string[]> } | null;
  enlace?: { url: string; titulo: string | null; descripcion: string | null; miniatura: string | null } | null;
  llamada?: { video: boolean; perdida: boolean } | null;
  /** Foto o video de "ver una vez": WhatsApp no lo entrega a dispositivos vinculados. */
  verUnaVez?: boolean;
  /** Grupos: quien escribio el mensaje. */
  participante?: Participante | null;
};

/** Un integrante de un grupo. jid: como lo identifica WhatsApp (a el van las citas y los checks azules). */
export type Participante = { jid: string; telefono: string | null; nombre: string | null };

/**
 * En un chat 1:1 reacciona cada lado una vez: { yo: '👍', lead: '❤️' }. En
 * un grupo, cada integrante con su telefono: { yo: '👍', '51987654321': '❤️' }.
 */
export type Reacciones = { yo?: string; lead?: string; [participante: string]: string | undefined };

export type EstadoEntrega = 'enviado' | 'entregado' | 'leido';

export type MensajeConversacion = {
  id: number;
  autor: AutorMensaje;
  texto: string;
  tipo: TipoMensaje;
  media: MediaInfo | null;
  estadoEntrega: EstadoEntrega | null;
  creadoEn: string;
  /** Para encontrar en el chat el mensaje que otro cita. */
  whatsappId: string | null;
  extra: ExtraMensaje | null;
  reacciones: Reacciones | null;
  editado: boolean;
  eliminado: boolean;
  /** ⭐ Mensaje destacado (sincronizado con el telefono). */
  destacado: boolean;
};

/** Datos opcionales al guardar un mensaje (adjuntos, historial, check de envio). */
export type ExtrasMensaje = {
  tipo?: TipoMensaje;
  media?: MediaInfo | null;
  extra?: ExtraMensaje | null;
  /** Mensaje original serializado con BufferJSON, para descargar el adjunto despues. */
  mediaDescarga?: string | null;
  mediaArchivo?: string | null;
  estadoEntrega?: EstadoEntrega | null;
  /** Fecha real del mensaje (historial); si falta, now(). */
  creadoEn?: Date | null;
};

export type FiltroConversaciones = 'todos' | 'no_leidos' | 'leads' | 'asesor' | 'grupos' | 'archivados';

export type ConversacionResumen = {
  id: number;
  leadId: number | null;
  numeroId: number;
  /** En un grupo, el jid completo del grupo ("...@g.us"). */
  telefono: string;
  esGrupo: boolean;
  /** 📌 Fijado arriba de la lista (como mucho 3 por numero, igual que WhatsApp). */
  fijado: boolean;
  /** Archivado: sale de la lista normal y queda en "Archivados". */
  archivado: boolean;
  nombreContacto: string | null;
  nombreAgenda: string | null;
  empresa: string | null;
  rubro: string | null;
  etapaPipeline: string | null;
  campanaNombre: string | null;
  noLeidos: number;
  ultimoMensajeEn: string | null;
  ultimoMensajePreview: string | null;
  modo: ModoConversacion;
  escaladoMotivo: EscaladoMotivo | null;
  /** Ultima sugerencia de la IA (interesado / no_interesado / duda_precio): solo sugerencia, nunca se aplica sola. */
  iaSugerencia: string | null;
  iaSugerenciaEn: string | null;
  creadoEn: string;
};

export type ConversacionDetalle = ConversacionResumen & {
  notas: string | null;
};
