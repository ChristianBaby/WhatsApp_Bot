import { consultar, consultarUno, insertarEnBloque, transaccion } from '../../db/pool.js';
import type { FilaInvalida, FilaValida, LeadExcluido, ListaLeads, MotivoExclusion } from './tipos.js';

type FilaListaLeads = {
  id: number;
  nombre: string;
  nombre_archivo_original: string | null;
  total_filas: number;
  validas: number;
  invalidas: number;
  duplicadas: number;
  columnas_extra: string[];
  creado_en: string;
  actualizado_en: string;
};

function mapearLista(fila: FilaListaLeads): ListaLeads {
  return {
    id: fila.id,
    nombre: fila.nombre,
    nombreArchivoOriginal: fila.nombre_archivo_original,
    totalFilas: fila.total_filas,
    validas: fila.validas,
    invalidas: fila.invalidas,
    duplicadas: fila.duplicadas,
    columnasExtra: fila.columnas_extra,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export async function listar(): Promise<ListaLeads[]> {
  const filas = await consultar<FilaListaLeads>('SELECT * FROM listas_leads ORDER BY creado_en DESC');
  return filas.map(mapearLista);
}

export async function obtener(id: number): Promise<ListaLeads | null> {
  const fila = await consultarUno<FilaListaLeads>('SELECT * FROM listas_leads WHERE id = $1', [id]);
  return fila ? mapearLista(fila) : null;
}

type FilaLeadExcluido = {
  id: number;
  fila_numero: number;
  motivo: MotivoExclusion;
  dato_referencia: string | null;
};

/** IDs de todos los leads de una lista, en orden estable (para repartir entre numeros). */
export async function listarIdsPorLista(listaId: number): Promise<number[]> {
  const filas = await consultar<{ id: number }>('SELECT id FROM leads WHERE lista_id = $1 ORDER BY id ASC', [
    listaId,
  ]);
  return filas.map((f) => f.id);
}

export type LeadResumen = {
  id: number;
  telefono: string;
  empresa: string;
  rubro: string | null;
  datosExtra: Record<string, string>;
};

type FilaLead = {
  id: number;
  telefono: string;
  empresa: string;
  rubro: string | null;
  datos_extra: Record<string, string>;
};

/** Leads completos de una lista (para armar publicaciones: dry-run, envio de prueba, destinatarios). */
export async function listarPorLista(listaId: number): Promise<LeadResumen[]> {
  const filas = await consultar<FilaLead>(
    'SELECT id, telefono, empresa, rubro, datos_extra FROM leads WHERE lista_id = $1 ORDER BY id ASC',
    [listaId],
  );
  return filas.map((f) => ({
    id: f.id,
    telefono: f.telefono,
    empresa: f.empresa,
    rubro: f.rubro,
    datosExtra: f.datos_extra,
  }));
}

/**
 * Etapa automatica del mini-CRM (seccion 3.9): al enviarle una campana, un
 * lead nuevo pasa a "contactado". Solo avanza desde 'nuevo' — si ya esta
 * mas adelante en el pipeline (por una campana anterior), no lo retrocede.
 */
export async function marcarContactado(leadId: number): Promise<void> {
  await consultarUno(
    `UPDATE leads SET etapa_pipeline = 'contactado' WHERE id = $1 AND etapa_pipeline = 'nuevo'`,
    [leadId],
  );
}

/** Automatico en cuanto llega su primera respuesta (seccion 3.9). */
export async function marcarRespondio(leadId: number): Promise<void> {
  await consultarUno(
    `UPDATE leads SET etapa_pipeline = 'respondio' WHERE id = $1 AND etapa_pipeline IN ('nuevo', 'contactado')`,
    [leadId],
  );
}

/** Automatico si hay varios intercambios de mensajes con ese lead (seccion 3.9). */
export async function marcarEnConversacion(leadId: number): Promise<void> {
  await consultarUno(
    `UPDATE leads SET etapa_pipeline = 'en_conversacion'
     WHERE id = $1 AND etapa_pipeline IN ('nuevo', 'contactado', 'respondio')`,
    [leadId],
  );
}

export type EtapaManual = 'interesado' | 'no_interesado' | 'duda_precio' | 'venta_concretada' | 'descartado';

/**
 * Cambios de etapa que solo pasan por decision del usuario (seccion 3.9):
 * confirmar o corregir una sugerencia de la IA, o marcar venta concretada /
 * descartado. Nunca se llama desde un flujo automatico del sistema.
 */
export async function actualizarEtapaManual(leadId: number, etapa: EtapaManual): Promise<void> {
  await consultarUno(
    `UPDATE leads
     SET etapa_pipeline = $2,
         venta_concretada_en = CASE WHEN $2 = 'venta_concretada' THEN now() ELSE venta_concretada_en END
     WHERE id = $1`,
    [leadId, etapa],
  );
}

export async function actualizarNotas(leadId: number, notas: string): Promise<void> {
  await consultarUno('UPDATE leads SET notas = $2 WHERE id = $1', [leadId, notas]);
}

export type LeadDetalle = LeadResumen & {
  etapaPipeline: string;
  notas: string | null;
  creadoEn: string;
};

type FilaLeadDetalle = FilaLead & { etapa_pipeline: string; notas: string | null; creado_en: string };

function mapearDetalle(fila: FilaLeadDetalle): LeadDetalle {
  return {
    id: fila.id,
    telefono: fila.telefono,
    empresa: fila.empresa,
    rubro: fila.rubro,
    datosExtra: fila.datos_extra,
    etapaPipeline: fila.etapa_pipeline,
    notas: fila.notas,
    creadoEn: fila.creado_en,
  };
}

// Incluye etapa_pipeline: services/conversaciones/mensajeEntrante.ts la usa
// para no sugerir clasificacion de IA en leads ya cerrados (venta_concretada/descartado).
const SELECT_LEAD_DETALLE = 'SELECT id, telefono, empresa, rubro, datos_extra, etapa_pipeline, notas, creado_en FROM leads';

/** El lead más reciente con ese telefono (puede repetirse entre listas distintas). */
export async function buscarPorTelefono(telefono: string): Promise<LeadDetalle | null> {
  const fila = await consultarUno<FilaLeadDetalle>(
    `${SELECT_LEAD_DETALLE} WHERE telefono = $1 ORDER BY id DESC LIMIT 1`,
    [telefono],
  );
  return fila ? mapearDetalle(fila) : null;
}

export async function obtenerDetalle(leadId: number): Promise<LeadDetalle | null> {
  const fila = await consultarUno<FilaLeadDetalle>(`${SELECT_LEAD_DETALLE} WHERE id = $1`, [leadId]);
  return fila ? mapearDetalle(fila) : null;
}

export async function obtenerExcluidos(listaId: number): Promise<LeadExcluido[]> {
  const filas = await consultar<FilaLeadExcluido>(
    'SELECT * FROM leads_excluidos WHERE lista_id = $1 ORDER BY fila_numero ASC',
    [listaId],
  );
  return filas.map((f) => ({
    id: f.id,
    filaNumero: f.fila_numero,
    motivo: f.motivo,
    datoReferencia: f.dato_referencia,
  }));
}

type DatosCreacionLista = {
  nombre: string;
  nombreArchivoOriginal: string;
  columnasExtra: string[];
  filasValidas: FilaValida[];
  filasInvalidas: FilaInvalida[];
};

export async function crear(datos: DatosCreacionLista): Promise<ListaLeads> {
  const { nombre, nombreArchivoOriginal, columnasExtra, filasValidas, filasInvalidas } = datos;
  const duplicadas = filasInvalidas.filter((f) => f.motivo === 'duplicado').length;
  const totalFilas = filasValidas.length + filasInvalidas.length;

  return transaccion(async (cliente) => {
    const { rows } = await cliente.query<FilaListaLeads>(
      `INSERT INTO listas_leads
         (nombre, nombre_archivo_original, total_filas, validas, invalidas, duplicadas, columnas_extra)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [nombre, nombreArchivoOriginal, totalFilas, filasValidas.length, filasInvalidas.length, duplicadas, columnasExtra],
    );
    const lista = rows[0]!;

    // Postgres tiene un limite de ~65535 parametros por consulta; en lotes
    // de a 500 filas (x6 columnas) nunca nos acercamos, pero se deja la
    // insercion en un solo bloque por simplicidad al volumen esperado (3.2: 50-200).
    await insertarEnBloque(
      cliente,
      'leads',
      ['lista_id', 'telefono', 'empresa', 'rubro', 'datos_extra'],
      filasValidas.map((f) => [lista.id, f.telefono, f.empresa, f.rubro, JSON.stringify(f.datosExtra)]),
    );

    await insertarEnBloque(
      cliente,
      'leads_excluidos',
      ['lista_id', 'fila_numero', 'motivo', 'dato_referencia'],
      filasInvalidas.map((f) => [lista.id, f.filaNumero, f.motivo, f.datoReferencia]),
    );

    return mapearLista(lista);
  });
}
