import { consultar, consultarUno } from '../../db/pool.js';

/** Rubro al que apunta una lista de leads y sus documentos de conocimiento. */
export type Nicho = { id: number; nombre: string };

export async function listar(): Promise<Nicho[]> {
  return consultar<Nicho>('SELECT id, nombre FROM nichos ORDER BY nombre ASC');
}

export async function existe(id: number): Promise<boolean> {
  return Boolean(await consultarUno('SELECT 1 FROM nichos WHERE id = $1', [id]));
}

/** null si ya existe uno con ese nombre (sin distinguir mayusculas). */
export async function crear(nombre: string): Promise<Nicho | null> {
  const repetido = await consultarUno('SELECT 1 FROM nichos WHERE LOWER(nombre) = LOWER($1)', [nombre]);
  if (repetido) return null;
  return consultarUno<Nicho>('INSERT INTO nichos (nombre) VALUES ($1) RETURNING id, nombre', [nombre]);
}
