import { consultar, consultarUno } from '../../db/pool.js';
import { conflicto, noEncontrado } from '../../lib/errors.js';
import { crearLogger } from '../../lib/logger.js';
import { emitir } from '../../lib/sse.js';
import * as conversacionesRepo from '../conversaciones/repositorio.js';
import type { EtiquetaChat } from '../conversaciones/tipos.js';
import { editarEtiquetaWhatsapp, etiquetarChatWhatsapp, jidDeTelefono } from '../whatsapp/envio.js';
import type { EtiquetaWhatsapp } from '../whatsapp/socket.js';

/**
 * Etiquetas de los chats ("Cliente nuevo", "Pagó", "Seguimiento"...). Viven
 * en el panel y, si el numero es WhatsApp Business, se sincronizan con las
 * etiquetas del telefono en los dos sentidos. En un WhatsApp normal no
 * existen etiquetas: ahi quedan solo en el panel.
 */

const log = crearLogger('crm-etiquetas');
const CANAL_SSE = 'conversaciones';
/** WhatsApp tiene 20 colores de etiqueta. */
export const COLORES = 20;

export type Etiqueta = EtiquetaChat & { chats: number };

export async function listar(): Promise<Etiqueta[]> {
  return consultar<Etiqueta>(
    `SELECT e.id, e.nombre, e.color, (SELECT COUNT(*)::int FROM conversacion_etiquetas ce WHERE ce.etiqueta_id = e.id) AS chats
     FROM etiquetas e ORDER BY lower(e.nombre)`,
  );
}

async function obtener(id: number): Promise<EtiquetaChat> {
  const fila = await consultarUno<EtiquetaChat>('SELECT id, nombre, color FROM etiquetas WHERE id = $1', [id]);
  if (!fila) throw noEncontrado('Etiqueta no encontrada');
  return fila;
}

async function nombreOcupado(nombre: string, exceptoId: number | null): Promise<boolean> {
  return Boolean(
    await consultarUno('SELECT 1 FROM etiquetas WHERE lower(nombre) = lower($1) AND id <> COALESCE($2, 0)', [nombre, exceptoId]),
  );
}

function emitirEtiquetas(): void {
  void listar()
    .then((etiquetas) => emitir(CANAL_SSE, 'etiquetas:actualizadas', etiquetas))
    .catch((err: unknown) => log.warn({ err }, 'No se pudo avisar el cambio de etiquetas'));
}

async function emitirChats(ids: number[]): Promise<void> {
  for (const id of ids) {
    const detalle = await conversacionesRepo.obtenerDetalle(id);
    if (detalle) emitir(CANAL_SSE, 'conversacion:actualizada', detalle);
  }
}

/** Numeros Business conectados donde ya existe esta etiqueta (con su id de WhatsApp). */
async function enWhatsapp(etiquetaId: number): Promise<{ numeroId: number; waId: string }[]> {
  return consultar<{ numeroId: number; waId: string }>(
    `SELECT ew.numero_id AS "numeroId", ew.wa_id AS "waId" FROM etiquetas_whatsapp ew
     JOIN numeros_whatsapp n ON n.id = ew.numero_id WHERE ew.etiqueta_id = $1 AND n.es_business`,
    [etiquetaId],
  );
}

async function esBusiness(numeroId: number): Promise<boolean> {
  const fila = await consultarUno<{ es_business: boolean }>('SELECT es_business FROM numeros_whatsapp WHERE id = $1', [numeroId]);
  return Boolean(fila?.es_business);
}

/**
 * El id de WhatsApp de la etiqueta en ese numero; si todavia no existe en el
 * telefono, se crea ahi (con el siguiente id libre de esa cuenta).
 */
