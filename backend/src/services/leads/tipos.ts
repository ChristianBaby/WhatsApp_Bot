/**
 * Tipos compartidos por todo el flujo de carga de leads: parseo del
 * archivo -> validacion/normalizacion -> persistencia.
 */

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

export type ResultadoValidacion = {
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
  /** Hay una copia del archivo subido y se puede descargar. */
  tieneArchivo: boolean;
  creadoEn: string;
  actualizadoEn: string;
};

/** Un lead tal como se ve en la gestion de una lista. */
export type LeadGestion = {
  id: number;
  telefono: string;
  empresa: string;
  rubro: string | null;
  datosExtra: Record<string, string>;
  etapaPipeline: string;
  bloqueado: boolean;
  ultimoEnvioEn: string | null;
  /** Ya se le envio una campana: no se puede borrar sin perder metricas. */
  tieneHistorial: boolean;
};

export type DatosLead = {
  telefono: string;
  empresa: string;
  rubro: string | null;
};

export type LeadExcluido = {
  id: number;
  filaNumero: number;
  motivo: MotivoExclusion;
  datoReferencia: string | null;
};
