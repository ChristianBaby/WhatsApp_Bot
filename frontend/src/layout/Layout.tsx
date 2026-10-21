import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useEstadoPanel } from '../hooks/useEstadoPanel';
import type { Usuario } from '../hooks/useAuth';
import estilos from './Layout.module.css';

type Props = {
  usuario: Usuario | null;
  onCerrarSesion: () => void;
};

const CLAVE_COMPACTO = 'sidebar_compacto';

function leerCompacto(): boolean {
  try {
    if (localStorage.getItem(CLAVE_COMPACTO) !== null) return localStorage.getItem(CLAVE_COMPACTO) === 'true';
  } catch {
    /* localStorage bloqueado: se decide por el ancho */
  }
  return window.innerWidth < 1100;
}

/**
 * Armazon del panel: sidebar a la izquierda (contraible) y, a la derecha,
 * la barra superior fija con el contenido scrolleable debajo.
 */
export function Layout({ usuario, onCerrarSesion }: Props) {
  const indicadores = useEstadoPanel();
  const { pathname } = useLocation();
  const [compacto, setCompacto] = useState(leerCompacto);
  const [angosto, setAngosto] = useState(() => window.innerWidth < 900);

  useEffect(() => {
    const alCambiar = () => setAngosto(window.innerWidth < 900);
    window.addEventListener('resize', alCambiar);
    return () => window.removeEventListener('resize', alCambiar);
  }, []);

  const alternarCompacto = useCallback(() => {
    setCompacto((actual) => {
      const siguiente = !actual;
      try {
        localStorage.setItem(CLAVE_COMPACTO, String(siguiente));
      } catch {
        /* se recuerda solo en esta pestana */
      }
      return siguiente;
    });
  }, []);

  return (
    <div className={estilos.app}>
      <Sidebar indicadores={indicadores} compacto={compacto || angosto} onAlternarCompacto={alternarCompacto} />
      <div className={estilos.columna}>
        <Topbar indicadores={indicadores} usuario={usuario} onCerrarSesion={onCerrarSesion} />
        <main className={`${estilos.contenido} scroll`}>
          <div className={estilos.pagina} key={pathname}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
