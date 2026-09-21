import { crearLogger } from '../../lib/logger.js';
import { emitir } from '../../lib/sse.js';
import { noEncontrado, solicitudInvalida } from '../../lib/errors.js';
import { idsNumerosConectados } from '../whatsapp/gestor.js';
import { NumeroNoConectadoError, enviarMensaje, verificarEnWhatsapp } from '../whatsapp/envio.js';
import * as leadsRepo from '../leads/repositorio.js';
import * as configRepo from '../configuracion/repositorio.js';
import * as repo from './repositorio.js';
import { datosPlaceholderDeLead, elegirVariante, sustituirPlaceholders } from './plantilla.js';
import type { ConfigEnvio, Publicacion } from './tipos.js';
import type { DestinatarioPendiente } from './repositorio.js';

/**
 * El motor de la cola de publicaciones (secciones 3.3, 3.4, 3.5). Funciona
 * a base de un "tick" periodico en vez de un loop bloqueante: en cada tick
 * se pregunta "¿hay algo que hacer AHORA?" y, si lo hay, hace UNA sola
 * unidad de trabajo (un mensaje) y agenda cuando le toca la siguiente.
 * Esto hace que pausar/cancelar/reiniciar el proceso sea seguro en
 * cualquier momento: nunca hay un envio "a medias" bloqueando el hilo.
 */

const log = crearLogger('motor-envio');
const CANAL_SSE = 'publicaciones';
const INTERVALO_TICK_MS = 10_000;

// Cuando le toca de nuevo a cada publicacion en_curso (pausa corta entre
// mensajes o pausa larga entre lotes). Vive solo en memoria a proposito:
// si el proceso se reinicia, se pierde el resto de la espera pendiente y
// se retoma un poco antes — preferible a la complejidad de persistirlo
// para un caso que no es critico de seguridad.
const proximaAccionPermitida = new Map<number, number>();

let intervalo: NodeJS.Timeout | null = null;
let procesando = false;

function emitirProgreso(publicacionId: number): void {
  repo
    .obtenerConProgreso(publicacionId)
    .then((pub) => {
      if (pub) emitir(CANAL_SSE, 'publicacion:actualizada', pub);
    })
    .catch((err: unknown) => log.error({ err, publicacionId }, 'No se pudo emitir el progreso'));
}

async function resolverConfigEnvio(pub: Publicacion): Promise<ConfigEnvio> {
  const defaults = await configRepo.obtenerTodos();
  return {
    pausaMinSegundos: pub.pausaMinSegundos ?? Number(defaults.pausa_min_segundos ?? 45),
    pausaMaxSegundos: pub.pausaMaxSegundos ?? Number(defaults.pausa_max_segundos ?? 150),
    tamanoLote: pub.tamanoLote ?? Number(defaults.tamano_lote ?? 25),
    pausaEntreLotesMinutos: pub.pausaEntreLotesMinutos ?? Number(defaults.pausa_entre_lotes_minutos ?? 20),
    horarioInicio: pub.horarioInicio ?? String(defaults.horario_inicio ?? '09:00'),
    horarioFin: pub.horarioFin ?? String(defaults.horario_fin ?? '19:00'),
    maxMensajes: pub.maxMensajes ?? Number(defaults.max_mensajes_por_ejecucion ?? 200),
  };
}

/** Compara solo horas:minutos locales. La zona horaria del servidor se fija con TZ en .env. */
function estaEnHorarioLaboral(inicio: string, fin: string, ahora = new Date()): boolean {
  const [hi = 0, mi = 0] = inicio.split(':').map(Number);
  const [hf = 23, mf = 59] = fin.split(':').map(Number);
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
  return minutosAhora >= hi * 60 + mi && minutosAhora < hf * 60 + mf;
}

