import type { RequestHandler } from 'express';
import { noAutenticado } from '../lib/errors.js';

declare module 'express-session' {
  interface SessionData {
    usuarioId?: number;
  }
}

/** Protege una ruta: exige que haya una sesion de panel iniciada (seccion 8.5). */
export const requiereSesion: RequestHandler = (req, _res, next) => {
  if (!req.session.usuarioId) {
    next(noAutenticado());
    return;
  }
  next();
};
