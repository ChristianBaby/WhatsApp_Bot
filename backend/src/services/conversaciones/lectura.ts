import { crearLogger } from '../../lib/logger.js';
import { confirmarLectura } from '../whatsapp/envio.js';
import * as repo from './repositorio.js';
import type { ConversacionDetalle } from './tipos.js';

const log = crearLogger('conversaciones-lectura');

/**
 * Marca el chat como leido en el panel y, como en WhatsApp, le manda al
 * contacto los checks azules de lo que tenia sin leer. Si la confirmacion
 * falla (numero desconectado, WhatsApp no responde), el chat igual queda
 * leido en el panel: los checks azules no deben trabar nada.
 */
export async function marcarLeidaYConfirmar(conversacionId: number): Promise<ConversacionDetalle> {
  const pendientes = await repo.pendientesDeLectura(conversacionId);
  const actualizada = await repo.marcarLeida(conversacionId);
  if (pendientes) {
    confirmarLectura(pendientes.numeroId, pendientes.telefono, pendientes.jid, pendientes.ids).catch((err: unknown) =>
      log.warn({ err, conversacionId }, 'No se pudo mandar la confirmacion de lectura'),
    );
  }
  return actualizada;
}
