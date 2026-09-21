export type EstadoPublicacion = 'borrador' | 'programada' | 'en_curso' | 'pausada' | 'completada' | 'cancelada';
export type EstadoDestinatario = 'pendiente' | 'enviado' | 'sin_whatsapp' | 'fallido';
export type TipoAdjunto = 'imagen' | 'video';

export type Publicacion = {
  id: number;
  nombre: string;
  listaId: number;
  variantesMensaje: string[];
  adjuntoRuta: string | null;
  adjuntoTipo: TipoAdjunto | null;
  adjuntoNombreOriginal: string | null;
  catalogoUrl: string | null;
  numeroIds: number[];
  programadaPara: string;
  pausaMinSegundos: number | null;
  pausaMaxSegundos: number | null;
  tamanoLote: number | null;
  pausaEntreLotesMinutos: number | null;
  horarioInicio: string | null;
  horarioFin: string | null;
  maxMensajes: number | null;
  estado: EstadoPublicacion;
  motivoPausa: string | null;
  enviadosLoteActual: number;
  iniciadaEn: string | null;
  finalizadaEn: string | null;
  creadoEn: string;
  actualizadoEn: string;
};

export type ResumenProgreso = {
  totalDestinatarios: number;
  enviados: number;
  sinWhatsapp: number;
  fallidos: number;
  pendientes: number;
};

export type PublicacionConProgreso = Publicacion & {
  nombreLista: string;
  progreso: ResumenProgreso;
};

/** Ritmo anti-bloqueo ya resuelto: overrides de la publicacion + defaults globales. */
export type ConfigEnvio = {
  pausaMinSegundos: number;
  pausaMaxSegundos: number;
  tamanoLote: number;
  pausaEntreLotesMinutos: number;
  horarioInicio: string;
  horarioFin: string;
  maxMensajes: number;
};

export type DatosCreacionPublicacion = {
  nombre: string;
  listaId: number;
  variantesMensaje: string[];
  adjuntoRuta: string | null;
  adjuntoTipo: TipoAdjunto | null;
  adjuntoNombreOriginal: string | null;
  catalogoUrl: string | null;
  numeroIds: number[];
  programadaPara: string;
  pausaMinSegundos: number | null;
  pausaMaxSegundos: number | null;
  tamanoLote: number | null;
  pausaEntreLotesMinutos: number | null;
  horarioInicio: string | null;
  horarioFin: string | null;
  maxMensajes: number | null;
  estado: 'borrador' | 'programada';
};
