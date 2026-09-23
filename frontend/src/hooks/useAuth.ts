import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export type Usuario = { nombre: string | null; apellido: string | null; email: string | null };

type EstadoAuth = { cargando: boolean; usuario: Usuario | null };

/** Sesion del panel (seccion 8.5). Se consulta una vez al cargar la app. */
export function useAuth() {
  const [estado, setEstado] = useState<EstadoAuth>({ cargando: true, usuario: null });

  useEffect(() => {
    api
      .get<Usuario>('/auth/sesion')
      .then((usuario) => setEstado({ cargando: false, usuario }))
      .catch(() => setEstado({ cargando: false, usuario: null }));
  }, []);

  async function cerrarSesion() {
    await api.post('/auth/logout').catch(() => undefined);
    window.location.href = '/login';
  }

  return { ...estado, cerrarSesion };
}
