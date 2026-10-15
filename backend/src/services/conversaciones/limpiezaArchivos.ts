import fs from 'node:fs/promises';
import path from 'node:path';
import { consultar, consultarUno } from '../../db/pool.js';
import { crearLogger } from '../../lib/logger.js';
import * as configRepo from '../configuracion/repositorio.js';
import { CARPETA_MEDIA_CHAT } from './media.js';

/**
 * Que los archivos de los chats no llenen el disco del servidor.
 *
 * Reglas (pensadas para no perder nada importante):
 *   - Solo se borra la COPIA guardada de archivos que se pueden volver a
 *     pedir a WhatsApp (los que tienen media_descarga). Si alguien lo vuelve
 *     a abrir, se baja de nuevo. Ojo: WhatsApp guarda los archivos un tiempo
 *     limitado; si ya no lo tiene, el panel avisa que no esta disponible.
 *   - Se borran los que nadie abrio en `dias_conservar_archivos` dias.
 *     0 = nunca por antiguedad.
 *   - Los documentos (cotizaciones, contratos, PDFs) se conservan siempre
 *     mientras `conservar_documentos` este activo.
 *   - Emergencia: si al disco le quedan menos de 5 GB, se borra lo que nadie
 *     abrio en 7 dias aunque la configuracion diga otra cosa (los documentos
 *     protegidos se siguen respetando). Con menos de 1 GB ya no se bajan
 *     archivos nuevos (ver hayEspacioParaDescargar).
 *   - Archivos sueltos en la carpeta que no son de ningun mensaje (un envio
 *     que se corto a la mitad) se borran despues de un dia.
 */

const log = crearLogger('limpieza-archivos');

const GB = 1024 ** 3;
const LIBRE_EMERGENCIA_BYTES = 5 * GB;
const LIBRE_MINIMO_DESCARGA_BYTES = 1 * GB;
const DIAS_EMERGENCIA = 7;
const UN_DIA_MS = 24 * 60 * 60 * 1000;
const CADA_CUANTO_MS = 6 * 60 * 60 * 1000;
const PRIMERA_VEZ_MS = 2 * 60 * 1000;
const LOTE = 500;

export type EspacioDisco = { libreBytes: number; totalBytes: number };

