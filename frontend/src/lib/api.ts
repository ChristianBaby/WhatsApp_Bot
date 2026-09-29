/**
 * Cliente HTTP del panel. Centraliza el manejo de errores para que las
 * pantallas reciban datos ya tipados o una excepcion con mensaje legible.
 *
 * Habla con el backend a traves del Api_gateway (ecosistema Ruwark), nunca
 * directo: el Gateway agrega la identidad (X-User-Id, etc.) que el backend
 * exige. La autenticacion es Bearer token (ver lib/authSession.ts), no
 * cookie de sesion.
 */
import { GATEWAY_URL, limpiarSesion, obtenerAccessToken, refrescarToken } from './authSession';

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

const PREFIJO = `${GATEWAY_URL}/api/whatsapp`;

async function pedir<T>(ruta: string, opciones: RequestInit = {}, reintentando = false): Promise<T> {
  const esFormData = opciones.body instanceof FormData;
  const token = obtenerAccessToken();

  const res = await fetch(`${PREFIJO}${ruta}`, {
    ...opciones,
    headers: {
      ...(esFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opciones.headers,
    },
  });

  if (res.status === 401 && !reintentando) {
    const nuevoToken = await refrescarToken();
    if (nuevoToken) return pedir<T>(ruta, opciones, true);
    limpiarSesion();
    window.location.href = '/login';
    throw new ErrorApi('Sesion expirada', 401, 'SESION_EXPIRADA');
  }

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

/**
 * URL absoluta (a traves del Gateway) para un asset que el backend sirve en
 * una ruta propia tipo /api/uploads/archivo.jpg. El backend no sabe que
 * esta detras de un Gateway con prefijo /api/whatsapp, asi que esa
 * traduccion se hace aca, en el unico lugar que sí lo sabe.
 */
export const urlAsset = (rutaBackend: string): string => {
  const sinApi = rutaBackend.startsWith('/api') ? rutaBackend.slice(4) : rutaBackend;
  return `${PREFIJO}${sinApi}`;
};

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
