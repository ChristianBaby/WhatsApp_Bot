import type { RequestHandler } from 'express';
import { consultar, consultarUno } from '../../db/pool.js';
import { crearLogger } from '../../lib/logger.js';

/**
 * Las personas que usan el panel. La identidad la resuelve el Gateway
 * (micro_login); aca solo se recuerda quien entro, para poder asignarle chats.
 */

const log = crearLogger('crm-usuarios');

export type UsuarioPanel = { id: string; email: string | null; rol: string | null; ultimoAcceso: string };

/** No se escribe en la base en cada pedido: una vez cada 10 minutos por persona alcanza. */
const CADA_MS = 10 * 60 * 1000;
const vistos = new Map<string, number>();

export async function registrarAcceso(usuario: { id: string; email?: string; rol?: string }): Promise<void> {
  await consultarUno(
    `INSERT INTO usuarios_panel (id, email, rol) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET email = COALESCE(EXCLUDED.email, usuarios_panel.email),
       rol = COALESCE(EXCLUDED.rol, usuarios_panel.rol), ultimo_acceso = now()`,
    [usuario.id, usuario.email ?? null, usuario.rol ?? null],
  );
}

/** Middleware: anota a quien usa el panel (sin frenar el pedido si falla). */
export const anotarUsuario: RequestHandler = (req, _res, next) => {
  const usuario = req.usuario;
  if (usuario) {
    const ultimo = vistos.get(usuario.id) ?? 0;
    if (Date.now() - ultimo > CADA_MS) {
      vistos.set(usuario.id, Date.now());
      registrarAcceso(usuario).catch((err: unknown) => {
        vistos.delete(usuario.id);
        log.warn({ err }, 'No se pudo registrar el acceso al panel');
      });
    }
  }
  next();
};

export async function listar(): Promise<UsuarioPanel[]> {
  const filas = await consultar<{ id: string; email: string | null; rol: string | null; ultimo_acceso: string }>(
    'SELECT id, email, rol, ultimo_acceso FROM usuarios_panel ORDER BY lower(COALESCE(email, id))',
  );
  return filas.map((f) => ({ id: f.id, email: f.email, rol: f.rol, ultimoAcceso: f.ultimo_acceso }));
}

export async function existe(id: string): Promise<boolean> {
  return Boolean(await consultarUno('SELECT 1 FROM usuarios_panel WHERE id = $1', [id]));
}
