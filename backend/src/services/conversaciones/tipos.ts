export type AutorMensaje = 'lead' | 'yo' | 'bot';

/** bot: el auto-responder puede contestar aqui. manual: el usuario esta al mando (seccion 3.10). */
export type ModoConversacion = 'bot' | 'manual';

/** Por que se paso a modo manual de forma automatica (null = lo tomo el usuario a proposito). */
export type EscaladoMotivo = 'palabra_clave' | 'baja_confianza';

export type MensajeConversacion = {
  id: number;
  autor: AutorMensaje;
  texto: string;
  creadoEn: string;
};

export type ConversacionResumen = {
  id: number;
  leadId: number | null;
  numeroId: number;
  telefono: string;
  nombreContacto: string | null;
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
