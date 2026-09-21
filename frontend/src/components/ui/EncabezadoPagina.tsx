import type { ReactNode } from 'react';
import estilos from './EncabezadoPagina.module.css';

type Props = {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
};

/** Titulo + bajada + acciones, con el espaciado exacto de la maquetacion. */
export function EncabezadoPagina({ titulo, descripcion, acciones }: Props) {
  return (
    <header className={estilos.encabezado}>
      <div>
        <h1 className={estilos.titulo}>{titulo}</h1>
        {descripcion && <p className={estilos.descripcion}>{descripcion}</p>}
      </div>
      {acciones && <div className={estilos.acciones}>{acciones}</div>}
    </header>
  );
}
