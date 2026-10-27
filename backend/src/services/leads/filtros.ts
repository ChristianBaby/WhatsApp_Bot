import { z } from 'zod';
import { solicitudInvalida } from '../../lib/errors.js';

/**
 * Filtro sobre los leads de una lista. Lo usan el dashboard de la lista, la
 * tabla de leads y las campanas (una campana puede escribirle solo a parte
 * de una lista: ej. prioridad alta y sin web). Un campo vacio no filtra.
 */
export const esquemaFiltroLeads = z
  .object({
    prioridad: z.array(z.enum(['alta', 'media', 'baja'])).max(3).optional(),
    tieneWeb: z.array(z.enum(['si', 'solo_redes', 'no'])).max(3).optional(),
    categoria: z.array(z.string().max(120)).max(50).optional(),
    zona: z.array(z.string().max(120)).max(50).optional(),
    calificacionMin: z.number().min(0).max(5).optional(),
    resenasMin: z.number().int().min(0).optional(),
    fichaReclamada: z.enum(['si', 'no']).optional(),
    etapa: z.array(z.string().max(40)).max(12).optional(),
  })
  .strict();

export type FiltroLeads = z.infer<typeof esquemaFiltroLeads>;

/** El filtro no restringe nada (equivale a toda la lista). */
export function filtroVacio(filtro: FiltroLeads | null | undefined): boolean {
  if (!filtro) return true;
  return Object.values(filtro).every((v) => v === undefined || (Array.isArray(v) && v.length === 0));
}

/** Filtro que llega por query string (?filtro={...}); null si no hay. */
export function filtroDeQuery(valor: unknown): FiltroLeads | null {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  let crudo: unknown;
  try {
    crudo = JSON.parse(valor);
  } catch {
    throw solicitudInvalida('El filtro no es un JSON valido');
  }
  const filtro = esquemaFiltroLeads.parse(crudo);
  return filtroVacio(filtro) ? null : filtro;
}

// Texto de datos_extra -> numero, sin romper la consulta si la celda trae texto ("sin nota").
const numeroExtra = (alias: string, clave: string) =>
  `(CASE WHEN ${alias}.datos_extra->>'${clave}' ~ '^[0-9]+([.,][0-9]+)?$'
         THEN replace(${alias}.datos_extra->>'${clave}', ',', '.')::numeric END)`;

/**
 * Condiciones SQL del filtro para la tabla leads (alias `alias`), con sus
 * parametros. Los parametros se agregan a `params` (los $n continuan desde
 * los que ya tenga). Devuelve 'TRUE' si el filtro no restringe nada.
 */
export function condicionFiltro(filtro: FiltroLeads | null | undefined, params: unknown[], alias = 'l'): string {
  if (!filtro || filtroVacio(filtro)) return 'TRUE';
  const partes: string[] = [];
  const param = (valor: unknown) => {
    params.push(valor);
    return `$${params.length}`;
  };
  const enLista = (clave: string, valores: string[] | undefined) => {
    if (valores?.length) partes.push(`${alias}.datos_extra->>'${clave}' = ANY(${param(valores)}::text[])`);
  };

  enLista('prioridad', filtro.prioridad);
  enLista('tiene_web', filtro.tieneWeb);
  enLista('categoria', filtro.categoria);
  enLista('zona', filtro.zona);
  if (filtro.calificacionMin !== undefined) partes.push(`${numeroExtra(alias, 'calificacion')} >= ${param(filtro.calificacionMin)}`);
  if (filtro.resenasMin !== undefined) partes.push(`COALESCE(${numeroExtra(alias, 'resenas')}, 0) >= ${param(filtro.resenasMin)}`);
  if (filtro.fichaReclamada) partes.push(`${alias}.datos_extra->>'ficha_reclamada' = ${param(filtro.fichaReclamada)}`);
  if (filtro.etapa?.length) partes.push(`${alias}.etapa_pipeline = ANY(${param(filtro.etapa)}::text[])`);

  return partes.length ? partes.join(' AND ') : 'TRUE';
}
