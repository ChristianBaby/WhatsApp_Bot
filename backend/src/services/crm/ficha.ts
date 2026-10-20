import { consultar, consultarUno } from '../../db/pool.js';
import { conflicto, noEncontrado, solicitudInvalida } from '../../lib/errors.js';
import { emitir } from '../../lib/sse.js';
import * as conversacionesRepo from '../conversaciones/repositorio.js';
import type { FichaCliente } from '../conversaciones/tipos.js';
import * as leadsRepo from '../leads/repositorio.js';
import * as usuarios from './usuarios.js';

/**
 * La ficha del cliente en el chat: sus datos, notas internas del equipo, a
 * quien esta asignado y "convertir en lead" para los que escribieron solos.
 */

const CANAL_SSE = 'conversaciones';
/** La lista donde caen los leads creados desde un chat. */
export const LISTA_DESDE_CHATS = 'Contactos desde el chat';

export type Autor = { id: string; email?: string };

async function emitirConversacion(id: number) {
  const detalle = await conversacionesRepo.obtenerDetalle(id);
  if (!detalle) throw noEncontrado('Conversacion no encontrada');
  emitir(CANAL_SSE, 'conversacion:actualizada', detalle);
  return detalle;
}

// ==================== Datos y asignacion ====================

export async function guardarFicha(conversacionId: number, ficha: FichaCliente) {
  const fila = await consultarUno<{ id: number }>(
    'UPDATE conversaciones SET ficha_nombre = $2, ficha_empresa = $3, ficha_correo = $4 WHERE id = $1 RETURNING id',
    [conversacionId, ficha.nombre, ficha.empresa, ficha.correo],
  );
  if (!fila) throw noEncontrado('Conversacion no encontrada');
  return emitirConversacion(conversacionId);
}

/** usuarioId null = sin asignar. */
export async function asignar(conversacionId: number, usuarioId: string | null) {
  if (usuarioId && !(await usuarios.existe(usuarioId))) throw solicitudInvalida('Esa persona no ha entrado al panel todavía');
  const fila = await consultarUno<{ id: number }>('UPDATE conversaciones SET asignado_a = $2 WHERE id = $1 RETURNING id', [
    conversacionId,
    usuarioId,
  ]);
  if (!fila) throw noEncontrado('Conversacion no encontrada');
  return emitirConversacion(conversacionId);
}

/**
 * Convierte en lead a quien escribio por su cuenta: entra al embudo (etapa
 * "respondió") en la lista "Contactos desde el chat". Si su telefono ya era
 * lead en otra lista, se enlaza ese.
 */
export async function convertirEnLead(conversacionId: number, datos: { empresa: string; rubro: string | null }) {
  const conv = await consultarUno<{ lead_id: number | null; telefono: string; es_grupo: boolean }>(
    'SELECT lead_id, telefono, es_grupo FROM conversaciones WHERE id = $1',
    [conversacionId],
  );
  if (!conv) throw noEncontrado('Conversacion no encontrada');
  if (conv.es_grupo) throw solicitudInvalida('Un grupo no puede ser lead');
  if (conv.lead_id) throw conflicto('Este chat ya es un lead');

  let leadId = (await leadsRepo.buscarPorTelefono(conv.telefono))?.id ?? null;
  if (!leadId) {
    const listaId = await listaDesdeChats();
    leadId = await leadsRepo.agregarLead(listaId, { telefono: conv.telefono, empresa: datos.empresa, rubro: datos.rubro });
    if (!leadId) throw conflicto('Ese teléfono ya está en la lista de contactos del chat');
  }
  await leadsRepo.marcarRespondio(leadId);
  await consultarUno('UPDATE conversaciones SET lead_id = $2, ficha_empresa = COALESCE(ficha_empresa, $3) WHERE id = $1', [
    conversacionId,
    leadId,
    datos.empresa,
  ]);
  return emitirConversacion(conversacionId);
}

async function listaDesdeChats(): Promise<number> {
  const existente = await consultarUno<{ id: number }>(
    'SELECT id FROM listas_leads WHERE nombre = $1 AND archivada_en IS NULL ORDER BY id LIMIT 1',
    [LISTA_DESDE_CHATS],
  );
  if (existente) return existente.id;
  const creada = await consultarUno<{ id: number }>('INSERT INTO listas_leads (nombre) VALUES ($1) RETURNING id', [LISTA_DESDE_CHATS]);
  return creada!.id;
}

// ==================== Notas internas ====================

export type Nota = { id: number; texto: string; autorId: string | null; autorEmail: string | null; creadoEn: string };

type FilaNota = { id: number; texto: string; autor_id: string | null; autor_email: string | null; creado_en: string };

const mapearNota = (f: FilaNota): Nota => ({
  id: f.id,
  texto: f.texto,
  autorId: f.autor_id,
  autorEmail: f.autor_email,
  creadoEn: f.creado_en,
});

export async function listarNotas(conversacionId: number): Promise<Nota[]> {
  const filas = await consultar<FilaNota>(
    'SELECT id, texto, autor_id, autor_email, creado_en FROM notas_conversacion WHERE conversacion_id = $1 ORDER BY creado_en DESC, id DESC',
    [conversacionId],
  );
  return filas.map(mapearNota);
}

export async function agregarNota(conversacionId: number, texto: string, autor: Autor): Promise<Nota> {
  await conversacionesRepo.obtenerDatosChat(conversacionId);
  const fila = await consultarUno<FilaNota>(
    `INSERT INTO notas_conversacion (conversacion_id, texto, autor_id, autor_email) VALUES ($1, $2, $3, $4)
     RETURNING id, texto, autor_id, autor_email, creado_en`,
    [conversacionId, texto, autor.id, autor.email ?? null],
  );
  const nota = mapearNota(fila!);
  emitir(CANAL_SSE, 'nota:cambio', { conversacionId });
  return nota;
}

/** Solo quien la escribio puede borrarla (las migradas de los leads, cualquiera). */
export async function borrarNota(conversacionId: number, notaId: number, autor: Autor): Promise<void> {
  const fila = await consultarUno<{ autor_id: string | null }>(
    'SELECT autor_id FROM notas_conversacion WHERE id = $1 AND conversacion_id = $2',
    [notaId, conversacionId],
  );
  if (!fila) throw noEncontrado('Nota no encontrada');
  if (fila.autor_id && fila.autor_id !== autor.id) throw conflicto('Solo quien escribió la nota puede borrarla');
  await consultarUno('DELETE FROM notas_conversacion WHERE id = $1', [notaId]);
  emitir(CANAL_SSE, 'nota:cambio', { conversacionId });
}
