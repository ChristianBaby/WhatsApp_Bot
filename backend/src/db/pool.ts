import pg from 'pg';
import { env } from '../config/env.js';
import { crearLogger } from '../lib/logger.js';

const log = crearLogger('db');

/**
 * Postgres devuelve NUMERIC como texto para no perder precision. Nuestras
 * columnas numeric son porcentajes/promedios que si caben en un number, asi que
 * los convertimos aqui una sola vez en lugar de en cada consulta.
 */
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
// int8 (COUNT(*)) tambien llega como texto.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: env.urlBaseDatos,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  log.error({ err }, 'Error inesperado en un cliente ocioso del pool');
});

/** Consulta simple. Devuelve solo las filas. */
export async function consultar<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const inicio = Date.now();
  const res = await pool.query<T>(sql, params as never[]);
  const ms = Date.now() - inicio;
  if (ms > 500) log.warn({ ms, sql: sql.slice(0, 120) }, 'Consulta lenta');
  return res.rows;
}

/** Devuelve la primera fila, o null si no hay ninguna. */
export async function consultarUno<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const filas = await consultar<T>(sql, params);
  return filas[0] ?? null;
}

/**
 * Ejecuta varias operaciones en una transaccion. Si el callback lanza,
 * se hace ROLLBACK y el error se propaga.
 */
export async function transaccion<T>(fn: (cliente: pg.PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

/** Espera a que Postgres acepte conexiones (el contenedor tarda en arrancar). */
export async function esperarConexion(intentos = 15, esperaMs = 2000): Promise<void> {
  for (let i = 1; i <= intentos; i++) {
    try {
      await pool.query('SELECT 1');
      log.info('Conexion a PostgreSQL establecida');
      return;
    } catch (err) {
      if (i === intentos) throw err;
      log.warn(`PostgreSQL no responde todavia (intento ${i}/${intentos})...`);
      await new Promise((r) => setTimeout(r, esperaMs));
    }
  }
}

export async function cerrarPool(): Promise<void> {
  await pool.end();
}

/**
 * Inserta muchas filas en un solo INSERT (una tupla de placeholders por
 * fila) en vez de una consulta por fila. Se usa al confirmar una carga de
 * leads o al generar los destinatarios de una publicacion: cientos de
 * round-trips uno por uno serian innecesariamente lentos para algo que el
 * usuario espera ver terminar al tiro.
 */
export async function insertarEnBloque(
  cliente: Pick<pg.PoolClient, 'query'>,
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
