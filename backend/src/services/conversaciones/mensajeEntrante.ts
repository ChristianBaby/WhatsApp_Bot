import { crearLogger } from '../../lib/logger.js';
import { emitir } from '../../lib/sse.js';
import { enviarMensaje } from '../whatsapp/envio.js';
import * as leadsRepo from '../leads/repositorio.js';
import * as numerosRepo from '../whatsapp/repositorio.js';
import * as configRepo from '../configuracion/repositorio.js';
import * as contactos from '../contactos/contactos.js';
import { clasificarRespuesta, type SugerenciaEtapa } from '../ia/clasificacion.js';
import { decidirRespuestaAutomatica } from '../ia/autoResponder.js';
import * as repo from './repositorio.js';

const log = crearLogger('conversaciones');
const CANAL_SSE = 'conversaciones';
const UMBRAL_EN_CONVERSACION = 3;
const ETAPAS_CERRADAS = new Set(['venta_concretada', 'descartado']);

/**
 * Cuanto se espera, desde el ultimo mensaje del lead, antes de auto-responder.
 * Si en ese tiempo manda otro, se reinicia la espera y al final se contesta
 * UNA vez a todo junto (antes: 3 mensajes seguidos = 3 respuestas).
 */
const ESPERA_AGRUPAR_MS = 8_000;

export type MensajeCrudo = {
  numeroId: number;
  numeroEtiqueta: string;
  telefono: string; // ya normalizado (solo digitos)
  fromMe: boolean;
  texto: string;
  whatsappId: string | null;
  pushName?: string | null;
};

// ==================== Cola por conversacion ====================
//
// Todo lo que toca una conversacion (guardar un mensaje, auto-responder,
// procesar una baja) pasa por su propia cola: nunca corren dos a la vez para
// el mismo chat. Sin esto, mensajes seguidos disparaban respuestas en
// paralelo, bienvenidas repetidas, y el eco de Baileys de una respuesta del
// bot podia guardarse como "yo" antes que el registro del bot.

const colas = new Map<string, Promise<void>>();

function claveConversacion(numeroId: number, telefono: string): string {
  return `${numeroId}:${telefono}`;
}

function enCola(clave: string, tarea: () => Promise<void>): Promise<void> {
  const segura = async () => {
    try {
      await tarea();
    } catch (err) {
      log.error({ err, clave }, 'Fallo una tarea de la cola de la conversacion');
    }
  };
  const siguiente = (colas.get(clave) ?? Promise.resolve()).then(segura);
  colas.set(clave, siguiente);
  void siguiente.then(() => {
    if (colas.get(clave) === siguiente) colas.delete(clave);
  });
  return siguiente;
}

const temporizadores = new Map<number, NodeJS.Timeout>();

function cancelarAutoRespuesta(conversacionId: number): void {
  const t = temporizadores.get(conversacionId);
  if (t) clearTimeout(t);
  temporizadores.delete(conversacionId);
}

function programarAutoRespuesta(conversacionId: number, numeroId: number, telefono: string): void {
  cancelarAutoRespuesta(conversacionId);
  temporizadores.set(
    conversacionId,
    setTimeout(() => {
      temporizadores.delete(conversacionId);
      void enCola(claveConversacion(numeroId, telefono), () => autoResponder(conversacionId, numeroId, telefono));
    }, ESPERA_AGRUPAR_MS),
  );
}

// ==================== Utilidades ====================

function emitirConversacion(id: number): void {
  repo
    .obtenerDetalle(id)
    .then((c) => {
      if (c) emitir(CANAL_SSE, 'conversacion:actualizada', c);
    })
    .catch((err: unknown) => log.error({ err, id }, 'No se pudo emitir la conversacion actualizada'));
}

/** Envia un mensaje automatico y lo registra como del bot en el historial. */
async function enviarComoBot(conversacionId: number, numeroId: number, telefono: string, texto: string): Promise<boolean> {
  const whatsappId = await enviarMensaje(numeroId, telefono, texto).catch((err: unknown) => {
    log.warn({ err, conversacionId }, 'No se pudo enviar un mensaje automatico');
    return null;
  });
  if (whatsappId === null) return false;

  const guardado = await repo.agregarMensaje(conversacionId, 'bot', texto, whatsappId);
  emitirConversacion(conversacionId);
  if (guardado) emitir(CANAL_SSE, 'mensaje:nuevo', { conversacionId, mensaje: guardado });
  return true;
}

/** Aviso por WhatsApp al numero propio del usuario (seccion 3.6). */
async function avisarAlDueno(numeroId: number, texto: string): Promise<void> {
  const destino = await contactos.telefonoDueno();
  if (!destino) return;
  await enviarMensaje(numeroId, destino, texto).catch((err: unknown) =>
    log.warn({ err, numeroId }, 'No se pudo avisar al dueño'),
  );
}

