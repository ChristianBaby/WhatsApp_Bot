import type { ButtonHTMLAttributes, ReactNode } from 'react';
import estilos from './Boton.module.css';

type Variante = 'primario' | 'secundario' | 'peligro' | 'texto';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  ancho?: boolean;
  children: ReactNode;
};

/** Boton del panel. Las cuatro variantes cubren todos los botones de la maquetacion. */
export function Boton({ variante = 'primario', ancho, className = '', ...props }: Props) {
  const clases = [estilos.base, estilos[variante], ancho ? estilos.ancho : '', className]
    .filter(Boolean)
    .join(' ');

  return <button type="button" className={clases} {...props} />;
}
