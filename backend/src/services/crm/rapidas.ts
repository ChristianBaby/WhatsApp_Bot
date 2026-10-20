import { consultar, consultarUno } from '../../db/pool.js';
import { conflicto, noEncontrado } from '../../lib/errors.js';
import { emitir } from '../../lib/sse.js';

/**
 * Respuestas rapidas: textos guardados que se insertan en el chat
 * escribiendo "/" y su atajo (como en WhatsApp Business). {nombre} se
 * reemplaza en el panel por el nombre del cliente.
 */

export type RespuestaRapida = { id: number; atajo: string; texto: string };

const emitirCambio = () => emitir('conversaciones', 'rapidas:actualizadas', {});

/** "/Precios web" -> "precios-web": sin barra, sin espacios, en minusculas. */
export function normalizarAtajo(atajo: string): string {
  return atajo
    .trim()
    .replace(/^\/+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
}

export async function listar(): Promise<RespuestaRapida[]> {
  return consultar<RespuestaRapida>('SELECT id, atajo, texto FROM respuestas_rapidas ORDER BY lower(atajo)');
}

async function atajoOcupado(atajo: string, exceptoId: number | null): Promise<boolean> {
  return Boolean(
    await consultarUno('SELECT 1 FROM respuestas_rapidas WHERE lower(atajo) = lower($1) AND id <> COALESCE($2, 0)', [atajo, exceptoId]),
  );
}

export async function crear(atajo: string, texto: string): Promise<RespuestaRapida> {
  const limpio = normalizarAtajo(atajo);
  if (await atajoOcupado(limpio, null)) throw conflicto(`Ya existe el atajo /${limpio}`);
  const fila = await consultarUno<RespuestaRapida>(
    'INSERT INTO respuestas_rapidas (atajo, texto) VALUES ($1, $2) RETURNING id, atajo, texto',
    [limpio, texto],
  );
  emitirCambio();
  return fila!;
}

export async function editar(id: number, atajo: string, texto: string): Promise<RespuestaRapida> {
  const limpio = normalizarAtajo(atajo);
  if (await atajoOcupado(limpio, id)) throw conflicto(`Ya existe el atajo /${limpio}`);
  const fila = await consultarUno<RespuestaRapida>(
    'UPDATE respuestas_rapidas SET atajo = $2, texto = $3, actualizado_en = now() WHERE id = $1 RETURNING id, atajo, texto',
    [id, limpio, texto],
  );
  if (!fila) throw noEncontrado('Respuesta rápida no encontrada');
  emitirCambio();
  return fila;
}

export async function eliminar(id: number): Promise<void> {
  const fila = await consultarUno('DELETE FROM respuestas_rapidas WHERE id = $1 RETURNING id', [id]);
  if (!fila) throw noEncontrado('Respuesta rápida no encontrada');
  emitirCambio();
}
