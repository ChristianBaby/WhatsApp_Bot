import { crearLogger } from '../../lib/logger.js';
import { emitir } from '../../lib/sse.js';
import { normalizarTelefono } from '../../lib/telefono.js';
import { enviarMensaje } from '../whatsapp/envio.js';
import * as leadsRepo from '../leads/repositorio.js';
import * as numerosRepo from '../whatsapp/repositorio.js';
import * as configRepo from '../configuracion/repositorio.js';
import { clasificarRespuesta } from '../ia/clasificacion.js';
import { decidirRespuestaAutomatica } from '../ia/autoResponder.js';
import * as repo from './repositorio.js';
import type { FilaConversacionCruda } from './repositorio.js';

const log = crearLogger('conversaciones');
const CANAL_SSE = 'conversaciones';
const UMBRAL_EN_CONVERSACION = 3;
const ETAPAS_CERRADAS = new Set(['venta_concretada', 'descartado']);

export type MensajeCrudo = {
  numeroId: number;
  numeroEtiqueta: string;
  telefono: string; // ya normalizado (solo digitos)
  fromMe: boolean;
  texto: string;
  whatsappId: string | null;
  pushName?: string | null;
};

function emitirConversacion(id: number): void {
  repo
    .obtenerDetalle(id)
    .then((c) => {
      if (c) emitir(CANAL_SSE, 'conversacion:actualizada', c);
    })
    .catch((err: unknown) => log.error({ err, id }, 'No se pudo emitir la conversacion actualizada'));
}

/**
 * Punto de entrada unico para CUALQUIER mensaje que pase por una sesion de
 * WhatsApp (entrante o saliente, venga del panel, del propio telefono del
 * usuario, o de una campana) — asi el historial del chat queda completo
 * sin importar por donde se envio (seccion 3.6).
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

    emitirConversacion(conversacion.id);
    emitir(CANAL_SSE, 'mensaje:nuevo', { conversacionId: conversacion.id, mensaje: guardado });

    // De aca en mas, todo es reaccion a un mensaje del LEAD. Un mensaje
    // saliente (chat integrado, propio telefono, campana) no debe disparar
    // ni el aviso al dueño, ni la clasificacion, ni el auto-responder.
    if (msg.fromMe) return;

    if (lead) {
      await leadsRepo.marcarRespondio(lead.id);
      const total = await repo.contarMensajes(conversacion.id);
      if (total >= UMBRAL_EN_CONVERSACION) await leadsRepo.marcarEnConversacion(lead.id);
    }

    if (!eraNoLeida) await avisarAlDueno(msg, lead);

    // Clasificacion (3.9): no tiene sentido re-sugerir sobre un lead ya cerrado.
    if (lead && !ETAPAS_CERRADAS.has(lead.etapaPipeline)) {
      await sugerirClasificacion(conversacion.id, msg.texto);
    }

    await intentarAutoResponder(msg, conversacion);
  } catch (err) {
    log.error({ err }, 'No se pudo procesar un mensaje de WhatsApp');
  }
}

async function sugerirClasificacion(conversacionId: number, texto: string): Promise<void> {
  const sugerencia = await clasificarRespuesta(texto);
  if (!sugerencia) return;
  await repo.guardarSugerenciaIA(conversacionId, sugerencia);
  emitirConversacion(conversacionId);

  // Alerta prioritaria cuando la IA detecta un lead "caliente" (seccion 3.9):
  // se reusa el mismo aviso al dueño, con un prefijo distinto para que resalte.
  if (sugerencia === 'interesado') {
    const telefonoDueno = await telefonoDuenoValido();
    if (telefonoDueno) {
      const conversacion = await repo.obtenerDetalle(conversacionId);
      if (conversacion) {
        const quien = conversacion.empresa ?? `+${conversacion.telefono}`;
        const texto = `🔥 Lead caliente: la IA sugiere que ${quien} está INTERESADO. Revísalo en el panel.`;
        await enviarMensaje(conversacion.numeroId, telefonoDueno, texto).catch((err: unknown) =>
          log.warn({ err }, 'No se pudo mandar la alerta de lead caliente'),
        );
      }
    }
  }
}

/**
 * Auto-responder (seccion 3.10). Solo actua si: la conversacion esta en
 * modo bot, el auto-responder esta activo (global y en este numero), y el
 * mensaje no trae una palabra de escalamiento. Reusa enviarMensaje() de la
 * Fase 3 (misma simulacion de "escribiendo...").
 */
