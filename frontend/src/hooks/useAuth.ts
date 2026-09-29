import { useEffect, useState } from 'react';
import { GATEWAY_URL, limpiarSesion, obtenerAccessToken, obtenerUsuario, type Usuario } from '../lib/authSession';

export type { Usuario };

type EstadoAuth = { cargando: boolean; usuario: Usuario | null };

/**
 * Sesion del panel via el ecosistema Ruwark (micro_login + Api_gateway).
 * El token/usuario ya quedaron guardados al hacer login (ver Login.tsx);
 * aca solo se confirma con el Gateway que el token sigue siendo valido —
 * micro_login puede revocar sesiones en caliente, asi que un token
 * localmente presente no siempre implica una sesion viva.
 */
export function useAuth() {
  const [estado, setEstado] = useState<EstadoAuth>({ cargando: true, usuario: null });

  useEffect(() => {
    const token = obtenerAccessToken();
    const usuario = obtenerUsuario();

    if (!token || !usuario) {
      setEstado({ cargando: false, usuario: null });
      return;
    }

    fetch(`${GATEWAY_URL}/api/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('sesion invalida');
        setEstado({ cargando: false, usuario });
      })
      .catch(() => {
        limpiarSesion();
        setEstado({ cargando: false, usuario: null });
      });
  }, []);

  async function cerrarSesion() {
    const token = obtenerAccessToken();
    if (token) {
      await fetch(`${GATEWAY_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
    limpiarSesion();
    window.location.href = '/login';
  }

  return { ...estado, cerrarSesion };
}
