import { crearLogger } from '../../lib/logger.js';
import { emitir } from '../../lib/sse.js';
import { normalizarTelefono } from '../../lib/telefono.js';
import { enviarMensaje } from '../whatsapp/envio.js';
import * as leadsRepo from '../leads/repositorio.js';
import * as configRepo from '../configuracion/repositorio.js';
import * as repo from './repositorio.js';

const log = crearLogger('conversaciones');
const CANAL_SSE = 'conversaciones';
const UMBRAL_EN_CONVERSACION = 3;

export type MensajeCrudo = {
  numeroId: number;
  numeroEtiqueta: string;
  telefono: string; // ya normalizado (solo digitos)
  fromMe: boolean;
  texto: string;
  whatsappId: string | null;
  pushName?: string | null;
};

function emitirConversacion(detalle: repo.FilaConversacionCruda | null): void {
  if (!detalle) return;
  repo
    .obtenerDetalle(detalle.id)
    .then((c) => {
      if (c) emitir(CANAL_SSE, 'conversacion:actualizada', c);
    })
    .catch((err: unknown) => log.error({ err }, 'No se pudo emitir la conversacion actualizada'));
}

/**
 * Punto de entrada unico para CUALQUIER mensaje que pase por una sesion de
 * WhatsApp (entrante o saliente, venga del panel o del telefono del
 * usuario) — asi el historial del chat queda completo sin importar por
 * donde se contesto (seccion 3.6).
 */
export async function procesarMensaje(msg: MensajeCrudo): Promise<void> {
  log.info(
    { numeroId: msg.numeroId, telefono: msg.telefono, fromMe: msg.fromMe, texto: msg.texto },
    'Mensaje de WhatsApp recibido',
  );
  try {
    const lead = await leadsRepo.buscarPorTelefono(msg.telefono);

    const conversacion = await repo.obtenerOCrearConversacion({
      numeroId: msg.numeroId,
      telefono: msg.telefono,
      nombreContacto: msg.pushName ?? null,
      leadId: lead?.id ?? null,
    });
    const eraNoLeida = conversacion.no_leidos > 0;

    const autor = msg.fromMe ? 'yo' : 'lead';
    const guardado = await repo.agregarMensaje(conversacion.id, autor, msg.texto, msg.whatsappId);
    if (!guardado) return; // ya estaba guardado (evento repetido de Baileys)

    if (!msg.fromMe && lead) {
      await leadsRepo.marcarRespondio(lead.id);
      const total = await repo.contarMensajes(conversacion.id);
      if (total >= UMBRAL_EN_CONVERSACION) await leadsRepo.marcarEnConversacion(lead.id);
    }

    emitirConversacion(conversacion);
    emitir(CANAL_SSE, 'mensaje:nuevo', { conversacionId: conversacion.id, mensaje: guardado });

    if (!msg.fromMe && !eraNoLeida) {
      await avisarAlDueno(msg, lead);
    }
  } catch (err) {
    log.error({ err }, 'No se pudo procesar un mensaje de WhatsApp');
  }
}

/**
 * Aviso por WhatsApp al numero propio del usuario (seccion 3.6). Solo en el
 * primer mensaje de una tanda nueva (si la conversacion ya tenia no_leidos,
 * no se repite el aviso por cada mensaje seguido del mismo lead).
 */
async function avisarAlDueno(msg: MensajeCrudo, lead: leadsRepo.LeadResumen | null): Promise<void> {
  const telefonoDueno = await configRepo.obtenerValor<string>('telefono_propietario');
  if (!telefonoDueno) return;

  const destino = normalizarTelefono(telefonoDueno);
  if (destino.length < 8) return;

  const quien = lead?.empresa ?? `+${msg.telefono}`;
  const texto = `🔔 Nueva respuesta de ${quien} (${msg.numeroEtiqueta}):\n"${msg.texto}"`;

  try {
    await enviarMensaje(msg.numeroId, destino, texto);
  } catch (err) {
    log.warn({ err, numeroId: msg.numeroId }, 'No se pudo avisar al dueño de la nueva respuesta');
  }
}
