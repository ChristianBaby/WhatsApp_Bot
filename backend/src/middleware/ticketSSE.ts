import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { noAutenticado } from '../lib/errors.js';

/**
 * EventSource (SSE) no puede mandar el header Authorization, asi que no
 * puede pasar por requiereIdentidadGateway como el resto de /api/*. Por ahi
 * viaja el QR para conectar un numero de WhatsApp — no es algo que se pueda
 * dejar publico como los adjuntos. Solucion: un ticket de un solo uso, vida
 * muy corta, que solo se puede pedir ya autenticado (ver POST
 * /api/eventos/ticket), y que se consume al abrir el EventSource.
 */

const TICKET_TTL_MS = 15_000;
const tickets = new Map<string, number>();

function limpiarVencidos(): void {
  const ahora = Date.now();
  for (const [ticket, vence] of tickets) {
    if (vence < ahora) tickets.delete(ticket);
  }
}

export function crearTicketSSE(): string {
  limpiarVencidos();
  const ticket = crypto.randomUUID();
  tickets.set(ticket, Date.now() + TICKET_TTL_MS);
  return ticket;
}

export const requiereTicketSSE: RequestHandler = (req, _res, next) => {
  const ticket = String(req.query.ticket ?? '');
  const vence = ticket ? tickets.get(ticket) : undefined;

  if (!vence || vence < Date.now()) {
    next(noAutenticado('Ticket invalido o vencido'));
    return;
  }

  tickets.delete(ticket); // un solo uso
  next();
};
