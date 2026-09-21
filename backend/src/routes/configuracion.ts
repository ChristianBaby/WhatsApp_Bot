import { Router } from 'express';
import { manejarAsync } from '../middleware/errorHandler.js';
import * as repo from '../services/configuracion/repositorio.js';

export const rutasConfiguracion = Router();

/**
 * Solo lectura por ahora: el formulario de Nueva publicacion la usa para
 * mostrar los valores por defecto de ritmo/horario. La edicion completa
 * (API keys, Telegram, SMTP...) llega en la Fase 7.
 */
rutasConfiguracion.get(
  '/configuracion',
  manejarAsync(async (_req, res) => {
    res.json(await repo.obtenerTodos());
  }),
);
