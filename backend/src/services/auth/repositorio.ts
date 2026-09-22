import { consultarUno } from '../../db/pool.js';

export type Usuario = { id: number; usuario: string; contrasenaHash: string };

export async function buscarPorUsuario(usuario: string): Promise<Usuario | null> {
  const fila = await consultarUno<{ id: number; usuario: string; contrasena_hash: string }>(
    'SELECT id, usuario, contrasena_hash FROM usuarios WHERE usuario = $1',
    [usuario],
  );
  return fila ? { id: fila.id, usuario: fila.usuario, contrasenaHash: fila.contrasena_hash } : null;
}

export async function obtenerPorId(id: number): Promise<Pick<Usuario, 'id' | 'usuario'> | null> {
  const fila = await consultarUno<{ id: number; usuario: string }>('SELECT id, usuario FROM usuarios WHERE id = $1', [
    id,
  ]);
  return fila;
}

export async function contarUsuarios(): Promise<number> {
  const fila = await consultarUno<{ total: number }>('SELECT COUNT(*) AS total FROM usuarios');
  return fila?.total ?? 0;
}

export async function crearUsuario(usuario: string, contrasenaHash: string): Promise<void> {
  await consultarUno('INSERT INTO usuarios (usuario, contrasena_hash) VALUES ($1, $2)', [usuario, contrasenaHash]);
}

export async function actualizarUltimoAcceso(id: number): Promise<void> {
  await consultarUno('UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1', [id]);
}

/** Solo para el cambio de contraseña (Configuracion, Fase 7/8). */
export async function actualizarContrasena(id: number, contrasenaHash: string): Promise<void> {
  await consultarUno('UPDATE usuarios SET contrasena_hash = $2 WHERE id = $1', [id, contrasenaHash]);
}
