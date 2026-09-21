/**
 * Errores de la aplicacion. Un ErrorApp es un fallo *esperado* (validacion,
 * no encontrado, etc.) y se traduce a una respuesta HTTP limpia con un mensaje
 * pensado para que lo lea el usuario. Cualquier otro error se trata como bug.
 */
export class ErrorApp extends Error {
  constructor(
    mensaje: string,
    readonly estado: number = 400,
    readonly codigo: string = 'ERROR',
    readonly detalles?: unknown,
  ) {
    super(mensaje);
    this.name = 'ErrorApp';
  }
}

export const solicitudInvalida = (msg: string, detalles?: unknown) =>
  new ErrorApp(msg, 400, 'SOLICITUD_INVALIDA', detalles);

export const noAutenticado = (msg = 'No has iniciado sesion') =>
  new ErrorApp(msg, 401, 'NO_AUTENTICADO');

export const sinPermiso = (msg = 'Sin permiso') => new ErrorApp(msg, 403, 'SIN_PERMISO');

export const noEncontrado = (msg = 'No encontrado') => new ErrorApp(msg, 404, 'NO_ENCONTRADO');

export const conflicto = (msg: string, detalles?: unknown) =>
  new ErrorApp(msg, 409, 'CONFLICTO', detalles);
