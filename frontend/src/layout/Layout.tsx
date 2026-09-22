import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useEstadoPanel } from '../hooks/useEstadoPanel';
import estilos from './Layout.module.css';

type Props = {
  usuario: string | null;
  onCerrarSesion: () => void;
};

/**
 * Armazon del panel: sidebar fijo a la izquierda y area de contenido
 * scrolleable a la derecha, tal como la maquetacion.
 */
export function Layout({ usuario, onCerrarSesion }: Props) {
  const indicadores = useEstadoPanel();

  return (
    <div className={estilos.app}>
      <Sidebar indicadores={indicadores} usuario={usuario} onCerrarSesion={onCerrarSesion} />
      <main className={`${estilos.contenido} scroll`}>
        <Outlet />
      </main>
    </div>
  );
}
