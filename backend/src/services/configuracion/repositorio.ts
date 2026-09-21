import { consultar, consultarUno } from '../../db/pool.js';

/**
 * Acceso a la tabla configuracion (clave/valor JSONB). Los valores por
 * defecto ya quedaron insertados en la migracion 001; este modulo solo
 * lee y actualiza, nunca decide los defaults (eso vive en la migracion).
 */

export async function obtenerValor<T>(clave: string): Promise<T | null> {
  const fila = await consultarUno<{ valor: T }>('SELECT valor FROM configuracion WHERE clave = $1', [clave]);
  return fila?.valor ?? null;
}

/** Todas las claves de golpe, como mapa — util para resolver varios valores por defecto a la vez. */
export async function obtenerTodos(): Promise<Record<string, unknown>> {
  const filas = await consultar<{ clave: string; valor: unknown }>('SELECT clave, valor FROM configuracion');
  return Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
}

export async function actualizarValor(clave: string, valor: unknown): Promise<void> {
  await consultarUno('UPDATE configuracion SET valor = $2 WHERE clave = $1', [clave, JSON.stringify(valor)]);
}
