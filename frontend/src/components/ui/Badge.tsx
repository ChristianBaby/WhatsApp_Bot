import type { ReactNode } from 'react';
import estilos from './Badge.module.css';

/** Los cuatro tonos de estado que usa la maquetacion. */
export type TonoBadge = 'exito' | 'alerta' | 'info' | 'neutro';

const TONOS: Record<TonoBadge, { fondo: string; color: string }> = {
  exito: { fondo: 'var(--exito-fondo)', color: 'var(--exito)' },
  alerta: { fondo: 'var(--alerta-fondo)', color: 'var(--alerta)' },
  info: { fondo: 'var(--info-fondo)', color: 'var(--info)' },
  neutro: { fondo: 'var(--fondo-neutro)', color: 'var(--texto-tenue-2)' },
};

export function Badge({ tono = 'neutro', children }: { tono?: TonoBadge; children: ReactNode }) {
  const { fondo, color } = TONOS[tono];
  return (
    <span className={estilos.badge} style={{ background: fondo, color }}>
      {children}
    </span>
  );
}
