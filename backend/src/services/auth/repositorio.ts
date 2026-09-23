import { consultarUno } from '../../db/pool.js';

export type Usuario = {
  id: number;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
  contrasenaHash: string | null;
};

type FilaUsuario = {
  id: number;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
  contrasena_hash: string | null;
};

const COLUMNAS = 'id, nombre, apellido, email, contrasena_hash';

function mapear(fila: FilaUsuario): Usuario {
  return {
    id: fila.id,
    nombre: fila.nombre,
    apellido: fila.apellido,
    email: fila.email,
    contrasenaHash: fila.contrasena_hash,
  };
}

export async function buscarPorEmail(email: string): Promise<Usuario | null> {
  const fila = await consultarUno<FilaUsuario>(`SELECT ${COLUMNAS} FROM usuarios WHERE LOWER(email) = LOWER($1)`, [
    email,
  ]);
  return fila ? mapear(fila) : null;
}

export async function buscarPorGoogleId(googleId: string): Promise<Usuario | null> {
  const fila = await consultarUno<FilaUsuario>(`SELECT ${COLUMNAS} FROM usuarios WHERE google_id = $1`, [googleId]);
  return fila ? mapear(fila) : null;
}

/** El admin de arranque (seccion 8.5) todavia se busca por su nombre de usuario heredado. */
export async function buscarPorUsuario(usuario: string): Promise<Pick<Usuario, 'id'> | null> {
  const fila = await consultarUno<{ id: number }>('SELECT id FROM usuarios WHERE usuario = $1', [usuario]);
  return fila;
}

export async function obtenerPorId(id: number): Promise<Pick<Usuario, 'id' | 'nombre' | 'apellido' | 'email'> | null> {
  const fila = await consultarUno<{ id: number; nombre: string | null; apellido: string | null; email: string | null }>(
    'SELECT id, nombre, apellido, email FROM usuarios WHERE id = $1',
    [id],
  );
  return fila;
}

export async function contarUsuarios(): Promise<number> {
  const fila = await consultarUno<{ total: number }>('SELECT COUNT(*) AS total FROM usuarios');
  return fila?.total ?? 0;
}

/** Bootstrap del admin original (arranque.ts), con usuario/contraseña como antes. */
export async function crearUsuario(usuario: string, contrasenaHash: string): Promise<number> {
  const fila = await consultarUno<{ id: number }>(
    'INSERT INTO usuarios (usuario, contrasena_hash) VALUES ($1, $2) RETURNING id',
    [usuario, contrasenaHash],
  );
  return fila!.id;
}

export type DatosRegistro = { nombre: string; apellido: string; email: string; contrasenaHash: string };

/** Registro abierto del panel: nombre, apellido, correo y contraseña. */
export async function registrarUsuario(datos: DatosRegistro): Promise<number> {
  const fila = await consultarUno<{ id: number }>(
    'INSERT INTO usuarios (nombre, apellido, email, contrasena_hash) VALUES ($1, $2, $3, $4) RETURNING id',
    [datos.nombre, datos.apellido, datos.email, datos.contrasenaHash],
  );
  return fila!.id;
}

export type DatosRegistroGoogle = { nombre: string; apellido: string; email: string; googleId: string };

/** Primera vez que esa cuenta de Google entra y no calzaba con ninguna existente: se crea sin contraseña. */
export async function registrarUsuarioGoogle(datos: DatosRegistroGoogle): Promise<number> {
  const fila = await consultarUno<{ id: number }>(
    'INSERT INTO usuarios (nombre, apellido, email, google_id) VALUES ($1, $2, $3, $4) RETURNING id',
    [datos.nombre, datos.apellido, datos.email, datos.googleId],
  );
  return fila!.id;
}

export async function vincularGoogle(id: number, googleId: string): Promise<void> {
  await consultarUno('UPDATE usuarios SET google_id = $2 WHERE id = $1', [id, googleId]);
}

/** Solo rellena el correo si el usuario todavia no tiene uno guardado. */
export async function establecerEmailSiFalta(id: number, email: string): Promise<void> {
  await consultarUno('UPDATE usuarios SET email = $2 WHERE id = $1 AND email IS NULL', [id, email]);
}

export async function actualizarUltimoAcceso(id: number): Promise<void> {
  await consultarUno('UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1', [id]);
}

/** Solo para el cambio de contraseña (Configuracion, Fase 7/8). */
export async function actualizarContrasena(id: number, contrasenaHash: string): Promise<void> {
  await consultarUno('UPDATE usuarios SET contrasena_hash = $2 WHERE id = $1', [id, contrasenaHash]);
}
