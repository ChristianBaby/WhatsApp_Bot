import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useEstadoPanel } from '../hooks/useEstadoPanel';
import estilos from './Layout.module.css';

/**
 * Armazon del panel: sidebar fijo a la izquierda y area de contenido
 * scrolleable a la derecha, tal como la maquetacion.
 */
export function Layout() {
  const indicadores = useEstadoPanel();

  return (
    <div className={estilos.app}>
      <Sidebar indicadores={indicadores} />
      <main className={`${estilos.contenido} scroll`}>
        <Outlet />
      </main>
    </div>
  );
}
