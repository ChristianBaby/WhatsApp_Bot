import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { crearLogger } from '../../lib/logger.js';
import { emitir } from '../../lib/sse.js';
import { noEncontrado } from '../../lib/errors.js';
import { crearSesion, type SesionBaileys } from './socket.js';
import * as repo from './repositorio.js';
import type { NumeroWhatsapp } from './repositorio.js';

/**
 * Orquesta todas las sesiones de WhatsApp activas (una por numero
 * conectado). Es la unica pieza del sistema que sabe:
 *   - cuantos reintentos lleva cada numero y cuando reintentar,
 *   - cuando un numero pasa a pausado_error (seccion 3.1: si la sesion se
 *     cae, no perder mensajes en silencio, avisar y detener ese numero),
 *   - como retomar, al arrancar el proceso, los numeros que ya estaban
 *     vinculados (para que un reinicio del VPS no obligue a re-escanear).
 */

const log = crearLogger('whatsapp');
const CANAL_SSE = 'numeros';

const REINTENTOS_MAX = 5;
const ESPERA_BASE_MS = 2_000;
const ESPERA_TOPE_MS = 60_000;

type EntradaSesion = {
  sesion: SesionBaileys | null;
  intentos: number;
  /** Evita que un cierre pedido por el usuario dispare un reintento automatico. */
  cerradoManualmente: boolean;
  temporizadorReintento?: NodeJS.Timeout;
};

const sesiones = new Map<number, EntradaSesion>();

function emitirActualizacion(numero: NumeroWhatsapp): void {
  emitir(CANAL_SSE, 'numero:actualizado', numero);
}

async function borrarCarpetaSesion(numeroId: number): Promise<void> {
  const carpeta = path.join(env.rutaSesiones, String(numeroId));
  await fs.rm(carpeta, { recursive: true, force: true }).catch((err: unknown) => {
    log.warn({ err, numeroId }, 'No se pudo borrar la carpeta de sesion (se ignora)');
  });
}

/**
 * Deja un numero como "desconectado": borra sus credenciales (para que la
 * proxima vinculacion pida un QR nuevo) y avisa al panel. Es idempotente
 * a proposito: dos caminos distintos pueden llegar aqui casi a la vez
 * (el logout que pide el usuario y el evento de cierre que dispara ese
 * mismo logout) y solo el primero debe hacer el trabajo.
 */
async function finalizarComoDesconectado(numeroId: number, ultimoError: string | null = null): Promise<void> {
  if (!sesiones.has(numeroId)) return;
  sesiones.delete(numeroId);

  await borrarCarpetaSesion(numeroId);
  const actualizado = await repo.actualizarEstado(numeroId, {
    estado: 'desconectado',
    telefono: null,
    conectadoEn: null,
    ultimoError,
  });
  emitirActualizacion(actualizado);
}

async function manejarDesconexion(numeroId: number, motivo: 'logout' | 'error', mensaje?: string): Promise<void> {
  const entrada = sesiones.get(numeroId);
  if (!entrada) return;
  entrada.sesion = null;

  if (motivo === 'logout' || entrada.cerradoManualmente) {
    await finalizarComoDesconectado(numeroId, motivo === 'logout' ? null : (mensaje ?? null));
    log.info({ numeroId }, 'Sesion cerrada');
    return;
  }

  entrada.intentos += 1;
  if (entrada.intentos > REINTENTOS_MAX) {
    // No perder mensajes en silencio: se marca pausado/fallido y queda a la
    // espera de que el usuario reconecte manualmente desde el panel.
    const actualizado = await repo.actualizarEstado(numeroId, {
      estado: 'pausado_error',
      ultimoError: mensaje ?? 'Se perdio la conexion varias veces seguidas',
    });
    emitirActualizacion(actualizado);
    log.warn({ numeroId }, `Se supero el limite de ${REINTENTOS_MAX} reintentos; requiere reconexion manual`);
    return;
  }

  const espera = Math.min(ESPERA_BASE_MS * 2 ** (entrada.intentos - 1), ESPERA_TOPE_MS);
  log.warn({ numeroId, intento: entrada.intentos, esperaMs: espera }, 'Conexion perdida, reintentando...');
  entrada.temporizadorReintento = setTimeout(() => void iniciar(numeroId), espera);
}