async function asegurarEnWhatsapp(etiqueta: EtiquetaChat, numeroId: number): Promise<string> {
  const existente = await consultarUno<{ wa_id: string }>(
    'SELECT wa_id FROM etiquetas_whatsapp WHERE etiqueta_id = $1 AND numero_id = $2',
    [etiqueta.id, numeroId],
  );
  if (existente) return existente.wa_id;
  const maximo = await consultarUno<{ maximo: number | null }>(
    `SELECT MAX(wa_id::bigint) AS maximo FROM etiquetas_whatsapp WHERE numero_id = $1 AND wa_id ~ '^[0-9]+$'`,
    [numeroId],
  );
  // Las predefinidas de WhatsApp Business ocupan los primeros ids.
  const waId = String(Math.max(Number(maximo?.maximo ?? 0), 10) + 1);
  await editarEtiquetaWhatsapp(numeroId, { waId, nombre: etiqueta.nombre, color: etiqueta.color });
  await consultarUno('INSERT INTO etiquetas_whatsapp (etiqueta_id, numero_id, wa_id) VALUES ($1, $2, $3)', [
    etiqueta.id,
    numeroId,
    waId,
  ]);
  return waId;
}

// ==================== Desde el panel ====================

export async function crear(nombre: string, color: number): Promise<EtiquetaChat> {
  if (await nombreOcupado(nombre, null)) throw conflicto(`Ya existe la etiqueta "${nombre}"`);
  const fila = await consultarUno<EtiquetaChat>('INSERT INTO etiquetas (nombre, color) VALUES ($1, $2) RETURNING id, nombre, color', [
    nombre,
    color,
  ]);
  emitirEtiquetas();
  return fila!;
}

/** Cambiar nombre o color: tambien en los telefonos Business donde ya existe. */
export async function editar(id: number, nombre: string, color: number): Promise<EtiquetaChat> {
  await obtener(id);
  if (await nombreOcupado(nombre, id)) throw conflicto(`Ya existe la etiqueta "${nombre}"`);
  for (const { numeroId, waId } of await enWhatsapp(id)) {
    await editarEtiquetaWhatsapp(numeroId, { waId, nombre, color });
  }
  const fila = await consultarUno<EtiquetaChat>('UPDATE etiquetas SET nombre = $2, color = $3 WHERE id = $1 RETURNING id, nombre, color', [
    id,
    nombre,
    color,
  ]);
  emitirEtiquetas();
  await emitirChats(await chatsConEtiqueta(id));
  return fila!;
}

export async function eliminar(id: number): Promise<void> {
  const etiqueta = await obtener(id);
  for (const { numeroId, waId } of await enWhatsapp(id)) {
    await editarEtiquetaWhatsapp(numeroId, { waId, nombre: etiqueta.nombre, color: etiqueta.color, borrada: true });
  }
  const chats = await chatsConEtiqueta(id);
  await consultarUno('DELETE FROM etiquetas WHERE id = $1', [id]);
  emitirEtiquetas();
  await emitirChats(chats);
}

async function chatsConEtiqueta(id: number): Promise<number[]> {
  const filas = await consultar<{ id: number }>('SELECT conversacion_id AS id FROM conversacion_etiquetas WHERE etiqueta_id = $1', [id]);
  return filas.map((f) => f.id);
}

/**
 * Poner o quitar una etiqueta en un chat. En un numero Business va primero
 * al telefono (si falla, no cambia nada); en uno normal, solo el panel.
 */
export async function ponerEnChat(conversacionId: number, etiquetaId: number, puesta: boolean) {
  const chat = await conversacionesRepo.obtenerDatosChat(conversacionId);
  const etiqueta = await obtener(etiquetaId);
  if (await esBusiness(chat.numeroId)) {
    const waId = await asegurarEnWhatsapp(etiqueta, chat.numeroId);
    await etiquetarChatWhatsapp(chat.numeroId, chat.jidChat ?? jidDeTelefono(chat.telefono), waId, puesta);
  }
  await aplicarEnChat(conversacionId, etiquetaId, puesta);
  const detalle = await conversacionesRepo.obtenerDetalle(conversacionId);
  if (detalle) emitir(CANAL_SSE, 'conversacion:actualizada', detalle);
  emitirEtiquetas();
  return detalle;
}

