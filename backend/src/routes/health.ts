import { Router } from 'express';
import { consultarUno } from '../db/pool.js';
import { clientesConectados } from '../lib/sse.js';
import { manejarAsync } from '../middleware/errorHandler.js';

export const rutasSalud = Router();

/**
 * Healthcheck. Coolify y docker-compose lo consultan para saber si el
 * contenedor esta realmente listo (no solo "arrancado").
 */
rutasSalud.get(
  '/health',
  manejarAsync(async (_req, res) => {
    const db = await consultarUno<{ ok: number }>('SELECT 1 AS ok').catch(() => null);
    const ok = db !== null;
    res.status(ok ? 200 : 503).json({
      ok,
      baseDatos: ok ? 'conectada' : 'sin conexion',
      clientesSSE: clientesConectados(),
      enLineaDesde: Math.round(process.uptime()),
      fecha: new Date().toISOString(),
    });
  }),
);
