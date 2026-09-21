import type { ReactNode } from 'react';
import estilos from './EstadoVacio.module.css';

type Props = {
  titulo: string;
  detalle?: string;
  accion?: ReactNode;
};

/**
 * Mensaje para cuando todavia no hay datos. Evita la pantalla en blanco
 * que hace dudar de si el sistema esta roto o simplemente vacio.
 */
export function EstadoVacio({ titulo, detalle, accion }: Props) {
  return (
    <div className={estilos.vacio}>
      <div className={estilos.titulo}>{titulo}</div>
      {detalle && <div className={estilos.detalle}>{detalle}</div>}
      {accion}
    </div>
  );
}
