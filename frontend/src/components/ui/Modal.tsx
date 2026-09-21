import { useEffect, type ReactNode } from 'react';
import { Icono } from './Icono';
import estilos from './Modal.module.css';

type Props = {
  titulo: string;
  onCerrar: () => void;
  ancho?: boolean;
  children: ReactNode;
};

/** Modal simple: fondo oscuro + caja centrada. Cierra con Escape o clic afuera. */
export function Modal({ titulo, onCerrar, ancho, children }: Props) {
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alTecla);
    return () => document.removeEventListener('keydown', alTecla);
  }, [onCerrar]);

  return (
    <div className={estilos.fondo} onClick={onCerrar}>
      <div
        className={`${estilos.caja} ${ancho ? estilos.ancho : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className={estilos.encabezado}>
          <div className={estilos.titulo}>{titulo}</div>
          <button className={estilos.cerrar} onClick={onCerrar} aria-label="Cerrar">
            <Icono nombre="cerrar" tamano={18} />
          </button>
        </div>
        <div className={estilos.cuerpo}>{children}</div>
      </div>
    </div>
  );
}