async function intentarAutoResponder(msg: MensajeCrudo, conversacion: FilaConversacionCruda): Promise<void> {
  if (conversacion.modo !== 'bot') return;

  const [activoGlobal, numero] = await Promise.all([
    configRepo.obtenerValor<boolean>('autorespuestas_activo'),
    numerosRepo.obtener(msg.numeroId),
  ]);
  if (!activoGlobal || !numero?.autoRespuestasActivo) return;

  const [mensajeBienvenida, baseConocimiento, palabrasEscalamiento] = await Promise.all([
    configRepo.obtenerValor<string>('mensaje_bienvenida'),
    configRepo.obtenerValor<string>('base_conocimiento'),
    configRepo.obtenerValor<string[]>('palabras_escalamiento'),
  ]);

  const decision = await decidirRespuestaAutomatica({
    texto: msg.texto,
    esPrimerMensaje: !conversacion.bienvenida_enviada_en,
    baseConocimiento: baseConocimiento ?? '',
    mensajeBienvenida: mensajeBienvenida ?? '',
    palabrasEscalamiento: palabrasEscalamiento ?? [],
  });

  if (decision.tipo === 'silencio') return;

  if (decision.tipo === 'escalar') {
    await repo.cambiarModo(conversacion.id, 'manual', decision.motivo);
    emitirConversacion(conversacion.id);
    log.info({ conversacionId: conversacion.id, motivo: decision.motivo }, 'Conversacion escalada a modo manual');
    return;
  }

  if (decision.tipo === 'bienvenida') await repo.marcarBienvenidaEnviada(conversacion.id);

  const whatsappId = await enviarMensaje(msg.numeroId, msg.telefono, decision.texto).catch((err: unknown) => {
    log.warn({ err, conversacionId: conversacion.id }, 'El auto-responder no pudo enviar su respuesta');
    return null;
  });
  if (whatsappId === null) return;

  const guardado = await repo.agregarMensaje(conversacion.id, 'bot', decision.texto, whatsappId);
  emitirConversacion(conversacion.id);
  if (guardado) emitir(CANAL_SSE, 'mensaje:nuevo', { conversacionId: conversacion.id, mensaje: guardado });
}

async function telefonoDuenoValido(): Promise<string | null> {
  const telefonoDueno = await configRepo.obtenerValor<string>('telefono_propietario');
  if (!telefonoDueno) return null;
  const destino = normalizarTelefono(telefonoDueno);
  return destino.length >= 8 ? destino : null;
}

/**
 * Aviso por WhatsApp al numero propio del usuario (seccion 3.6). Solo en el
 * primer mensaje de una tanda nueva (si la conversacion ya tenia no_leidos,
 * no se repite el aviso por cada mensaje seguido del mismo lead).
 */
async function avisarAlDueno(msg: MensajeCrudo, lead: leadsRepo.LeadDetalle | null): Promise<void> {
  const destino = await telefonoDuenoValido();
  if (!destino) return;

  const quien = lead?.empresa ?? `+${msg.telefono}`;
  const texto = `🔔 Nueva respuesta de ${quien} (${msg.numeroEtiqueta}):\n"${msg.texto}"`;

  try {
    await enviarMensaje(msg.numeroId, destino, texto);
  } catch (err) {
    log.warn({ err, numeroId: msg.numeroId }, 'No se pudo avisar al dueño de la nueva respuesta');
  }
}
