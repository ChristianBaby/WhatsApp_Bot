import { Router } from 'express';
import { consultarUno } from '../db/pool.js';
import { manejarAsync } from '../middleware/errorHandler.js';
import * as conversacionesRepo from '../services/conversaciones/repositorio.js';

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
    const enCurso = await consultarUno<{ total: number }>(
      `SELECT COUNT(*) AS total FROM publicaciones WHERE estado = 'en_curso'`,
    );
    const autoRespuestas = await consultarUno<{ valor: boolean }>(
      `SELECT valor FROM configuracion WHERE clave = 'autorespuestas_activo'`,
    );

    res.json({
      hayNumeroConectado: conectado?.existe ?? false,
      publicacionesEnCurso: enCurso?.total ?? 0,
      respuestasNoLeidas: await conversacionesRepo.contarNoLeidas(),
      autoRespuestasActivas: autoRespuestas?.valor === true,
    });
  }),
);
