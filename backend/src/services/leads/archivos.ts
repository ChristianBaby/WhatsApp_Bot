import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { crearLogger } from '../../lib/logger.js';

const log = crearLogger('archivos-listas');

/**
 * Copia del Excel/CSV original de cada lista, para poder descargarlo despues.
 * Vive en el volumen persistente de subidas, pero en una carpeta con punto:
 * /api/uploads (publico para las imagenes de las campanas) se sirve con
 * dotfiles 'deny' (ver app.ts), asi que estos archivos con datos personales
 * NO quedan accesibles por URL; solo por /listas-leads/:id/archivo, con sesion.
 */
const CARPETA = path.join(env.rutaSubidas, '.listas');
const VIDA_PENDIENTE_MS = 24 * 60 * 60 * 1000;

function rutaSegura(nombre: string): string {
  if (!nombre || nombre !== path.basename(nombre)) throw new Error(`Nombre de archivo invalido: ${nombre}`);
  return path.join(CARPETA, nombre);
}

/** Guarda la copia al previsualizar; devuelve el nombre interno (va de ida y vuelta al confirmar). */
export async function guardarCopia(contenido: Buffer, nombreOriginal: string): Promise<string> {
  await fs.mkdir(CARPETA, { recursive: true });
  const nombre = `${crypto.randomUUID()}${path.extname(nombreOriginal).toLowerCase()}`;
  await fs.writeFile(rutaSegura(nombre), contenido);
  return nombre;
}

export async function existe(nombre: string): Promise<boolean> {
  try {
    await fs.access(rutaSegura(nombre));
    return true;
  } catch {
    return false;
  }
}

export function rutaAbsoluta(nombre: string): string {
  return rutaSegura(nombre);
}

export async function borrar(nombre: string): Promise<void> {
  await fs.rm(rutaSegura(nombre), { force: true }).catch(() => undefined);
}

/** Copias de previsualizaciones que nunca se confirmaron (el usuario cancelo): se borran a las 24 h. */
export async function limpiarHuerfanos(enUso: Set<string>): Promise<void> {
  let nombres: string[];
  try {
    nombres = await fs.readdir(CARPETA);
  } catch {
    return; // todavia no existe la carpeta
  }
  const limite = Date.now() - VIDA_PENDIENTE_MS;
  for (const nombre of nombres) {
    if (enUso.has(nombre)) continue;
    const info = await fs.stat(path.join(CARPETA, nombre)).catch(() => null);
    if (info && info.mtimeMs < limite) {
      await borrar(nombre);
      log.info({ nombre }, 'Copia de lista sin confirmar eliminada');
    }
  }
}
