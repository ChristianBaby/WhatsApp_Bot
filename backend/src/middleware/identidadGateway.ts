import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { noAutenticado } from '../lib/errors.js';

declare global {
  namespace Express {
    interface Request {
      usuario?: { id: string; email?: string; rol?: string };
    }
  }
}

function tokenValido(recibido: string | undefined): boolean {
  if (!recibido) return false;
  const esperado = Buffer.from(env.MICROSERVICE_TOKEN);
  const real = Buffer.from(recibido);
  if (esperado.length !== real.length) return false;
  return crypto.timingSafeEqual(esperado, real);
}

/**
 * Reemplaza la sesion propia del panel (seccion 8.5, ahora migrada). La
 * identidad ya no vive aqui: la resuelve micro_login y el Api_gateway la
 * verifica en cada request (incluso revocacion en caliente, ver
 * session.middleware.js del gateway) antes de reenviar. Este middleware solo
 * confia en esos headers si el request trae el mismo MICROSERVICE_TOKEN que
 * el Gateway — asi el backend nunca queda expuesto a un llamador directo
 * que se salte el Gateway.
 */
export const requiereIdentidadGateway: RequestHandler = (req, _res, next) => {
  const token = req.header('x-service-token');
  if (!tokenValido(token)) {
    next(noAutenticado('Este servicio solo acepta trafico del Api Gateway'));
    return;
  }

  const id = req.header('x-user-id');
  if (!id) {
    next(noAutenticado());
    return;
  }

  req.usuario = {
    id,
    email: req.header('x-user-email') || undefined,
    rol: req.header('x-user-role') || undefined,
  };
  next();
};

/**
 * Version liviana para assets publicos servidos a traves del Gateway (ej.
 * imagenes/videos de una publicacion, que un <img>/<video> del navegador no
 * puede pedir con headers de autenticacion). Solo exige el token de
 * servicio — nunca queda expuesto a internet directo — sin exigir un
 * usuario autenticado.
 */
export const requiereTokenGateway: RequestHandler = (req, _res, next) => {
  if (!tokenValido(req.header('x-service-token'))) {
    next(noAutenticado('Este servicio solo acepta trafico del Api Gateway'));
    return;
  }
  next();
};
