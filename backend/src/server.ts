import fs from 'node:fs/promises';
import { env } from './config/env.js';
import { crearApp } from './app.js';
import { migrar } from './db/migrate.js';
import { cerrarPool } from './db/pool.js';
import { cerrarTodos } from './lib/sse.js';
import { logger } from './lib/logger.js';

/**
 * Arranque del servidor:
 *   1. Crea las carpetas de datos persistentes si no existen.
 *   2. Espera a Postgres y aplica las migraciones pendientes.
 *   3. Levanta Express.
 *   4. Deja listo el apagado ordenado (importante: cortar una campana a la
 *      mitad sin cerrar bien dejaria sesiones de WhatsApp en mal estado).
 */
async function iniciar(): Promise<void> {
  await fs.mkdir(env.rutaSesiones, { recursive: true });
  await fs.mkdir(env.rutaSubidas, { recursive: true });

  await migrar();

  const app = crearApp();
  const servidor = app.listen(env.PORT, () => {
    logger.info(`Servidor escuchando en http://localhost:${env.PORT} [${env.NODE_ENV}]`);
    if (env.esDev) logger.info('Panel en desarrollo: http://localhost:5173');
  });

  let apagando = false;
  const apagar = async (senal: string) => {
    if (apagando) return;
    apagando = true;
    logger.info(`Recibida senal ${senal}, apagando de forma ordenada...`);

    cerrarTodos();
    servidor.close();

    // TODO(Fase 1): cerrar las sesiones de Baileys.
    // TODO(Fase 3): pausar el worker de la cola de publicaciones.

    await cerrarPool().catch(() => undefined);
    logger.info('Apagado completo');
    process.exit(0);
  };

  process.on('SIGTERM', () => void apagar('SIGTERM'));
  process.on('SIGINT', () => void apagar('SIGINT'));

  process.on('unhandledRejection', (razon) => {
    logger.error({ razon }, 'Promesa rechazada sin manejar');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Excepcion no capturada — el proceso se reinicia');
    process.exit(1);
  });
}

iniciar().catch((err) => {
  logger.fatal({ err }, 'No se pudo iniciar el servidor');
  process.exit(1);
});
