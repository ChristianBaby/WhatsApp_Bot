/** Todos los reportes se pueden filtrar por rango de fecha y/o rubro (seccion 3.7). */
export type FiltrosReportes = {
  desde: string | null;
  hasta: string | null;
  rubro: string | null;
};

export type KpisGenerales = {
  mensajesEnviados: number;
  tasaRespuesta: number;
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
  fecha: string | null;
  enviados: number;
  sinWhatsapp: number;
  fallidos: number;
  tasaRespuesta: number;
  duracionMinutos: number | null;
};

export type FilaLogCampana = {
  empresa: string;
  telefono: string;
  estado: string;
  motivoFallo: string | null;
  enviadoEn: string | null;
};
