import pino from 'pino';
import { env } from '../config/env.js';

/**
 * Logger central. En desarrollo sale coloreado y legible; en produccion
 * sale como JSON en una linea, que es lo que Coolify sabe indexar.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.esDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.contrasena',
      '*.password',
      '*.apiKey',
      '*.token',
    ],
    censor: '***',
  },
});

/** Crea un logger hijo etiquetado, ej. crearLogger('baileys'). */
export const crearLogger = (modulo: string) => logger.child({ modulo });
