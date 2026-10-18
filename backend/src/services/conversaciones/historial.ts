import { crearLogger } from '../../lib/logger.js';
import { emitir } from '../../lib/sse.js';
import * as leadsRepo from '../leads/repositorio.js';
import type { ContactoAgenda, LoteHistorial } from '../whatsapp/socket.js';
import * as repo from './repositorio.js';

const log = crearLogger('historial');
const CANAL_SSE = 'conversaciones';

/** Con mas cambios que esto, el panel recarga la lista en vez de recibir chat por chat. */
const MAX_EVENTOS_SUELTOS = 20;

// Los lotes del historial de un mismo numero se guardan de a uno: dos lotes
// en paralelo podrian crear el mismo chat a la vez o dejar mal el preview.
const colas = new Map<number, Promise<void>>();

function enCola(numeroId: number, tarea: () => Promise<void>): Promise<void> {
  const siguiente = (colas.get(numeroId) ?? Promise.resolve()).then(tarea).catch((err: unknown) => {
    log.error({ err, numeroId }, 'Fallo la importacion de un lote del historial');
  });
  colas.set(numeroId, siguiente);
  void siguiente.then(() => {
    if (colas.get(numeroId) === siguiente) colas.delete(numeroId);
  });
  return siguiente;
}

/**
 * Guarda el historial que WhatsApp manda al vincular un numero (y los
 * mensajes viejos que se suman al reconectar). Es solo historial: no avisa
 * al dueño, no clasifica ni dispara la IA, no cuenta como respuesta a una
 * campana — eso es solo para mensajes nuevos (ver mensajeEntrante.ts).
 */
export function importarHistorial(numeroId: number, lote: LoteHistorial): Promise<void> {
  return enCola(numeroId, () => importar(numeroId, lote));
}

async function importar(numeroId: number, lote: LoteHistorial): Promise<void> {
  const agenda = new Map(lote.contactos.map((c) => [c.telefono, c]));
  const chats = new Map(lote.chats.map((c) => [c.telefono, c]));

  const porTelefono = new Map<string, repo.MensajeHistorial[]>();
  const pushNames = new Map<string, string>();
  const vistos = new Set<string>();
  for (const m of lote.mensajes) {
    if (!m.whatsappId || vistos.has(m.whatsappId)) continue;
    vistos.add(m.whatsappId);
    if (!m.fromMe && m.pushName) pushNames.set(m.telefono, m.pushName);

    const lista = porTelefono.get(m.telefono) ?? [];
    lista.push({
      autor: m.fromMe ? 'yo' : 'lead',
      texto: m.texto,
      whatsappId: m.whatsappId,
      creadoEn: m.fecha ?? new Date(),
      tipo: m.tipo,
      media: m.media,
      mediaDescarga: m.mediaDescarga,
      extra: m.extra,
      reacciones: m.reacciones,
    });
    porTelefono.set(m.telefono, lista);
  }

  let mensajesNuevos = 0;
  for (const [telefono, mensajes] of porTelefono) {
    const contacto = agenda.get(telefono);
    const chat = chats.get(telefono);
    const lead = await leadsRepo.buscarPorTelefono(telefono);
    const conversacionId = await repo.asegurarConversacionHistorial({
      numeroId,
      telefono,
      nombreAgenda: contacto?.nombreAgenda ?? chat?.nombre ?? null,
      nombreContacto: contacto?.pushName ?? pushNames.get(telefono) ?? null,
      leadId: lead?.id ?? null,
      noLeidos: chat?.noLeidos ?? 0,
    });
    mensajesNuevos += await repo.importarMensajesHistorial(conversacionId, mensajes);
  }

  // Contactos sin mensajes en este lote: solo se les pone nombre si el chat ya existe.
  let renombrados = 0;
  for (const contacto of lote.contactos) {
    if (porTelefono.has(contacto.telefono) || !contacto.nombreAgenda) continue;
    if (await repo.actualizarNombreAgenda(numeroId, contacto.telefono, contacto.nombreAgenda)) renombrados++;
  }

  if (porTelefono.size || renombrados) {
    log.info(
      { numeroId, chats: porTelefono.size, mensajesNuevos, renombrados, progreso: lote.progreso },
      'Historial de WhatsApp importado',
    );
    emitir(CANAL_SSE, 'conversaciones:sincronizadas', { numeroId, progreso: lote.progreso });
  }
}

/** Nombres de la agenda que llegan sueltos (el usuario guardo o renombro un contacto). */
export async function actualizarAgenda(numeroId: number, contactos: ContactoAgenda[]): Promise<void> {
  const cambiados: number[] = [];
  for (const c of contactos) {
    if (!c.nombreAgenda) continue;
    const id = await repo.actualizarNombreAgenda(numeroId, c.telefono, c.nombreAgenda);
    if (id) cambiados.push(id);
  }
  if (!cambiados.length) return;

  if (cambiados.length > MAX_EVENTOS_SUELTOS) {
    emitir(CANAL_SSE, 'conversaciones:sincronizadas', { numeroId, progreso: null });
    return;
  }
  for (const id of cambiados) {
    const detalle = await repo.obtenerDetalle(id);
    if (detalle) emitir(CANAL_SSE, 'conversacion:actualizada', detalle);
  }
}
