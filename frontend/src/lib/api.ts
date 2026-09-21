/**
 * Cliente HTTP del panel. Centraliza el manejo de errores para que las
 * pantallas reciban datos ya tipados o una excepcion con mensaje legible.
 */

export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    readonly estado: number,
    readonly codigo: string,
    readonly detalles?: unknown,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

type RespuestaError = { error?: string; codigo?: string; detalles?: unknown };

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const esFormData = opciones.body instanceof FormData;

  const res = await fetch(`/api${ruta}`, {
    ...opciones,
    headers: {
      ...(esFormData ? {} : { 'Content-Type': 'application/json' }),
      ...opciones.headers,
    },
  });

  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => ({}))) as RespuestaError;
    throw new ErrorApi(
      cuerpo.error ?? `Error ${res.status}`,
      res.status,
      cuerpo.codigo ?? 'ERROR',
      cuerpo.detalles,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(ruta: string) => pedir<T>(ruta),

  post: <T>(ruta: string, datos?: unknown) =>
    pedir<T>(ruta, {
      method: 'POST',
      body: datos instanceof FormData ? datos : JSON.stringify(datos ?? {}),
    }),

  patch: <T>(ruta: string, datos?: unknown) =>
    pedir<T>(ruta, { method: 'PATCH', body: JSON.stringify(datos ?? {}) }),

  delete: <T>(ruta: string) => pedir<T>(ruta, { method: 'DELETE' }),
};
