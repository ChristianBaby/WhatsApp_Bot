import { crearLogger } from '../../lib/logger.js';
import { emitir } from '../../lib/sse.js';
import * as leadsRepo from '../leads/repositorio.js';
import type { CambioMensaje, LlamadaRecibida } from '../whatsapp/socket.js';
import * as repo from './repositorio.js';

/**
 * Lo que le pasa a un mensaje ya guardado (reacciones, ediciones,
 * "eliminar para todos") y las llamadas. Nada de esto dispara avisos ni la
 * IA: solo actualiza el chat y avisa al panel para que lo muestre en vivo.
 */

const log = crearLogger('conversaciones');
const CANAL_SSE = 'conversaciones';

async function emitirConversacion(id: number): Promise<void> {
  const detalle = await repo.obtenerDetalle(id);
  if (detalle) emitir(CANAL_SSE, 'conversacion:actualizada', detalle);
}

export async function aplicarCambio(cambio: CambioMensaje): Promise<void> {
  let resultado: repo.MensajeCambiado | null;
  if (cambio.tipo === 'reaccion') {
    resultado = await repo.aplicarReaccion(cambio.whatsappId, cambio.quien, cambio.emoji);
  } else if (cambio.tipo === 'editado') {
    resultado = await repo.aplicarEdicion(cambio.whatsappId, cambio.texto, cambio.leyenda);
  } else if (cambio.tipo === 'destacado') {
    resultado = await repo.marcarDestacado(cambio.whatsappId, cambio.destacado);
  } else {
    resultado = await repo.marcarEliminado(cambio.whatsappId);
  }
  // Un mensaje que no se guardo (estados, canales...): no hay nada que actualizar.
  if (!resultado) return;

  emitir(CANAL_SSE, 'mensaje:actualizado', resultado);
  // Editar o eliminar el ultimo mensaje cambia el preview de la lista.
  if (cambio.tipo === 'editado' || cambio.tipo === 'eliminado') await emitirConversacion(resultado.conversacionId);
}

/** Una llamada entrante ya terminada: queda en el chat como "📞 Llamada perdida" (o atendida). */
export async function registrarLlamada(numeroId: number, llamada: LlamadaRecibida): Promise<void> {
  const lead = await leadsRepo.buscarPorTelefono(llamada.telefono);
  const conversacion = await repo.obtenerOCrearConversacion({
    numeroId,
    telefono: llamada.telefono,
    nombreContacto: null,
    leadId: lead?.id ?? null,
  });

  const texto = llamada.video
    ? `📹 Videollamada${llamada.perdida ? ' perdida' : ''}`
    : `📞 ${llamada.perdida ? 'Llamada perdida' : 'Llamada de voz'}`;
  const guardado = await repo.agregarMensaje(conversacion.id, 'lead', texto, `llamada-${llamada.id}`, {
    tipo: 'llamada',
    extra: { llamada: { video: llamada.video, perdida: llamada.perdida } },
    creadoEn: llamada.fecha,
  });
  if (!guardado) return;

  log.info({ numeroId, telefono: llamada.telefono, perdida: llamada.perdida }, 'Llamada registrada en el chat');
  await emitirConversacion(conversacion.id);
  emitir(CANAL_SSE, 'mensaje:nuevo', { conversacionId: conversacion.id, mensaje: guardado });
}
