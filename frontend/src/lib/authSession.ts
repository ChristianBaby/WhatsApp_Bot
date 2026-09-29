/**
 * Sesion del panel via el ecosistema Ruwark (micro_login + Api_gateway).
 * Ya no hay cookie de sesion propia: el Gateway trabaja con
 * Authorization: Bearer <token>, guardado en localStorage (si "recordarme")
 * o sessionStorage — mismo contrato que frontend_universoft
 * (src/lib/auth-session.ts) para no reinventar el esquema del ecosistema.
 */

export type Usuario = {
  id: string;
  email?: string;
  nombre?: string;
  rol?: string;
};

const CLAVE_ACCESS = 'accessToken';
const CLAVE_REFRESH = 'refreshToken';
const CLAVE_USUARIO = 'usuario';

export const GATEWAY_URL = (import.meta.env.VITE_GATEWAY_URL as string | undefined) || 'http://localhost:8080';

function almacenes(): Storage[] {
  return [localStorage, sessionStorage];
}

export function obtenerAccessToken(): string | null {
  for (const s of almacenes()) {
    const valor = s.getItem(CLAVE_ACCESS);
    if (valor) return valor;
  }
  return null;
}

function obtenerRefreshToken(): string | null {
  for (const s of almacenes()) {
    const valor = s.getItem(CLAVE_REFRESH);
    if (valor) return valor;
  }
  return null;
}

export function obtenerUsuario(): Usuario | null {
  for (const s of almacenes()) {
    const crudo = s.getItem(CLAVE_USUARIO);
    if (crudo) {
      try {
        return JSON.parse(crudo) as Usuario;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function guardarSesion(
  datos: { accessToken: string; refreshToken: string; usuario: Usuario },
  recordar: boolean,
): void {
  const destino = recordar ? localStorage : sessionStorage;
  const otro = recordar ? sessionStorage : localStorage;
  destino.setItem(CLAVE_ACCESS, datos.accessToken);
  destino.setItem(CLAVE_REFRESH, datos.refreshToken);
  destino.setItem(CLAVE_USUARIO, JSON.stringify(datos.usuario));
  otro.removeItem(CLAVE_ACCESS);
  otro.removeItem(CLAVE_REFRESH);
  otro.removeItem(CLAVE_USUARIO);
}

export function limpiarSesion(): void {
  for (const s of almacenes()) {
    s.removeItem(CLAVE_ACCESS);
    s.removeItem(CLAVE_REFRESH);
    s.removeItem(CLAVE_USUARIO);
  }
}

let refrescoEnCurso: Promise<string | null> | null = null;

/** Rotacion real: micro_login invalida el refresh token usado y entrega uno nuevo. */
export function refrescarToken(): Promise<string | null> {
  if (refrescoEnCurso) return refrescoEnCurso;

  refrescoEnCurso = (async () => {
    const refreshToken = obtenerRefreshToken();
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${GATEWAY_URL}/api/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) throw new Error('refresh_fallido');

      const cuerpo = (await res.json()) as { data?: { accessToken?: string; refreshToken?: string } };
      const nuevoAccess = cuerpo.data?.accessToken;
      const nuevoRefresh = cuerpo.data?.refreshToken;
      if (!nuevoAccess || !nuevoRefresh) throw new Error('respuesta_invalida');

      const recordaba = localStorage.getItem(CLAVE_ACCESS) !== null;
      const destino = recordaba ? localStorage : sessionStorage;
      destino.setItem(CLAVE_ACCESS, nuevoAccess);
      destino.setItem(CLAVE_REFRESH, nuevoRefresh);
      return nuevoAccess;
    } catch {
      limpiarSesion();
      return null;
    } finally {
      refrescoEnCurso = null;
    }
  })();

  return refrescoEnCurso;
}
