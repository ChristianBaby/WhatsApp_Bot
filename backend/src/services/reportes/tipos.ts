/** Todos los reportes se pueden filtrar por rango de fecha y/o rubro (seccion 3.7). */
export type FiltrosReportes = {
  desde: string | null;
  hasta: string | null;
  rubro: string | null;
};

/**
 * KPIs sobre los ENVIOS del periodo (no sobre la etapa actual del lead):
 * una respuesta cuenta para el envio al que responde, dentro de 30 dias.
 * entregados/leidos existen solo para envios hechos desde la Fase 2.
 */
export type KpisGenerales = {
  mensajesEnviados: number;
  entregados: number;
  leidos: number;
  respondieron: number;
  tasaRespuesta: number;
  tasaLectura: number;
  bajas: number;
  /** Mediana, en minutos, entre el envio y la primera respuesta. */
  tiempoRespuestaMinutos: number | null;
  ventasConcretadas: number;
  tasaConversion: number;
};

export type EtapaEmbudo = {
  etapa: string;
  valor: number;
  pct: number;
};

export type RubroResumen = {
  rubro: string;
  leads: number;
  ventas: number;
};

export type ResumenAutoResponder = {
  atendidasPorBot: number;
  escaladasAAsesor: number;
  palabraMasUsada: { palabra: string; veces: number } | null;
};

export type CampanaResumen = {
  id: number;
  nombre: string;
  estado: string;
  fecha: string | null;
  enviados: number;
  entregados: number;
  leidos: number;
  respondieron: number;
  bajas: number;
  sinWhatsapp: number;
  fallidos: number;
  excluidos: number;
  tasaRespuesta: number;
  tiempoRespuestaMinutos: number | null;
  duracionMinutos: number | null;
};

export type DesgloseCampana = {
  clave: string;
  enviados: number;
  leidos: number;
  respondieron: number;
  tasaRespuesta: number;
};

/** Detalle de una campana: que variante, que numero y que hora funcionan mejor. */
export type DetalleCampana = {
  porVariante: DesgloseCampana[];
  porNumero: DesgloseCampana[];
  porHora: DesgloseCampana[];
};

export type FilaLogCampana = {
  empresa: string;
  telefono: string;
  estado: string;
  motivoFallo: string | null;
  enviadoEn: string | null;
  entregadoEn: string | null;
  leidoEn: string | null;
  respondioEn: string | null;
};