// ==================== Entrada ====================

/**
 * Punto de entrada unico para CUALQUIER mensaje que pase por una sesion de
 * WhatsApp (entrante o saliente, venga del panel, del propio telefono del
 * usuario, o de una campana) — asi el historial del chat queda completo
 * sin importar por donde se envio (seccion 3.6).
 */
export function procesarMensaje(msg: MensajeCrudo): Promise<void> {
  return enCola(claveConversacion(msg.numeroId, msg.telefono), () => procesar(msg));
}

async function procesar(msg: MensajeCrudo): Promise<void> {
  log.info({ numeroId: msg.numeroId, telefono: msg.telefono, fromMe: msg.fromMe }, 'Mensaje de WhatsApp recibido');

  // El dueño recibe los avisos desde el numero del bot: si los contesta, eso
  // NO es un lead (antes el bot le respondia con la bienvenida o la IA).
  const dueno = await contactos.telefonoDueno();
  const esDueno = dueno !== null && msg.telefono === dueno;

  const lead = esDueno ? null : await leadsRepo.buscarPorTelefono(msg.telefono);
  const conversacion = await repo.obtenerOCrearConversacion({
    numeroId: msg.numeroId,
    telefono: msg.telefono,
    nombreContacto: msg.pushName ?? null,
    leadId: lead?.id ?? null,
  });
  const eraNoLeida = conversacion.no_leidos > 0;

  const guardado = await repo.agregarMensaje(conversacion.id, msg.fromMe ? 'yo' : 'lead', msg.texto, msg.whatsappId);
  if (!guardado) return; // ya estaba guardado (evento repetido de Baileys)

  emitirConversacion(conversacion.id);
  emitir(CANAL_SSE, 'mensaje:nuevo', { conversacionId: conversacion.id, mensaje: guardado });

  // De aca en mas, todo es reaccion a un mensaje de la otra persona. Un
  // mensaje saliente (chat integrado, propio telefono, campana) no dispara
  // avisos, clasificacion ni auto-respuesta.
  if (msg.fromMe || esDueno) {
    // Si el usuario contesto a mano mientras el bot esperaba para agrupar, el bot ya no responde.
    if (msg.fromMe) cancelarAutoRespuesta(conversacion.id);
    return;
  }

  const quien = lead?.empresa ?? `+${msg.telefono}`;

  // Ya pidio la baja antes: se guarda y se avisa, pero el bot no le responde nunca.
  if (await contactos.estaBloqueado(msg.telefono)) {
    if (!eraNoLeida) await avisarAlDueno(msg.numeroId, `🔔 ${quien} (dado de baja) escribió:\n"${msg.texto}"`);
    return;
  }

  if (contactos.esPedidoDeBaja(msg.texto)) {
    await procesarBaja(msg, conversacion.id, lead);
    return;
  }

  if (lead) {
    await leadsRepo.marcarRespondio(lead.id);
    const total = await repo.contarMensajes(conversacion.id);
    if (total >= UMBRAL_EN_CONVERSACION) await leadsRepo.marcarEnConversacion(lead.id);
  }

  // Clasificacion (3.9): no tiene sentido sobre un lead ya cerrado. Va antes
  // del aviso al dueño porque tambien es la segunda red para detectar bajas.
  let sugerencia: SugerenciaEtapa | null = null;
  if (lead && !ETAPAS_CERRADAS.has(lead.etapaPipeline)) {
    const clasificacion = await clasificarRespuesta(msg.texto);
    if (clasificacion === 'pide_no_contactar') {
      await procesarBaja(msg, conversacion.id, lead);
      return;
    }
    sugerencia = clasificacion;
  }

  // Solo en el primer mensaje de una tanda nueva, no por cada mensaje seguido.
  if (!eraNoLeida) await avisarAlDueno(msg.numeroId, `🔔 Nueva respuesta de ${quien} (${msg.numeroEtiqueta}):\n"${msg.texto}"`);

  if (sugerencia) await aplicarSugerencia(conversacion.id, msg.numeroId, quien, sugerencia);

  programarAutoRespuesta(conversacion.id, msg.numeroId, msg.telefono);
}

// ==================== Bajas ====================

/**
 * El lead pidio no recibir mas mensajes: se bloquea su telefono (campanas y
 * auto-respuestas), se lo saca de las campanas pendientes, se le confirma
 * UNA vez y se avisa al dueño.
 */
