import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { crearLogger } from '../../lib/logger.js';
import * as repo from './repositorio.js';

const log = crearLogger('auth');
const RONDAS_HASH = 12;

/**
 * Crea el usuario administrador una sola vez, la primera vez que arranca
 * el sistema (seccion 8.5). Si ADMIN_PASSWORD no esta en el .env, se
 * genera una contraseña al azar y se imprime UNA vez en el log — despues
 * de eso no queda registrada en ningun lado en texto plano.
 */
export async function asegurarUsuarioAdmin(): Promise<void> {
  const yaHayUsuarios = (await repo.contarUsuarios()) > 0;
  if (yaHayUsuarios) return;

  const generada = !env.ADMIN_PASSWORD;
  const contrasena = env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const hash = await bcrypt.hash(contrasena, RONDAS_HASH);
  await repo.crearUsuario(env.ADMIN_USERNAME, hash);

  if (generada) {
    log.warn(
      `\n\n  ⚠ Usuario del panel creado — guarda esta contraseña, no se vuelve a mostrar:\n` +
        `    Usuario:     ${env.ADMIN_USERNAME}\n` +
        `    Contraseña:  ${contrasena}\n`,
    );
  } else {
    log.info(`Usuario del panel creado: ${env.ADMIN_USERNAME}`);
  }
}
