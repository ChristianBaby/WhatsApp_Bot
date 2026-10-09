/**
 * Tipos compartidos del panel. Reflejan las formas que expone el backend
 * (backend/src/services/whatsapp/repositorio.ts es la fuente de verdad
 * para NumeroWhatsapp).
 */

export type EstadoNumero = 'esperando_qr' | 'conectado' | 'desconectado' | 'pausado_error';

export type NumeroWhatsapp = {
  id: number;
  etiqueta: string;
  telefono: string | null;
  estado: EstadoNumero;
  ultimoError: string | null;
  conectadoEn: string | null;
  autoRespuestasActivo: boolean;
  creadoEn: string;
  actualizadoEn: string;
};

// --- Leads (seccion 3.2) ---

export type MotivoExclusion = 'sin_telefono' | 'telefono_invalido' | 'sin_empresa' | 'duplicado';

export type FilaValida = {
  filaNumero: number;
  telefono: string;
  empresa: string;
  rubro: string | null;
  datosExtra: Record<string, string>;
};

export type FilaInvalida = {
  filaNumero: number;
  motivo: MotivoExclusion;
  datoReferencia: string;
};

export type ResumenValidacion = {
  totalFilas: number;
  validas: number;
  invalidas: number;
  duplicadas: number;
};

/** Respuesta de POST /listas-leads/previsualizar: nada se guardo todavia. */
export type PrevisualizacionLista = {
  nombreArchivoOriginal: string;
  /** Copia del archivo guardada al previsualizar; se asocia a la lista al confirmar. */
  archivoToken: string | null;
  resumen: ResumenValidacion;
  columnasExtra: string[];
  filasValidas: FilaValida[];
  filasInvalidas: FilaInvalida[];
};

export type ListaLeads = {
  id: number;
  nombre: string;
  nombreArchivoOriginal: string | null;
  totalFilas: number;
  validas: number;
  invalidas: number;
  duplicadas: number;
  columnasExtra: string[];
  /** Hay copia del archivo original y se puede descargar. */
  tieneArchivo: boolean;
  creadoEn: string;
  actualizadoEn: string;
};

/** Un lead en la gestion de una lista. */
export type LeadGestion = {
  id: number;
  telefono: string;
  empresa: string;
  rubro: string | null;
  datosExtra: Record<string, string>;
  etapaPipeline: string;
  bloqueado: boolean;
  ultimoEnvioEn: string | null;
  /** Ya recibio campanas: no se puede borrar (se perderian sus metricas). */
  tieneHistorial: boolean;
};

export type PaginaLeads = { total: number; leads: LeadGestion[] };

export type ContactoBloqueado = {
  telefono: string;
  motivo: 'pidio_baja' | 'manual';
  textoOrigen: string | null;
  empresa: string | null;
  creadoEn: string;
};

export type LeadExcluido = {
  id: number;
  filaNumero: number;
  motivo: MotivoExclusion;
  datoReferencia: string | null;
};

// --- Publicaciones (secciones 3.3, 3.4, 3.5) ---

export type EstadoPublicacion = 'borrador' | 'programada' | 'en_curso' | 'pausada' | 'completada' | 'cancelada';
export type TipoAdjunto = 'imagen' | 'video';

export type ResumenProgreso = {
  totalDestinatarios: number;
  enviados: number;
  sinWhatsapp: number;
  fallidos: number;
  /** No se les envia: baja, cliente, con asesor, contactado hace poco o repetido. */
  excluidos: number;
  pendientes: number;
};

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

export type PublicacionConProgreso = Publicacion & {
  nombreLista: string;
  progreso: ResumenProgreso;
};

export type MuestraDryRun = {
  empresa: string;
  telefono: string;
  numeroIdAsignado: number;
  mensaje: string;
};

export type ResultadoDryRun = {
  /** Los que realmente recibirían el mensaje (ya sin los excluidos). */
  totalDestinatarios: number;
  /** Motivo -> cantidad de contactos que la campaña no va a contactar. */
  excluidosPorMotivo: Record<string, number>;
  duracionEstimadaMinutos: number;
  muestras: MuestraDryRun[];
};

// --- Respuestas / conversaciones (secciones 3.6, 3.9) ---

export type AutorMensaje = 'lead' | 'yo' | 'bot';

export type MensajeConversacion = {
  id: number;
  autor: AutorMensaje;
  texto: string;
  creadoEn: string;
};

export type ModoConversacion = 'bot' | 'manual';
export type EscaladoMotivo = 'palabra_clave' | 'baja_confianza' | 'limite_respuestas' | 'pidio_baja';

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
  iaSugerencia: string | null;
  iaSugerenciaEn: string | null;
  creadoEn: string;
};

export type ConversacionDetalle = ConversacionResumen & {
  notas: string | null;
  mensajes: MensajeConversacion[];
};

// --- Reportes (seccion 3.7) ---

export type KpisGenerales = {
  mensajesEnviados: number;
  entregados: number;
  leidos: number;
  respondieron: number;
  tasaRespuesta: number;
  tasaLectura: number;
  bajas: number;
  /** Mediana de minutos entre el envio y la primera respuesta. */
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
  /** Texto completo de la plantilla (solo en el desglose por variante). */
  texto: string | null;
  enviados: number;
  leidos: number;
  respondieron: number;
  interesados: number;
  bajas: number;
  tasaRespuesta: number;
};

export type DetalleCampana = {
  porVariante: DesgloseCampana[];
  porNumero: DesgloseCampana[];
  porHora: DesgloseCampana[];
};

export type DatosReportes = {
  kpis: KpisGenerales;
  embudo: EtapaEmbudo[];
  porRubro: RubroResumen[];
  autoResponder: ResumenAutoResponder;
  campanas: CampanaResumen[];
};