async function procesarBaja(msg: MensajeCrudo, conversacionId: number, lead: leadsRepo.LeadDetalle | null): Promise<void> {
  cancelarAutoRespuesta(conversacionId);

  const esNueva = await contactos.bloquear(msg.telefono, 'pidio_baja', msg.texto);
  const excluidos = await contactos.excluirDeCampanasPendientes(msg.telefono, 'Pidió no recibir mensajes');
  if (lead) await leadsRepo.marcarPidioBaja(lead.id);
  await repo.cambiarModo(conversacionId, 'manual', 'pidio_baja');
  emitirConversacion(conversacionId);

  log.info({ conversacionId, telefono: msg.telefono, excluidos }, 'Contacto dado de baja');
  if (!esNueva) return;

  const confirmacion = (await configRepo.obtenerValor<string>('mensaje_confirmacion_baja'))?.trim();
  if (confirmacion) await enviarComoBot(conversacionId, msg.numeroId, msg.telefono, confirmacion);

  const quien = lead?.empresa ?? `+${msg.telefono}`;
  await avisarAlDueno(
    msg.numeroId,
    `🚫 ${quien} pidió no recibir más mensajes:\n"${msg.texto}"\nQuedó fuera de campañas y respuestas automáticas.`,
  );
}

// ==================== Clasificacion ====================

async function aplicarSugerencia(
  conversacionId: number,
  numeroId: number,
  quien: string,
  sugerencia: SugerenciaEtapa,
): Promise<void> {
  await repo.guardarSugerenciaIA(conversacionId, sugerencia);
  emitirConversacion(conversacionId);

  // Alerta prioritaria cuando la IA detecta un lead "caliente" (seccion 3.9).
  if (sugerencia === 'interesado') {
    await avisarAlDueno(numeroId, `🔥 Lead caliente: la IA sugiere que ${quien} está INTERESADO. Revísalo en el panel.`);
  }
}

// ==================== Auto-responder ====================

/**
 * Auto-responder (seccion 3.10). Corre en la cola de la conversacion, ya
 * pasada la espera de agrupado, y decide con el estado de ESE momento: si
 * el usuario tomo el chat, si el contacto se dio de baja, etc.
 */
async function autoResponder(conversacionId: number, numeroId: number, telefono: string): Promise<void> {
  const conversacion = await repo.obtenerCruda(conversacionId);
  if (!conversacion || conversacion.modo !== 'bot') return;
  if (await contactos.estaBloqueado(telefono)) return;

  const [activoGlobal, numero] = await Promise.all([
    configRepo.obtenerValor<boolean>('autorespuestas_activo'),
    numerosRepo.obtener(numeroId),
  ]);
  if (!activoGlobal || !numero?.autoRespuestasActivo) return;

  const pendientes = await repo.mensajesLeadSinResponder(conversacionId);
  if (pendientes.length === 0) return; // ya le contesto alguien

  // Freno anti-bucle: muchos negocios tienen respuestas automaticas de
  // WhatsApp Business; sin tope, bot y bot se contestan indefinidamente.
  const [limiteHora, limiteDia, enHora, enDia] = await Promise.all([
    configRepo.obtenerValor<number>('limite_respuestas_bot_hora'),
    configRepo.obtenerValor<number>('limite_respuestas_bot_dia'),
    repo.contarRespuestasBot(conversacionId, 60),
    repo.contarRespuestasBot(conversacionId, 24 * 60),
  ]);
  if (enHora >= (limiteHora ?? 4) || enDia >= (limiteDia ?? 10)) {
    await repo.cambiarModo(conversacionId, 'manual', 'limite_respuestas');
    emitirConversacion(conversacionId);
    log.warn({ conversacionId, enHora, enDia }, 'Limite de respuestas automaticas: la conversacion pasa a manual');
    return;
  }

  const [mensajeBienvenida, baseConocimiento, palabrasEscalamiento] = await Promise.all([
    configRepo.obtenerValor<string>('mensaje_bienvenida'),
    configRepo.obtenerValor<string>('base_conocimiento'),
    configRepo.obtenerValor<string[]>('palabras_escalamiento'),
  ]);

  const decision = await decidirRespuestaAutomatica({
    texto: pendientes.join('\n'),
    esPrimerMensaje: !conversacion.bienvenida_enviada_en,
    baseConocimiento: baseConocimiento ?? '',
    mensajeBienvenida: mensajeBienvenida ?? '',
    palabrasEscalamiento: palabrasEscalamiento ?? [],
  });

  if (decision.tipo === 'silencio') return;

  if (decision.tipo === 'escalar') {
    const palabra = decision.motivo === 'palabra_clave' ? decision.palabra : null;
    await repo.cambiarModo(conversacionId, 'manual', decision.motivo, palabra);
    emitirConversacion(conversacionId);
    log.info({ conversacionId, motivo: decision.motivo, palabra }, 'Conversacion escalada a modo manual');
    return;
  }

  const enviado = await enviarComoBot(conversacionId, numeroId, telefono, decision.texto);
  if (enviado && decision.tipo === 'bienvenida') await repo.marcarBienvenidaEnviada(conversacionId);
}
