import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { ErrorApp } from '../../lib/errors.js';
import { crearLogger } from '../../lib/logger.js';

const log = crearLogger('nota-voz');

/** Una conversion de 15 minutos de audio tarda pocos segundos: mas que esto es que algo se trabo. */
const CONVERSION_MAX_MS = 60_000;

/**
 * El navegador graba en WebM (Chrome) u Ogg (Firefox), pero WhatsApp solo
 * reproduce como nota de voz un Ogg con Opus, mono. ffmpeg lo convierte
 * (viene en la imagen de Docker, ver Dockerfile). Devuelve la ruta del .ogg;
 * el original se borra.
 */
export async function convertirANotaDeVoz(rutaEntrada: string): Promise<string> {
  const rutaSalida = rutaEntrada.replace(/\.[^./\\]*$/, '') + '.ogg';
  const destino = rutaSalida === rutaEntrada ? `${rutaEntrada}.nota.ogg` : rutaSalida;
  const argumentos = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', rutaEntrada,
    '-vn', '-ac', '1', '-ar', '48000',
    '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip',
    destino,
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      execFile('ffmpeg', argumentos, { timeout: CONVERSION_MAX_MS }, (err, _stdout, stderr) => {
        if (err) reject(Object.assign(err, { stderr }));
        else resolve();
      });
    });
  } catch (err) {
    await fs.rm(destino, { force: true }).catch(() => undefined);
    const sinFfmpeg = (err as NodeJS.ErrnoException).code === 'ENOENT';
    log.error({ err }, sinFfmpeg ? 'ffmpeg no esta instalado' : 'No se pudo convertir la nota de voz');
    throw new ErrorApp(
      sinFfmpeg
        ? 'El servidor no tiene instalado el conversor de audio (ffmpeg).'
        : 'No se pudo procesar la grabación. Intenta grabarla de nuevo.',
      500,
      'NOTA_VOZ',
    );
  }

  if (destino !== rutaEntrada) await fs.rm(rutaEntrada, { force: true }).catch(() => undefined);
  return destino;
}
