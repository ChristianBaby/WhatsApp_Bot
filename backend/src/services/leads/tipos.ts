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
  creadoEn: string;
  actualizadoEn: string;
};

export type LeadExcluido = {
  id: number;
  filaNumero: number;
  motivo: MotivoExclusion;
  datoReferencia: string | null;
};