async function pausar(publicacionId: number, motivo: string): Promise<void> {
  await repo.cambiarEstado(publicacionId, { estado: 'pausada', motivoPausa: motivo });
  proximaAccionPermitida.delete(publicacionId);
  emitirProgreso(publicacionId);
  log.warn({ publicacionId, motivo }, 'Publicacion pausada');
}

async function completar(publicacionId: number): Promise<void> {
  await repo.cambiarEstado(publicacionId, { estado: 'completada', finalizadaEn: new Date().toISOString() });
  proximaAccionPermitida.delete(publicacionId);
  emitirProgreso(publicacionId);
  log.info({ publicacionId }, 'Publicacion completada');
}

async function procesarDestinatario(pub: Publicacion, destinatario: DestinatarioPendiente): Promise<void> {
  try {
    const tieneWhatsapp = await verificarEnWhatsapp(destinatario.numeroId, destinatario.telefono);
    if (!tieneWhatsapp) {
      await repo.marcarResultadoDestinatario(destinatario.destinatarioId, 'sin_whatsapp');
      return;
    }

    const variante = elegirVariante(pub.variantesMensaje);
    let texto = sustituirPlaceholders(variante, datosPlaceholderDeLead(destinatario));
    if (pub.catalogoUrl) texto += `\n\n${pub.catalogoUrl}`;

    const adjunto = pub.adjuntoRuta && pub.adjuntoTipo ? { ruta: pub.adjuntoRuta, tipo: pub.adjuntoTipo } : null;
    await enviarMensaje(destinatario.numeroId, destinatario.telefono, texto, adjunto);

    await repo.marcarResultadoDestinatario(destinatario.destinatarioId, 'enviado', { mensajeEnviado: texto });
    await leadsRepo.marcarContactado(destinatario.leadId);
  } catch (err) {
    const motivo = err instanceof NumeroNoConectadoError ? err.message : (err as Error).message;
    await repo.marcarResultadoDestinatario(destinatario.destinatarioId, 'fallido', { motivoFallo: motivo });
    log.warn({ err, publicacionId: pub.id, leadId: destinatario.leadId }, 'Fallo el envio a un destinatario');
  } finally {
    emitirProgreso(pub.id);
  }
}

async function procesarUnPaso(pub: Publicacion): Promise<void> {
  // Puede haberse cancelado/pausado entre el tick anterior y este.
  const actual = await repo.obtener(pub.id);
  if (!actual || actual.estado !== 'en_curso') return;

  const config = await resolverConfigEnvio(actual);

  if (!estaEnHorarioLaboral(config.horarioInicio, config.horarioFin)) return; // se reintenta en el siguiente tick

  const progreso = await repo.obtenerConProgreso(actual.id);
  if (!progreso) return;

  if (progreso.progreso.enviados >= config.maxMensajes) {
    await pausar(actual.id, `Se alcanzo el limite de ${config.maxMensajes} mensajes configurado para esta campaña.`);
    return;
  }

  const conectados = await idsNumerosConectados();
  const conectadosDeEstaCampana = actual.numeroIds.filter((id) => conectados.includes(id));

  if (conectadosDeEstaCampana.length === 0) {
    await pausar(actual.id, 'Ninguno de los numeros de esta campaña esta conectado ahora mismo.');
    return;
  }

  const siguiente = await repo.siguientePendiente(actual.id, conectadosDeEstaCampana);
  if (!siguiente) {
    if (progreso.progreso.pendientes === 0) {
      await completar(actual.id);
    } else {
      await pausar(actual.id, 'Los destinatarios que faltan estan asignados a un numero desconectado.');
    }
    return;
  }

  await procesarDestinatario(actual, siguiente);

  const loteActual = await repo.incrementarLoteActual(actual.id);
  if (loteActual >= config.tamanoLote) {
    await repo.reiniciarLoteActual(actual.id);
    proximaAccionPermitida.set(actual.id, Date.now() + config.pausaEntreLotesMinutos * 60_000);
    log.info({ publicacionId: actual.id, minutos: config.pausaEntreLotesMinutos }, 'Pausa de lote');
  } else {
    const segundos = config.pausaMinSegundos + Math.random() * (config.pausaMaxSegundos - config.pausaMinSegundos);
    proximaAccionPermitida.set(actual.id, Date.now() + segundos * 1000);
  }
}

