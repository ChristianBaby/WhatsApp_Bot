import { consultar } from '../../db/pool.js';
import { numeroDe } from './enriquecimiento.js';
import { condicionFiltro, type FiltroLeads } from './filtros.js';

/**
 * Dashboard de una lista de leads: cuantos hay y como se reparten (prioridad,
 * web, categoria, zona, reputacion, ficha de Google, etapa del pipeline).
 * Con filtro, todo se calcula sobre los leads que lo cumplen; las opciones
 * de categoria y zona salen siempre de la lista completa (para los selectores).
 */

export type Conteo = { valor: string; total: number };

export type ResumenLista = {
  total: number;
  /** Ya recibieron al menos una campana. */
  contactados: number;
  /** Pidieron no recibir mensajes. */
  bloqueados: number;
  calificacionPromedio: number | null;
  porPrioridad: Conteo[];
  porTieneWeb: Conteo[];
  porFichaReclamada: Conteo[];
  porEtapa: Conteo[];
  porCategoria: Conteo[];
  porZona: Conteo[];
  porCalificacion: Conteo[];
  porResenas: Conteo[];
  /** Filas del archivo que no entraron a la lista, por motivo. */
  excluidosAlSubir: Conteo[];
  opciones: { categorias: string[]; zonas: string[] };
};

type FilaResumen = {
  datos_extra: Record<string, string>;
  etapa_pipeline: string;
  bloqueado: boolean;
  contactado: boolean;
};

const TOPE_CATEGORIAS = 12;

function contar(valores: string[], orden?: string[]): Conteo[] {
  const conteo = new Map<string, number>();
  for (const v of valores) conteo.set(v, (conteo.get(v) ?? 0) + 1);
  const lista = [...conteo].map(([valor, total]) => ({ valor, total }));
  if (orden) return orden.filter((v) => conteo.has(v)).map((v) => ({ valor: v, total: conteo.get(v)! }));
  return lista.sort((a, b) => b.total - a.total);
}

/** Las mas frecuentes y el resto sumado en "Otras". */
function conTope(conteos: Conteo[], tope: number, etiquetaResto: string): Conteo[] {
  if (conteos.length <= tope) return conteos;
  const resto = conteos.slice(tope).reduce((suma, c) => suma + c.total, 0);
  return [...conteos.slice(0, tope), { valor: etiquetaResto, total: resto }];
}

function rangoCalificacion(texto: string | undefined): string {
  const n = numeroDe(texto);
  if (n === null || n === 0) return 'Sin calificación';
  if (n < 4) return 'Menos de 4';
  if (n < 4.5) return '4 a 4.4';
  return '4.5 o más';
}

function rangoResenas(texto: string | undefined): string {
  const n = numeroDe(texto) ?? 0;
  if (n === 0) return 'Sin reseñas';
  if (n < 30) return '1 a 29';
  if (n < 100) return '30 a 99';
  return '100 o más';
}

export async function resumenDeLista(listaId: number, filtro: FiltroLeads | null): Promise<ResumenLista> {
  const params: unknown[] = [listaId];
  const condicion = condicionFiltro(filtro, params);
  const filas = await consultar<FilaResumen>(
    `SELECT l.datos_extra, l.etapa_pipeline,
       EXISTS (SELECT 1 FROM contactos_bloqueados b WHERE b.telefono = l.telefono) AS bloqueado,
       EXISTS (SELECT 1 FROM publicacion_destinatarios pd WHERE pd.lead_id = l.id AND pd.estado = 'enviado') AS contactado
     FROM leads l WHERE l.lista_id = $1 AND ${condicion}`,
    params,
  );

  // Opciones de los selectores: de toda la lista, no solo de lo filtrado.
  const opciones = await consultar<{ clave: string; valor: string }>(
    `SELECT DISTINCT 'categoria' AS clave, datos_extra->>'categoria' AS valor FROM leads WHERE lista_id = $1 AND datos_extra ? 'categoria'
     UNION SELECT DISTINCT 'zona', datos_extra->>'zona' FROM leads WHERE lista_id = $1 AND datos_extra ? 'zona'
     ORDER BY 2`,
    [listaId],
  );

  const excluidos = await consultar<{ motivo: string; total: number }>(
    'SELECT motivo, COUNT(*)::int AS total FROM leads_excluidos WHERE lista_id = $1 GROUP BY motivo ORDER BY total DESC',
    [listaId],
  );

  const extra = (clave: string) => filas.map((f) => f.datos_extra[clave]).filter((v): v is string => Boolean(v));
  const notas = filas.map((f) => numeroDe(f.datos_extra.calificacion)).filter((n): n is number => n !== null && n > 0);

  return {
    total: filas.length,
    contactados: filas.filter((f) => f.contactado).length,
    bloqueados: filas.filter((f) => f.bloqueado).length,
    calificacionPromedio: notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 100) / 100 : null,
    porPrioridad: contar(extra('prioridad'), ['alta', 'media', 'baja']),
    porTieneWeb: contar(extra('tiene_web'), ['no', 'solo_redes', 'si']),
    porFichaReclamada: contar(extra('ficha_reclamada'), ['no', 'si']),
    porEtapa: contar(filas.map((f) => f.etapa_pipeline)),
    porCategoria: conTope(contar(extra('categoria')), TOPE_CATEGORIAS, 'Otras'),
    porZona: conTope(contar(extra('zona')), TOPE_CATEGORIAS, 'Otras'),
    porCalificacion: contar(
      filas.map((f) => rangoCalificacion(f.datos_extra.calificacion)),
      ['4.5 o más', '4 a 4.4', 'Menos de 4', 'Sin calificación'],
    ),
    porResenas: contar(filas.map((f) => rangoResenas(f.datos_extra.resenas)), ['100 o más', '30 a 99', '1 a 29', 'Sin reseñas']),
    excluidosAlSubir: excluidos.map((e) => ({ valor: e.motivo, total: e.total })),
    opciones: {
      categorias: opciones.filter((o) => o.clave === 'categoria').map((o) => o.valor),
      zonas: opciones.filter((o) => o.clave === 'zona').map((o) => o.valor),
    },
  };
}
