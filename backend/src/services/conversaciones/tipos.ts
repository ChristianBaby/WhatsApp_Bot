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
  | 'contacto';

/** Lo necesario para mostrar un adjunto sin descargarlo. */
export type MediaInfo = {
  mime: string | null;
  /** Nombre del archivo (documentos). */
  nombre: string | null;
  segundos: number | null;
  tamano: number | null;
  /** Texto que acompaña a la foto, video o documento. */
  leyenda: string | null;
};

export type EstadoEntrega = 'enviado' | 'entregado' | 'leido';

export type MensajeConversacion = {
  id: number;
  autor: AutorMensaje;
  texto: string;
  tipo: TipoMensaje;
  media: MediaInfo | null;
  estadoEntrega: EstadoEntrega | null;
  creadoEn: string;
};

/** Datos opcionales al guardar un mensaje (adjuntos, historial, check de envio). */
export type ExtrasMensaje = {
  tipo?: TipoMensaje;
  media?: MediaInfo | null;
  /** Mensaje original serializado con BufferJSON, para descargar el adjunto despues. */
  mediaDescarga?: string | null;
  mediaArchivo?: string | null;
  estadoEntrega?: EstadoEntrega | null;
  /** Fecha real del mensaje (historial); si falta, now(). */
  creadoEn?: Date | null;
};

export type FiltroConversaciones = 'todos' | 'no_leidos' | 'leads' | 'asesor';

export type ConversacionResumen = {
  id: number;
  leadId: number | null;
  numeroId: number;
  telefono: string;
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
