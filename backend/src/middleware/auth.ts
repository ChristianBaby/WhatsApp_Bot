import type { RequestHandler } from 'express';
import { noAutenticado } from '../lib/errors.js';

declare module 'express-session' {
  interface SessionData {
    usuarioId?: number;
    /** CSRF del login con Google: se genera antes de ir a Google y se valida al volver. */
    oauthState?: string;
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
