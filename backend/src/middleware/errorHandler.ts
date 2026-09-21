import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { ErrorApp } from '../lib/errors.js';
import { crearLogger } from '../lib/logger.js';

const log = crearLogger('http');

/** 404 para rutas de API que no existen. */
export const manejadorNoEncontrado: RequestHandler = (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada', codigo: 'NO_ENCONTRADO', ruta: req.path });
};

/**
 * Traduce cualquier error a una respuesta JSON. Los ErrorApp llevan mensaje
 * pensado para mostrarse al usuario; el resto se oculta como error interno
 * (y se registra completo en el log) para no filtrar detalles del sistema.
 */
export const manejadorErrores: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ErrorApp) {
    log.warn({ err: err.message, ruta: req.path }, 'Solicitud rechazada');
    res.status(err.estado).json({
      error: err.message,
      codigo: err.codigo,
      ...(err.detalles ? { detalles: err.detalles } : {}),
    });
    return;
  }

  // multer llama a next(err) directo (no pasa por manejarAsync) cuando el
  // archivo supera el limite de tamano, viene mal formado, etc.
  if (err instanceof MulterError) {
    const mensaje =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo es demasiado grande (maximo 8MB).'
        : 'No se pudo procesar el archivo subido.';
    log.warn({ err: err.message, ruta: req.path }, 'Error de subida de archivo');
    res.status(400).json({ error: mensaje, codigo: 'ARCHIVO_INVALIDO' });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Datos invalidos',
      codigo: 'SOLICITUD_INVALIDA',
      detalles: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
    });
    return;
  }

  log.error({ err, ruta: req.path, metodo: req.method }, 'Error no controlado');
  res.status(500).json({ error: 'Error interno del servidor', codigo: 'ERROR_INTERNO' });
};

/**
 * Envuelve un handler async para que sus rechazos lleguen al manejadorErrores.
 * Express 4 no propaga promesas rechazadas por su cuenta.
 */
export const manejarAsync =
  <T extends RequestHandler>(fn: T): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
