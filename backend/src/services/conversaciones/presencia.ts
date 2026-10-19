import { crearLogger } from '../../lib/logger.js';
import { emitir } from '../../lib/sse.js';
import { jidDeTelefono, suscribirPresencia } from '../whatsapp/envio.js';
import type { PresenciaContacto } from '../whatsapp/socket.js';
import * as repo from './repositorio.js';

const log = crearLogger('conversaciones-presencia');

/**
 * "escribiendo..." / "grabando audio..." / "en linea" del contacto en el
 * encabezado del chat. WhatsApp solo lo avisa de los chats a los que uno se
 * suscribe (al abrirlos en el panel) y solo si la privacidad del contacto lo
 * permite. Nada de esto se guarda: es del momento.
 */

/** "numeroId|jid" -> conversacion. Se llena al abrir cada chat en el panel. */
const suscritos = new Map<string, number>();
/** Si WhatsApp no avisa que dejo de escribir, se borra solo despues de esto. */
const ESCRIBIENDO_MAX_MS = 25_000;
const vencimientos = new Map<number, NodeJS.Timeout>();

const clave = (numeroId: number, jid: string) => `${numeroId}|${jid}`;

export async function suscribir(conversacionId: number): Promise<void> {
  const chat = await repo.obtenerDatosChat(conversacionId);
  const jidTelefono = jidDeTelefono(chat.telefono);
  suscritos.set(clave(chat.numeroId, jidTelefono), conversacionId);
  if (chat.jidChat) suscritos.set(clave(chat.numeroId, chat.jidChat), conversacionId);
  await suscribirPresencia(chat.numeroId, chat.jidChat ?? jidTelefono).catch((err: unknown) =>
    log.debug({ err, conversacionId }, 'No se pudo suscribir a la presencia del contacto'),
  );
}

export function alCambiarPresencia(numeroId: number, jid: string, estado: PresenciaContacto): void {
  const conversacionId = suscritos.get(clave(numeroId, jid));
  if (!conversacionId) return;
  clearTimeout(vencimientos.get(conversacionId));
  vencimientos.delete(conversacionId);
  if (estado === 'escribiendo' || estado === 'grabando') {
    vencimientos.set(
      conversacionId,
      setTimeout(() => {
        vencimientos.delete(conversacionId);
        emitir('conversaciones', 'conversacion:presencia', { conversacionId, estado: null });
      }, ESCRIBIENDO_MAX_MS),
    );
  }
  emitir('conversaciones', 'conversacion:presencia', { conversacionId, estado });
}

