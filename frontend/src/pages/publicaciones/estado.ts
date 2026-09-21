import type { TonoBadge } from '../../components/ui/Badge';
import type { EstadoPublicacion } from '../../lib/types';

export const ESTADO_INFO: Record<EstadoPublicacion, { etiqueta: string; tono: TonoBadge }> = {
  borrador: { etiqueta: 'Borrador', tono: 'neutro' },
  programada: { etiqueta: 'Programada', tono: 'alerta' },
  en_curso: { etiqueta: 'En curso', tono: 'exito' },
  pausada: { etiqueta: 'Pausada', tono: 'peligro' },
  completada: { etiqueta: 'Completada', tono: 'info' },
  cancelada: { etiqueta: 'Cancelada', tono: 'neutro' },
};
