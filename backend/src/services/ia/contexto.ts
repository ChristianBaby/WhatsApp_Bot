import { consultarUno } from '../../db/pool.js';
import * as configRepo from '../configuracion/repositorio.js';
import * as leadsRepo from '../leads/repositorio.js';
import * as conversacionesRepo from '../conversaciones/repositorio.js';
import type { ContextoAutoResponder, MensajeHistorial } from './autoResponder.js';
import { seleccionarContexto } from './conocimiento.js';

/** Cuantos mensajes previos ve la IA: suficiente para el hilo, sin inflar el prompt. */
const MENSAJES_DE_HISTORIAL = 30;

/** Ultimo mensaje de campana enviado a este telefono: es a lo que el lead esta respondiendo. */
async function ultimoMensajeCampana(telefono: string): Promise<string | null> {
  const fila = await consultarUno<{ mensaje_enviado: string }>(
    `SELECT pd.mensaje_enviado FROM publicacion_destinatarios pd JOIN leads l ON l.id = pd.lead_id
     WHERE l.telefono = $1 AND pd.estado = 'enviado' AND pd.mensaje_enviado IS NOT NULL
     ORDER BY pd.enviado_en DESC LIMIT 1`,
    [telefono],
  );
  return fila?.mensaje_enviado ?? null;
}

/** Nicho de la lista mas reciente en la que esta este telefono (null = sin nicho: solo documentos generales). */
async function nichoDeTelefono(telefono: string): Promise<number | null> {
  const fila = await consultarUno<{ nicho_id: number | null }>(
    `SELECT ll.nicho_id FROM leads l JOIN listas_leads ll ON ll.id = l.lista_id
     WHERE l.telefono = $1 ORDER BY l.id DESC LIMIT 1`,
    [telefono],
  );
  return fila?.nicho_id ?? null;
}

/**
 * Dia y hora de Peru (o de TZ), para que la IA salude segun el momento
 * ("buenos dias" / "buenas tardes" / "buenas noches") y sepa si es horario
 * de atencion.
 */
export function momentoLocal(ahora = new Date()): { descripcion: string; saludo: string } {
  const zona = process.env.TZ || 'America/Lima';
  const descripcion = new Intl.DateTimeFormat('es-PE', {
    timeZone: zona,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(ahora);
  const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', hour12: false }).format(ahora));
  const saludo = hora >= 5 && hora < 12 ? 'Buenos días' : hora >= 12 && hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  return { descripcion, saludo };
}

/**
 * Todo lo que la IA necesita para responder: configuracion del negocio,
 * conocimiento relevante, datos del lead, la campana que recibio y la
 * conversacion. Lo usan el auto-responder real y "Probar la IA" del panel,
 * asi lo que se prueba es exactamente lo que vera el bot.
 */
export async function armarContexto(datos: {
  telefono: string | null;
  mensajesNuevos: string[];
  historial: MensajeHistorial[];
  esPrimerMensaje: boolean;
  /** Solo para "Probar la IA": fuerza un nicho. Si no, sale de la lista del lead. */
  nichoId?: number | null;
}): Promise<{ contexto: ContextoAutoResponder; fuentes: string[]; nichoId: number | null }> {
  const [mensajeBienvenida, palabrasEscalamiento, nombreNegocio, instrucciones, nombreAsistente] = await Promise.all([
    configRepo.obtenerValor<string>('mensaje_bienvenida'),
    configRepo.obtenerValor<string[]>('palabras_escalamiento'),
    configRepo.obtenerValor<string>('nombre_negocio'),
    configRepo.obtenerValor<string>('instrucciones_ia'),
    configRepo.obtenerValor<string>('nombre_asistente'),
  ]);

  const lead = datos.telefono ? await leadsRepo.buscarPorTelefono(datos.telefono) : null;
  const mensajeCampana = datos.telefono ? await ultimoMensajeCampana(datos.telefono) : null;
  const nichoId =
    datos.nichoId !== undefined ? datos.nichoId : datos.telefono ? await nichoDeTelefono(datos.telefono) : null;

  // Para elegir secciones de conocimiento importa lo ultimo que se hablo.
  const consulta = [...datos.historial.slice(-4).map((m) => m.texto), ...datos.mensajesNuevos].join('\n');
  const { texto: conocimiento, fuentes } = await seleccionarContexto(consulta, nichoId);

  return {
    fuentes,
    nichoId,
    contexto: {
      nombreAsistente: nombreAsistente ?? '',
      momento: momentoLocal(),
      mensajesNuevos: datos.mensajesNuevos,
      historial: datos.historial,
      esPrimerMensaje: datos.esPrimerMensaje,
      mensajeBienvenida: mensajeBienvenida ?? '',
      palabrasEscalamiento: palabrasEscalamiento ?? [],
      nombreNegocio: nombreNegocio ?? '',
      instrucciones: instrucciones ?? '',
      conocimiento,
      lead: lead ? { empresa: lead.empresa, rubro: lead.rubro, datosExtra: lead.datosExtra } : null,
      mensajeCampana,
    },
  };
}

/** Contexto de una conversacion real: los mensajes pendientes son la cola del historial. */
export async function contextoDeConversacion(
  conversacionId: number,
  telefono: string,
  esPrimerMensaje: boolean,
): Promise<{ contexto: ContextoAutoResponder; fuentes: string[] } | null> {
  const pendientes = await conversacionesRepo.mensajesLeadSinResponder(conversacionId);
  if (pendientes.length === 0) return null;

  const ultimos = await conversacionesRepo.obtenerUltimosMensajes(conversacionId, MENSAJES_DE_HISTORIAL + pendientes.length);
  const historial = ultimos.slice(0, Math.max(0, ultimos.length - pendientes.length));

  return armarContexto({ telefono, mensajesNuevos: pendientes, historial, esPrimerMensaje });
}
