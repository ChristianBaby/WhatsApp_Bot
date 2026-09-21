import type { PoolClient } from 'pg';
import { consultar, consultarUno, transaccion } from '../../db/pool.js';
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

/**
 * Inserta en bloque: arma un solo INSERT con multiples tuplas de
 * placeholders en vez de una consulta por fila (200 filas = 200 round-trips
 * seria innecesariamente lento para algo que el usuario espera ver al tiro).
 */
async function insertarEnBloque(
  cliente: PoolClient,
  tabla: string,
  columnas: string[],
  filas: unknown[][],
): Promise<void> {
  if (filas.length === 0) return;

  const tuplas: string[] = [];
  const valores: unknown[] = [];
  let contador = 1;

  for (const fila of filas) {
    const marcadores = fila.map(() => `$${contador++}`);
    tuplas.push(`(${marcadores.join(', ')})`);
    valores.push(...fila);
  }

  await cliente.query(
    `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES ${tuplas.join(', ')}`,
    valores as never[],
  );
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
