import type { TonoBadge } from '../../components/ui/Badge';
import type { MotivoExclusion } from '../../lib/types';

/** Usado tanto en la previsualizacion como en el detalle de listas ya guardadas. */
export const ETIQUETA_MOTIVO: Record<MotivoExclusion, string> = {
  sin_telefono: 'Sin teléfono',
  telefono_invalido: 'Teléfono inválido',
  sin_empresa: 'Sin nombre de empresa',
  duplicado: 'Duplicado',
};

export const TONO_MOTIVO: Record<MotivoExclusion, TonoBadge> = {
  sin_telefono: 'alerta',
  telefono_invalido: 'alerta',
  sin_empresa: 'alerta',
  duplicado: 'info',
};