async function iniciarPublicacion(pub: Publicacion): Promise<Publicacion> {
  const yaGenerados = await repo.contarDestinatarios(pub.id);
  if (yaGenerados === 0) {
    const total = await repo.generarDestinatarios(pub.id, pub.listaId, pub.numeroIds);
    log.info({ publicacionId: pub.id, total }, 'Destinatarios generados');
  }
  const actualizada = await repo.cambiarEstado(pub.id, { estado: 'en_curso', iniciadaEn: new Date().toISOString() });
  emitirProgreso(pub.id);
  log.info({ publicacionId: pub.id }, 'Publicacion iniciada');
  return actualizada;
}

async function tick(): Promise<void> {
  if (procesando) return; // el tick anterior sigue corriendo (un envio puede tardar mas que el intervalo)
  procesando = true;
  try {
    let enCurso = await repo.publicacionEnCurso();

    if (!enCurso) {
      const [siguiente] = await repo.publicacionesListasParaIniciar();
      if (!siguiente) return;
      enCurso = await iniciarPublicacion(siguiente);
    }

    const proxima = proximaAccionPermitida.get(enCurso.id) ?? 0;
    if (Date.now() < proxima) return;

    await procesarUnPaso(enCurso);
  } catch (err) {
    log.error({ err }, 'Error inesperado en el tick del motor de envio');
  } finally {
    procesando = false;
  }
}

export function iniciarMotor(): void {
  if (intervalo) return;
  intervalo = setInterval(() => void tick(), INTERVALO_TICK_MS);
  log.info('Motor de envio iniciado');
  void tick(); // por si ya hay una publicacion 'en_curso' de antes del reinicio
}

export function detenerMotor(): void {
  if (intervalo) clearInterval(intervalo);
  intervalo = null;
}

export async function cancelarPublicacion(publicacionId: number): Promise<Publicacion> {
  const pub = await repo.obtener(publicacionId);
  if (!pub) throw noEncontrado('Publicacion no encontrada');
  if (!['borrador', 'programada', 'en_curso', 'pausada'].includes(pub.estado)) {
    throw solicitudInvalida('Esta publicacion ya no se puede cancelar');
  }
  const actualizada = await repo.cambiarEstado(publicacionId, { estado: 'cancelada' });
  proximaAccionPermitida.delete(publicacionId);
  emitirProgreso(publicacionId);
  return actualizada;
}

/**
 * Reanuda una publicacion pausada. Si ya hay otra en_curso, vuelve a la
 * cola como 'programada' (con fecha "ahora") en vez de saltarsela —
 * respeta la regla de una publicacion a la vez.
 */
export async function reanudarPublicacion(publicacionId: number): Promise<Publicacion> {
  const pub = await repo.obtener(publicacionId);
  if (!pub) throw noEncontrado('Publicacion no encontrada');
  if (pub.estado !== 'pausada') throw solicitudInvalida('Solo se puede reanudar una publicacion pausada');

  await repo.limpiarMotivoPausa(publicacionId);
  const otraEnCurso = await repo.publicacionEnCurso();
  const debeEsperarTurno = otraEnCurso && otraEnCurso.id !== publicacionId;

  if (debeEsperarTurno) {
    await repo.actualizar(publicacionId, { programadaPara: new Date().toISOString() });
    await repo.cambiarEstado(publicacionId, { estado: 'programada' });
  } else {
    await repo.cambiarEstado(publicacionId, { estado: 'en_curso' });
  }

  proximaAccionPermitida.delete(publicacionId);
  const actualizada = await repo.obtener(publicacionId);
  emitirProgreso(publicacionId);
  return actualizada!;
}
