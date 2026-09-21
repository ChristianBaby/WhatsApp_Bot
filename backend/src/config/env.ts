import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// El .env vive en la raiz del proyecto, no dentro de backend/: asi hay un solo
// archivo de configuracion y no dos que se desincronicen. En produccion no
// existe — las variables las inyecta docker-compose/Coolify directamente.
const raizProyecto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
dotenv.config({ path: path.join(raizProyecto, '.env') });

/**
 * Toda la configuracion del sistema entra por aqui y se valida al arrancar.
 * Si falta algo obligatorio, el proceso muere con un mensaje claro en vez de
 * fallar a mitad de una campana.
 *
 * Los NOMBRES de las variables quedan en mayusculas/ingles porque son un
 * estandar de entorno (Docker, Coolify y Postgres esperan POSTGRES_USER, etc.).
 */
const esquema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().url().default('http://localhost:3000'),

  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_HOST: z.string().min(1).default('postgres'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),

  SESSION_SECRET: z.string().min(16, 'debe tener al menos 16 caracteres'),
  ADMIN_USERNAME: z.string().min(1).default('admin'),
  ADMIN_PASSWORD: z.string().default(''),

  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash-lite'),

  AUTH_SESSIONS_PATH: z.string().default('./auth_sessions'),
  UPLOADS_PATH: z.string().default('./uploads'),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

const resultado = esquema.safeParse(process.env);

if (!resultado.success) {
  const detalle = resultado.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  console.error(`\nConfiguracion invalida (revisa tu archivo .env):\n${detalle}\n`);
  process.exit(1);
}

const cfg = resultado.data;

export const env = {
  ...cfg,
  esProd: cfg.NODE_ENV === 'production',
  esDev: cfg.NODE_ENV === 'development',
  rutaSesiones: path.resolve(cfg.AUTH_SESSIONS_PATH),
  rutaSubidas: path.resolve(cfg.UPLOADS_PATH),
  urlBaseDatos: `postgres://${encodeURIComponent(cfg.POSTGRES_USER)}:${encodeURIComponent(
    cfg.POSTGRES_PASSWORD,
  )}@${cfg.POSTGRES_HOST}:${cfg.POSTGRES_PORT}/${cfg.POSTGRES_DB}`,
} as const;
