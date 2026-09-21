import type { ReactNode } from 'react';
import estilos from './Badge.module.css';

/** Los tonos de estado del sistema de diseño (los 4 de la maquetacion + peligro). */
export type TonoBadge = 'exito' | 'alerta' | 'info' | 'neutro' | 'peligro';

const TONOS: Record<TonoBadge, { fondo: string; color: string }> = {
  exito: { fondo: 'var(--exito-fondo)', color: 'var(--exito)' },
  alerta: { fondo: 'var(--alerta-fondo)', color: 'var(--alerta)' },
  info: { fondo: 'var(--info-fondo)', color: 'var(--info)' },
  neutro: { fondo: 'var(--fondo-neutro)', color: 'var(--texto-tenue-2)' },
  peligro: { fondo: 'var(--peligro-fondo)', color: 'var(--peligro)' },
};

export function Badge({ tono = 'neutro', children }: { tono?: TonoBadge; children: ReactNode }) {
  const { fondo, color } = TONOS[tono];
  return (
    <span className={estilos.badge} style={{ background: fondo, color }}>
      {children}
    </span>
  );
}
