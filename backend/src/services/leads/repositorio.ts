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
