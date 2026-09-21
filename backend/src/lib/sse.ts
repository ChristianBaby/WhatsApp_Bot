import type { Request, Response } from 'express';
import { crearLogger } from './logger.js';

const log = crearLogger('sse');

/**
 * Hub de Server-Sent Events. Es el canal por el que el panel se entera en vivo
 * de: QR y estado de cada numero, progreso de campana, respuestas nuevas y
 * mensajes del chat integrado — sin que el navegador tenga que preguntar.
 *
 * Los clientes se suscriben a "canales" (ej. 'numeros', 'publicacion:12') y
 * solo reciben lo de los suyos.
 */

type Cliente = {
  id: number;
  res: Response;
  canales: Set<string>;
};

const clientes = new Map<number, Cliente>();
let siguienteId = 1;

/** Handler de Express que abre la conexion SSE y la mantiene viva. */
export function manejadorSSE(req: Request, res: Response): void {
  const canales = String(req.query.canales ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Evita que un proxy intermedio (Coolify/Traefik) acumule la respuesta.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const id = siguienteId++;
  clientes.set(id, { id, res, canales: new Set(canales) });
  log.debug({ id, canales }, 'Cliente SSE conectado');

  res.write('retry: 3000\n\n');
  res.write(`event: listo\ndata: ${JSON.stringify({ canales })}\n\n`);

  // Un comentario cada 25s evita que proxies y navegadores corten la conexion.
  const latido = setInterval(() => res.write(': latido\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(latido);
    clientes.delete(id);
    log.debug({ id }, 'Cliente SSE desconectado');
  });
}

/** Envia un evento a todos los clientes suscritos a ese canal. */
export function emitir(canal: string, evento: string, datos: unknown): void {
  const payload = `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`;
  for (const cliente of clientes.values()) {
    if (cliente.canales.has(canal)) cliente.res.write(payload);
  }
}

/** Cuantos clientes hay conectados (para el healthcheck y diagnostico). */
export const clientesConectados = (): number => clientes.size;

/** Cierra todas las conexiones — se usa en el apagado ordenado. */
export function cerrarTodos(): void {
  for (const cliente of clientes.values()) cliente.res.end();
  clientes.clear();
}
