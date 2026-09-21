import type { TonoBadge } from '../../components/ui/Badge';

/**
 * Etapas del mini-CRM que ya existen en esta fase (3.9). 'interesado',
 * 'no_interesado' y 'duda_precio' (sugeridas por IA) llegan en la Fase 5.
 */
export const ETAPA_INFO: Record<string, { etiqueta: string; tono: TonoBadge }> = {
  nuevo: { etiqueta: 'Nuevo', tono: 'neutro' },
  contactado: { etiqueta: 'Contactado', tono: 'neutro' },
  respondio: { etiqueta: 'Respondió', tono: 'info' },
  en_conversacion: { etiqueta: 'En conversación', tono: 'info' },
  venta_concretada: { etiqueta: 'Venta concretada', tono: 'exito' },
  descartado: { etiqueta: 'Descartado', tono: 'peligro' },
};

export function infoEtapa(etapa: string | null) {
  return etapa ? (ETAPA_INFO[etapa] ?? { etiqueta: etapa, tono: 'neutro' as TonoBadge }) : null;
}