async function iniciar(numeroId: number): Promise<void> {
  let entrada = sesiones.get(numeroId);
  if (!entrada) {
    entrada = { sesion: null, intentos: 0, cerradoManualmente: false };
    sesiones.set(numeroId, entrada);
  }
  entrada.cerradoManualmente = false;

  try {
    const sesion = await crearSesion(numeroId, {
      onQr: async (qrDataUrl) => {
        const actualizado = await repo.actualizarEstado(numeroId, { estado: 'esperando_qr', ultimoError: null });
        emitir(CANAL_SSE, 'numero:qr', { id: numeroId, qr: qrDataUrl });
        emitirActualizacion(actualizado);
      },
      onConectado: async (telefono) => {
        const actual = sesiones.get(numeroId);
        if (actual) actual.intentos = 0;
        const actualizado = await repo.actualizarEstado(numeroId, {
          estado: 'conectado',
          telefono,
          ultimoError: null,
          conectadoEn: new Date().toISOString(),
        });
        emitir(CANAL_SSE, 'numero:qr', { id: numeroId, qr: null });
        emitirActualizacion(actualizado);
        log.info({ numeroId, telefono }, 'Numero de WhatsApp conectado');
      },
      onDesconectado: (motivo, mensaje) => {
        void manejarDesconexion(numeroId, motivo, mensaje);
      },
    });
    entrada.sesion = sesion;
  } catch (err) {
    log.error({ err, numeroId }, 'No se pudo iniciar la sesion de WhatsApp');
    await manejarDesconexion(numeroId, 'error', (err as Error).message);
  }
}

/** Detiene el socket en memoria sin tocar las credenciales guardadas en disco. */
function detenerSinBorrar(numeroId: number): void {
  const entrada = sesiones.get(numeroId);
  if (!entrada) return;
  if (entrada.temporizadorReintento) clearTimeout(entrada.temporizadorReintento);
  entrada.sesion?.cerrar();
  sesiones.delete(numeroId);
}

// ==================== API publica ====================

export async function listar(): Promise<NumeroWhatsapp[]> {
  return repo.listar();
}

export async function crearNumero(etiqueta: string): Promise<NumeroWhatsapp> {
  const numero = await repo.crear(etiqueta);
  void iniciar(numero.id);
  return numero;
}

export async function renombrar(numeroId: number, etiqueta: string): Promise<NumeroWhatsapp> {
  const actualizado = await repo.renombrar(numeroId, etiqueta);
  emitirActualizacion(actualizado);
  return actualizado;
}

/**
 * Reintenta la conexion. Si las credenciales guardadas siguen siendo
 * validas (ej. un numero "pausado_error" por un corte de red), retoma la
 * sesion sin pedir QR. Si no hay credenciales (numero "desconectado" tras
 * un cierre de sesion), Baileys pedira un QR nuevo: el mismo boton hace lo
 * correcto segun el caso, sin necesidad de distinguirlo aqui.
 */
export async function reconectar(numeroId: number): Promise<NumeroWhatsapp> {
  const numero = await repo.obtener(numeroId);
  if (!numero) throw noEncontrado('Numero no encontrado');
  detenerSinBorrar(numeroId);
  void iniciar(numeroId);
  return numero;
}

export async function cerrarSesionUsuario(numeroId: number): Promise<NumeroWhatsapp> {
  const numero = await repo.obtener(numeroId);
  if (!numero) throw noEncontrado('Numero no encontrado');

  const entrada = sesiones.get(numeroId);
  if (entrada) {
    entrada.cerradoManualmente = true;
    if (entrada.temporizadorReintento) clearTimeout(entrada.temporizadorReintento);
    if (entrada.sesion) {
      try {
        await entrada.sesion.sock.logout();
      } catch (err) {
        log.warn({ err, numeroId }, 'El logout remoto fallo; se limpia la sesion localmente igual');
      }
    }
  }

  await finalizarComoDesconectado(numeroId);
  return (await repo.obtener(numeroId)) ?? numero;
}

/** Al arrancar el proceso: retoma todos los numeros que no estan ya desconectados. */
export async function reanudarSesionesGuardadas(): Promise<void> {
  const numeros = await repo.listar();
  const aRetomar = numeros.filter((n) => n.estado !== 'desconectado');
  for (const numero of aRetomar) {
    log.info({ numeroId: numero.id, etiqueta: numero.etiqueta }, 'Reanudando sesion guardada');
    void iniciar(numero.id);
  }
}

/** Apagado ordenado del proceso: cierra los sockets sin borrar credenciales ni marcar nada. */
export function apagarTodo(): void {
  for (const numeroId of sesiones.keys()) detenerSinBorrar(numeroId);
}

/**
 * Socket activo de un numero, para que otros servicios (motor de envio,
 * chat integrado en fases futuras) puedan usarlo directamente. null si el
 * numero no esta conectado en este momento.
 */
export function obtenerSocket(numeroId: number): SesionBaileys['sock'] | null {
  return sesiones.get(numeroId)?.sesion?.sock ?? null;
}

/** IDs de los numeros que estan conectados ahora mismo (no solo registrados). */
export async function idsNumerosConectados(): Promise<number[]> {
  const numeros = await repo.listar();
  return numeros.filter((n) => n.estado === 'conectado').map((n) => n.id);
}
