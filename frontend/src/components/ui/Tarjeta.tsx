import type { HTMLAttributes, ReactNode } from 'react';
import estilos from './Tarjeta.module.css';

type Props = HTMLAttributes<HTMLDivElement> & {
  /** Para tablas y listas que pintan su propio espaciado interno. */
  sinPadding?: boolean;
  children: ReactNode;
};

/** Contenedor blanco con borde y radio — la unidad visual base del panel. */
export function Tarjeta({ sinPadding, className = '', ...props }: Props) {
  const clases = [estilos.tarjeta, sinPadding ? estilos.sinPadding : '', className]
    .filter(Boolean)
    .join(' ');

  return <div className={clases} {...props} />;
}
