import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type EstadoAuth = { cargando: boolean; usuario: string | null };

/** Sesion del panel (seccion 8.5). Se consulta una vez al cargar la app. */
export function useAuth() {
  const [estado, setEstado] = useState<EstadoAuth>({ cargando: true, usuario: null });

  useEffect(() => {
    api
      .get<{ usuario: string }>('/auth/sesion')
      .then((r) => setEstado({ cargando: false, usuario: r.usuario }))
      .catch(() => setEstado({ cargando: false, usuario: null }));
  }, []);

  async function cerrarSesion() {
    await api.post('/auth/logout').catch(() => undefined);
    window.location.href = '/login';
  }

  return { ...estado, cerrarSesion };
}
