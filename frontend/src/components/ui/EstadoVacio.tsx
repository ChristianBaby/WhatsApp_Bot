import type { ReactNode } from 'react';
import { Icono, type NombreIcono } from './Icono';
import estilos from './EstadoVacio.module.css';

type Props = {
  titulo: string;
  detalle?: string;
  accion?: ReactNode;
  /** Icono del circulo superior; por defecto una bandeja. */
  icono?: NombreIcono;
};

/**
 * Mensaje para cuando todavia no hay datos. Evita la pantalla en blanco
 * que hace dudar de si el sistema esta roto o simplemente vacio.
 * Con el titulo "Cargando…" muestra un indicador de carga en vez del icono.
 */
export function EstadoVacio({ titulo, detalle, accion, icono = 'bandeja' }: Props) {
  const cargando = titulo.startsWith('Cargando');
  return (
    <div className={estilos.vacio}>
      {cargando ? (
        <span className={estilos.spinner} aria-hidden="true" />
      ) : (
        <span className={estilos.icono}>
          <Icono nombre={icono} tamano={20} />
        </span>
      )}
      <div className={cargando ? estilos.tituloCargando : estilos.titulo}>{titulo}</div>
      {detalle && <div className={estilos.detalle}>{detalle}</div>}
      {accion}
    </div>
  );
}