async function aplicarEnChat(conversacionId: number, etiquetaId: number, puesta: boolean): Promise<boolean> {
  const fila = puesta
    ? await consultarUno(
        `INSERT INTO conversacion_etiquetas (conversacion_id, etiqueta_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING RETURNING 1 AS ok`,
        [conversacionId, etiquetaId],
      )
    : await consultarUno('DELETE FROM conversacion_etiquetas WHERE conversacion_id = $1 AND etiqueta_id = $2 RETURNING 1 AS ok', [
        conversacionId,
        etiquetaId,
      ]);
  return Boolean(fila);
}

// ==================== Desde el telefono (WhatsApp Business) ====================

export async function marcarBusiness(numeroId: number, esBusinessAhora: boolean): Promise<void> {
  await consultarUno('UPDATE numeros_whatsapp SET es_business = $2 WHERE id = $1', [numeroId, esBusinessAhora]);
}

/** La etiqueta del panel que corresponde a una del telefono (por id, o por nombre la primera vez). */
async function etiquetaDeWhatsapp(numeroId: number, waId: string, nombre: string | null, color: number): Promise<number> {
  const mapeada = await consultarUno<{ etiqueta_id: number }>(
    'SELECT etiqueta_id FROM etiquetas_whatsapp WHERE numero_id = $1 AND wa_id = $2',
    [numeroId, waId],
  );
  if (mapeada) return mapeada.etiqueta_id;
  const nombreFinal = nombre ?? `Etiqueta ${waId}`;
  const porNombre = await consultarUno<{ id: number }>('SELECT id FROM etiquetas WHERE lower(nombre) = lower($1)', [nombreFinal]);
  const id =
    porNombre?.id ??
    (await consultarUno<{ id: number }>('INSERT INTO etiquetas (nombre, color) VALUES ($1, $2) RETURNING id', [nombreFinal, color]))!.id;
  await consultarUno(
    `INSERT INTO etiquetas_whatsapp (etiqueta_id, numero_id, wa_id) VALUES ($1, $2, $3)
     ON CONFLICT (etiqueta_id, numero_id) DO UPDATE SET wa_id = EXCLUDED.wa_id`,
    [id, numeroId, waId],
  );
  return id;
}

export async function alCambiarEtiqueta(numeroId: number, etiqueta: EtiquetaWhatsapp): Promise<void> {
  if (etiqueta.borrada) {
    const mapeada = await consultarUno<{ etiqueta_id: number }>(
      'SELECT etiqueta_id FROM etiquetas_whatsapp WHERE numero_id = $1 AND wa_id = $2',
      [numeroId, etiqueta.waId],
    );
    if (!mapeada) return;
    const chats = await chatsConEtiqueta(mapeada.etiqueta_id);
    await consultarUno('DELETE FROM etiquetas WHERE id = $1', [mapeada.etiqueta_id]);
    emitirEtiquetas();
    await emitirChats(chats);
    return;
  }
  const id = await etiquetaDeWhatsapp(numeroId, etiqueta.waId, etiqueta.nombre, etiqueta.color);
  // El nombre del telefono manda (si no choca con otra etiqueta del panel).
  if (!(await nombreOcupado(etiqueta.nombre, id))) {
    await consultarUno('UPDATE etiquetas SET nombre = $2, color = $3 WHERE id = $1', [id, etiqueta.nombre, etiqueta.color]);
  }
  emitirEtiquetas();
}

export async function alEtiquetarChat(numeroId: number, cambio: { telefono: string; waId: string; puesta: boolean }): Promise<void> {
  const conversacionId = await conversacionesRepo.idDeChat(numeroId, cambio.telefono);
  if (!conversacionId) return;
  const etiquetaId = await etiquetaDeWhatsapp(numeroId, cambio.waId, null, 0);
  if (await aplicarEnChat(conversacionId, etiquetaId, cambio.puesta)) {
    await emitirChats([conversacionId]);
    emitirEtiquetas();
  }
}

