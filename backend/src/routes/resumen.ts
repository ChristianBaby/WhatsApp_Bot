import { Router } from 'express';
import { consultarUno } from '../db/pool.js';
import { manejarAsync } from '../middleware/errorHandler.js';

export const rutasResumen = Router();

/**
 * Alimenta los indicadores en vivo del sidebar. Cada fase suma su propio
 * dato real aqui; hasta entonces el campo queda en su valor neutro (0 o
 * false) en vez de inventar un numero.
 */
rutasResumen.get(
  '/resumen',
  manejarAsync(async (_req, res) => {
    const conectado = await consultarUno<{ existe: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM numeros_whatsapp WHERE estado = 'conectado') AS existe`,
    );
    const autoRespuestas = await consultarUno<{ valor: boolean }>(
      `SELECT valor FROM configuracion WHERE clave = 'autorespuestas_activo'`,
    );

    res.json({
      hayNumeroConectado: conectado?.existe ?? false,
      publicacionesEnCurso: 0, // Fase 3
      respuestasNoLeidas: 0, // Fase 4
      autoRespuestasActivas: autoRespuestas?.valor === true,
    });
  }),
);