export async function espacioDisco(): Promise<EspacioDisco | null> {
  try {
    await fs.mkdir(CARPETA_MEDIA_CHAT, { recursive: true });
    const s = await fs.statfs(CARPETA_MEDIA_CHAT);
    return { libreBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch (err) {
    log.warn({ err }, 'No se pudo leer el espacio del disco');
    return null;
  }
}

/** Antes de bajar un archivo de WhatsApp: si el disco esta casi lleno, no se baja. */
export async function hayEspacioParaDescargar(): Promise<boolean> {
  const disco = await espacioDisco();
  return !disco || disco.libreBytes >= LIBRE_MINIMO_DESCARGA_BYTES;
}

export type ResultadoLimpieza = {
  fecha: string;
  borrados: number;
  liberadosBytes: number;
  huerfanos: number;
  emergencia: boolean;
};

let ultimaLimpieza: ResultadoLimpieza | null = null;
let enCurso: Promise<ResultadoLimpieza> | null = null;

async function borrarArchivo(nombre: string): Promise<number> {
  const ruta = path.join(CARPETA_MEDIA_CHAT, path.basename(nombre));
  try {
    const { size } = await fs.stat(ruta);
    await fs.rm(ruta, { force: true });
    return size;
  } catch {
    return 0; // ya no estaba
  }
}

/** Borra las copias guardadas de archivos no usados en `dias` dias. */
async function borrarViejos(dias: number, conservarDocumentos: boolean): Promise<{ borrados: number; bytes: number }> {
  let borrados = 0;
  let bytes = 0;
  for (;;) {
    const filas = await consultar<{ id: number; media_archivo: string }>(
      `SELECT id, media_archivo FROM mensajes_conversacion
       WHERE media_archivo IS NOT NULL
         AND media_descarga IS NOT NULL
         AND ($2::boolean = false OR tipo <> 'documento')
         AND COALESCE(media_usado_en, creado_en) < now() - make_interval(days => $1)
       ORDER BY COALESCE(media_usado_en, creado_en) ASC
       LIMIT ${LOTE}`,
      [dias, conservarDocumentos],
    );
    if (!filas.length) break;

    for (const f of filas) bytes += await borrarArchivo(f.media_archivo);
    await consultar('UPDATE mensajes_conversacion SET media_archivo = NULL WHERE id = ANY($1::int[])', [
      filas.map((f) => f.id),
    ]);
    borrados += filas.length;
    if (filas.length < LOTE) break;
  }
  return { borrados, bytes };
}

/** Archivos en la carpeta que ningun mensaje usa (y con mas de un dia, para no pisar un envio en curso). */
async function borrarHuerfanos(): Promise<{ borrados: number; bytes: number }> {
  let nombres: string[];
  try {
    nombres = await fs.readdir(CARPETA_MEDIA_CHAT);
  } catch {
    return { borrados: 0, bytes: 0 };
  }
  if (!nombres.length) return { borrados: 0, bytes: 0 };

  const usados = new Set(
    (
      await consultar<{ media_archivo: string }>(
        'SELECT media_archivo FROM mensajes_conversacion WHERE media_archivo = ANY($1::text[])',
        [nombres],
      )
    ).map((f) => f.media_archivo),
  );

  let borrados = 0;
  let bytes = 0;
  for (const nombre of nombres) {
    if (usados.has(nombre)) continue;
    const ruta = path.join(CARPETA_MEDIA_CHAT, nombre);
    const datos = await fs.stat(ruta).catch(() => null);
    if (!datos?.isFile() || Date.now() - datos.mtimeMs < UN_DIA_MS) continue;
    bytes += await borrarArchivo(nombre);
    borrados++;
  }
  return { borrados, bytes };
}

async function ejecutar(): Promise<ResultadoLimpieza> {
  const [dias, conservarDocumentos, disco] = await Promise.all([
    configRepo.obtenerValor<number>('dias_conservar_archivos'),
    configRepo.obtenerValor<boolean>('conservar_documentos'),
    espacioDisco(),
  ]);
  const protegerDocumentos = conservarDocumentos ?? true;

  let borrados = 0;
  let bytes = 0;
  if (dias && dias > 0) {
    const r = await borrarViejos(dias, protegerDocumentos);
    borrados += r.borrados;
    bytes += r.bytes;
  }

  const emergencia = disco !== null && disco.libreBytes - bytes < LIBRE_EMERGENCIA_BYTES;
  if (emergencia) {
    log.warn({ libreBytes: disco?.libreBytes }, 'Disco del servidor casi lleno: limpieza de emergencia de archivos de chats');
    const r = await borrarViejos(DIAS_EMERGENCIA, protegerDocumentos);
    borrados += r.borrados;
    bytes += r.bytes;
  }

  const huerfanos = await borrarHuerfanos();
  bytes += huerfanos.bytes;

  const resultado: ResultadoLimpieza = {
    fecha: new Date().toISOString(),
    borrados,
    liberadosBytes: bytes,
    huerfanos: huerfanos.borrados,
    emergencia,
  };
  if (borrados || huerfanos.borrados) log.info(resultado, 'Limpieza de archivos de chats');
  ultimaLimpieza = resultado;
  return resultado;
}

/** Corre la limpieza (si ya hay una en curso, devuelve esa misma). */
export function limpiarAhora(): Promise<ResultadoLimpieza> {
  if (!enCurso) {
    enCurso = ejecutar().finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

export type ResumenAlmacenamiento = {
  archivos: number;
  bytes: number;
  disco: EspacioDisco | null;
  ultimaLimpieza: ResultadoLimpieza | null;
};

/** Cuanto ocupan hoy los archivos de los chats, y cuanto disco queda. */
export async function resumenAlmacenamiento(): Promise<ResumenAlmacenamiento> {
  let archivos = 0;
  let bytes = 0;
  const nombres = await fs.readdir(CARPETA_MEDIA_CHAT).catch(() => [] as string[]);
  for (const nombre of nombres) {
    const datos = await fs.stat(path.join(CARPETA_MEDIA_CHAT, nombre)).catch(() => null);
    if (datos?.isFile()) {
      archivos++;
      bytes += datos.size;
    }
  }
  return { archivos, bytes, disco: await espacioDisco(), ultimaLimpieza };
}

/** El archivo se acaba de abrir: cuenta como usado (a lo sumo una escritura por hora y mensaje). */
export async function marcarUsado(mensajeId: number): Promise<void> {
  await consultarUno(
    `UPDATE mensajes_conversacion SET media_usado_en = now()
     WHERE id = $1 AND (media_usado_en IS NULL OR media_usado_en < now() - interval '1 hour')`,
    [mensajeId],
  );
}

let temporizadorInicial: NodeJS.Timeout | null = null;
let intervalo: NodeJS.Timeout | null = null;

function correrEnSegundoPlano(): void {
  limpiarAhora().catch((err: unknown) => log.error({ err }, 'Fallo la limpieza de archivos de chats'));
}

/** Una vez poco despues de arrancar, y despues cada 6 horas. */
export function iniciarLimpieza(): void {
  temporizadorInicial = setTimeout(correrEnSegundoPlano, PRIMERA_VEZ_MS);
  intervalo = setInterval(correrEnSegundoPlano, CADA_CUANTO_MS);
}

export function detenerLimpieza(): void {
  if (temporizadorInicial) clearTimeout(temporizadorInicial);
  if (intervalo) clearInterval(intervalo);
}
