import { consultar, consultarUno } from '../../db/pool.js';
import type {
  CampanaResumen,
  DesgloseCampana,
  DetalleCampana,
  EtapaEmbudo,
  FiltrosReportes,
  FilaLogCampana,
  KpisGenerales,
  ResumenAutoResponder,
  RubroResumen,
} from './tipos.js';

/**
 * Todas las agregaciones de la pantalla de Reportes (seccion 3.7).
 *
 * Las metricas de campanas se calculan sobre los ENVIOS (publicacion_destinatarios):
 * una respuesta cuenta para el envio al que responde (respondio_en, dentro
 * de 30 dias). Antes salian de la etapa actual del lead, lo que inflaba la
 * tasa de una campana con respuestas a otras.
 */

function rangoFechas(f: FiltrosReportes): [string | null, string | null] {
  return [f.desde, f.hasta];
}

function tasa(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 1000) / 10 : 0;
}

function minutos(valor: number | null): number | null {
  return valor === null ? null : Math.round(valor);
}

// Pidio la baja dentro de los 30 dias posteriores a ESE envio.
const SQL_DIO_BAJA = `EXISTS (
  SELECT 1 FROM contactos_bloqueados b
  WHERE b.telefono = l.telefono AND b.motivo = 'pidio_baja'
    AND b.creado_en >= pd.enviado_en AND b.creado_en < pd.enviado_en + interval '30 days'
)`;

// Mediana de minutos entre el envio y la primera respuesta.
const SQL_MEDIANA_RESPUESTA = `percentile_cont(0.5) WITHIN GROUP (
  ORDER BY EXTRACT(EPOCH FROM (pd.respondio_en - pd.enviado_en)) / 60
) FILTER (WHERE pd.respondio_en IS NOT NULL)`;

// Envios del periodo (por fecha de envio) y rubro.
const SQL_ENVIOS_FILTRADOS = `
  FROM publicacion_destinatarios pd
  JOIN leads l ON l.id = pd.lead_id
  WHERE pd.estado = 'enviado'
    AND ($1::timestamptz IS NULL OR pd.enviado_en >= $1)
    AND ($2::timestamptz IS NULL OR pd.enviado_en <= $2)
    AND ($3::text IS NULL OR l.rubro = $3)`;

export async function obtenerKpis(f: FiltrosReportes): Promise<KpisGenerales> {
  const [desde, hasta] = rangoFechas(f);

  const envios = await consultarUno<{
    enviados: number;
    entregados: number;
    leidos: number;
    respondieron: number;
    bajas: number;
    mediana: number | null;
    leads: number;
    leads_venta: number;
  }>(
    `SELECT
       COUNT(*)::int AS enviados,
       COUNT(*) FILTER (WHERE pd.entregado_en IS NOT NULL)::int AS entregados,
       COUNT(*) FILTER (WHERE pd.leido_en IS NOT NULL)::int AS leidos,
       COUNT(*) FILTER (WHERE pd.respondio_en IS NOT NULL)::int AS respondieron,
       COUNT(*) FILTER (WHERE ${SQL_DIO_BAJA})::int AS bajas,
       ${SQL_MEDIANA_RESPUESTA} AS mediana,
       COUNT(DISTINCT l.id)::int AS leads,
       COUNT(DISTINCT l.id) FILTER (WHERE l.etapa_pipeline = 'venta_concretada')::int AS leads_venta
     ${SQL_ENVIOS_FILTRADOS}`,
    [desde, hasta, f.rubro],
  );

  const ventasEnPeriodo = await consultarUno<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM leads
     WHERE etapa_pipeline = 'venta_concretada'
       AND ($1::timestamptz IS NULL OR venta_concretada_en >= $1)
       AND ($2::timestamptz IS NULL OR venta_concretada_en <= $2)
       AND ($3::text IS NULL OR rubro = $3)`,
    [desde, hasta, f.rubro],
  );

  const e = envios!;
  return {
    mensajesEnviados: e.enviados,
    entregados: e.entregados,
    leidos: e.leidos,
    respondieron: e.respondieron,
    tasaRespuesta: tasa(e.respondieron, e.enviados),
    tasaLectura: tasa(e.leidos, e.entregados),
    bajas: e.bajas,
    tiempoRespuestaMinutos: minutos(e.mediana),
    ventasConcretadas: ventasEnPeriodo?.total ?? 0,
    tasaConversion: tasa(e.leads_venta, e.leads),
  };
}

/** Embudo de los leads a los que se les envio algo en el periodo. */
export async function obtenerEmbudo(f: FiltrosReportes): Promise<EtapaEmbudo[]> {
  const [desde, hasta] = rangoFechas(f);

  const fila = await consultarUno<{
    enviados: number;
    leidos: number;
    respondieron: number;
    interesados: number;
    ventas: number;
  }>(
    `SELECT
       COUNT(DISTINCT l.id)::int AS enviados,
       COUNT(DISTINCT l.id) FILTER (WHERE pd.leido_en IS NOT NULL)::int AS leidos,
       COUNT(DISTINCT l.id) FILTER (WHERE pd.respondio_en IS NOT NULL)::int AS respondieron,
       COUNT(DISTINCT l.id) FILTER (WHERE l.etapa_pipeline IN ('interesado', 'venta_concretada'))::int AS interesados,
       COUNT(DISTINCT l.id) FILTER (WHERE l.etapa_pipeline = 'venta_concretada')::int AS ventas
     ${SQL_ENVIOS_FILTRADOS}`,
    [desde, hasta, f.rubro],
  );

  const total = fila?.enviados ?? 0;
  const pct = (valor: number) => (total > 0 ? Math.round((valor / total) * 100) : 0);

  return [
    { etapa: 'Contactados', valor: total, pct: 100 },
    { etapa: 'Leyeron', valor: fila?.leidos ?? 0, pct: pct(fila?.leidos ?? 0) },
    { etapa: 'Respondieron', valor: fila?.respondieron ?? 0, pct: pct(fila?.respondieron ?? 0) },
    { etapa: 'Interesados', valor: fila?.interesados ?? 0, pct: pct(fila?.interesados ?? 0) },
    { etapa: 'Venta concretada', valor: fila?.ventas ?? 0, pct: pct(fila?.ventas ?? 0) },
  ];
}

export async function obtenerPorRubro(f: FiltrosReportes): Promise<RubroResumen[]> {
  const [desde, hasta] = rangoFechas(f);
  const filas = await consultar<{ rubro: string; leads: number; ventas: number }>(
    `SELECT COALESCE(NULLIF(rubro, ''), 'Sin rubro') AS rubro,
       COUNT(*) AS leads,
       COUNT(*) FILTER (WHERE etapa_pipeline = 'venta_concretada') AS ventas
     FROM leads
     WHERE ($1::timestamptz IS NULL OR creado_en >= $1)
       AND ($2::timestamptz IS NULL OR creado_en <= $2)
       AND ($3::text IS NULL OR rubro = $3)
     GROUP BY 1
     ORDER BY leads DESC`,
    [desde, hasta, f.rubro],
  );
  return filas;
}

export async function obtenerResumenAutoResponder(f: FiltrosReportes): Promise<ResumenAutoResponder> {
  const [desde, hasta] = rangoFechas(f);

  const atendidas = await consultarUno<{ total: number }>(
    `SELECT COUNT(DISTINCT mc.conversacion_id) AS total
     FROM mensajes_conversacion mc
     JOIN conversaciones c ON c.id = mc.conversacion_id
     LEFT JOIN leads l ON l.id = c.lead_id
     WHERE mc.autor = 'bot'
       AND ($1::timestamptz IS NULL OR mc.creado_en >= $1)
       AND ($2::timestamptz IS NULL OR mc.creado_en <= $2)
       AND ($3::text IS NULL OR l.rubro = $3)`,
    [desde, hasta, f.rubro],
  );

  const escaladas = await consultarUno<{ total: number }>(
    `SELECT COUNT(*) AS total
     FROM conversaciones c
     LEFT JOIN leads l ON l.id = c.lead_id
     WHERE c.escalado_motivo IS NOT NULL
       AND ($1::timestamptz IS NULL OR c.actualizado_en >= $1)
       AND ($2::timestamptz IS NULL OR c.actualizado_en <= $2)
       AND ($3::text IS NULL OR l.rubro = $3)`,
    [desde, hasta, f.rubro],
  );

  const palabra = await consultarUno<{ palabra: string; veces: number }>(
    `SELECT escalado_palabra AS palabra, COUNT(*) AS veces
     FROM conversaciones
     WHERE escalado_palabra IS NOT NULL
     GROUP BY escalado_palabra
     ORDER BY veces DESC
     LIMIT 1`,
  );

  return {
    atendidasPorBot: atendidas?.total ?? 0,
    escaladasAAsesor: escaladas?.total ?? 0,
    palabraMasUsada: palabra ?? null,
  };
}

/** Todas las campanas que ya arrancaron (tambien en curso, pausadas o canceladas), no solo las completadas. */
export async function listarCampanas(f: FiltrosReportes): Promise<CampanaResumen[]> {
  const [desde, hasta] = rangoFechas(f);

  const filas = await consultar<{
    id: number;
    nombre: string;
    estado: string;
    finalizada_en: string | null;
    iniciada_en: string | null;
    enviados: number;
    entregados: number;
    leidos: number;
    respondieron: number;
    bajas: number;
    sin_whatsapp: number;
    fallidos: number;
    excluidos: number;
    mediana: number | null;
  }>(
    `SELECT p.id, p.nombre, p.estado, p.finalizada_en, p.iniciada_en,
       COUNT(pd.id) FILTER (WHERE pd.estado = 'enviado')::int AS enviados,
       COUNT(pd.id) FILTER (WHERE pd.entregado_en IS NOT NULL)::int AS entregados,
       COUNT(pd.id) FILTER (WHERE pd.leido_en IS NOT NULL)::int AS leidos,
       COUNT(pd.id) FILTER (WHERE pd.respondio_en IS NOT NULL)::int AS respondieron,
       COUNT(pd.id) FILTER (WHERE pd.estado = 'enviado' AND ${SQL_DIO_BAJA})::int AS bajas,
       COUNT(pd.id) FILTER (WHERE pd.estado = 'sin_whatsapp')::int AS sin_whatsapp,
       COUNT(pd.id) FILTER (WHERE pd.estado = 'fallido')::int AS fallidos,
       COUNT(pd.id) FILTER (WHERE pd.estado = 'excluido')::int AS excluidos,
       ${SQL_MEDIANA_RESPUESTA} AS mediana
     FROM publicaciones p
     JOIN publicacion_destinatarios pd ON pd.publicacion_id = p.id
     JOIN leads l ON l.id = pd.lead_id
     WHERE p.iniciada_en IS NOT NULL
       AND ($1::timestamptz IS NULL OR p.iniciada_en >= $1)
       AND ($2::timestamptz IS NULL OR p.iniciada_en <= $2)
       AND ($3::text IS NULL OR l.rubro = $3)
     GROUP BY p.id
     ORDER BY p.iniciada_en DESC`,
    [desde, hasta, f.rubro],
  );

  return filas.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    estado: fila.estado,
    fecha: fila.iniciada_en,
    enviados: fila.enviados,
    entregados: fila.entregados,
    leidos: fila.leidos,
    respondieron: fila.respondieron,
    bajas: fila.bajas,
    sinWhatsapp: fila.sin_whatsapp,
    fallidos: fila.fallidos,
    excluidos: fila.excluidos,
    tasaRespuesta: tasa(fila.respondieron, fila.enviados),
    tiempoRespuestaMinutos: minutos(fila.mediana),
    duracionMinutos:
      fila.iniciada_en && fila.finalizada_en
        ? Math.round((new Date(fila.finalizada_en).getTime() - new Date(fila.iniciada_en).getTime()) / 60000)
        : null,
  }));
}

type FilaDesglose = {
  clave: string;
  texto: string | null;
  enviados: number;
  leidos: number;
  respondieron: number;
  interesados: number;
  bajas: number;
};

function mapearDesglose(filas: FilaDesglose[]): DesgloseCampana[] {
  return filas.map((f) => ({ ...f, tasaRespuesta: tasa(f.respondieron, f.enviados) }));
}

// Interesado = la etapa actual del lead (la confirma el usuario, o es cliente).
const SQL_CONTEOS_DESGLOSE = `
  COUNT(*)::int AS enviados,
  COUNT(*) FILTER (WHERE pd.leido_en IS NOT NULL)::int AS leidos,
  COUNT(*) FILTER (WHERE pd.respondio_en IS NOT NULL)::int AS respondieron,
  COUNT(*) FILTER (WHERE l.etapa_pipeline IN ('interesado', 'venta_concretada'))::int AS interesados,
  COUNT(*) FILTER (WHERE ${SQL_DIO_BAJA})::int AS bajas`;

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Plantilla -> expresion que reconoce un mensaje ya enviado con ella: las
 * {variables} pueden ser cualquier texto y al final puede venir el link del
 * catalogo (se agrega con un salto de linea doble).
 */
function regexDePlantilla(plantilla: string): RegExp {
  const partes = plantilla.split(/\{[^{}]+\}/).map(escaparRegex);
  return new RegExp(`^${partes.join('[\\s\\S]*?')}(\\n\\n[\\s\\S]*)?$`);
}

/**
 * Envios hechos antes de que se registrara la variante (Fase 2): se deduce
 * comparando el texto enviado con cada plantilla. Si encaja con varias, gana
 * la de mas texto fijo (la mas especifica). Se guarda, asi solo pasa una vez.
 */
async function reconstruirVariantes(publicacionId: number): Promise<void> {
  const pendientes = await consultar<{ id: number; mensaje_enviado: string }>(
    `SELECT id, mensaje_enviado FROM publicacion_destinatarios
     WHERE publicacion_id = $1 AND estado = 'enviado' AND variante_indice IS NULL AND mensaje_enviado IS NOT NULL`,
    [publicacionId],
  );
  if (pendientes.length === 0) return;

  const pub = await consultarUno<{ variantes_mensaje: string[] }>(
    'SELECT variantes_mensaje FROM publicaciones WHERE id = $1',
    [publicacionId],
  );
  const plantillas = (pub?.variantes_mensaje ?? []).map((texto, indice) => ({
    indice,
    regex: regexDePlantilla(texto),
    fijo: texto.replace(/\{[^{}]+\}/g, '').length,
  }));

  for (const fila of pendientes) {
    const coincidencias = plantillas.filter((p) => p.regex.test(fila.mensaje_enviado));
    if (coincidencias.length === 0) continue;
    const mejor = coincidencias.reduce((a, b) => (b.fijo > a.fijo ? b : a));
    await consultarUno('UPDATE publicacion_destinatarios SET variante_indice = $2 WHERE id = $1', [fila.id, mejor.indice]);
  }
}

/**
 * Que variante del mensaje, que numero y que hora de envio consiguen mas
 * respuestas en una campana. La hora se agrupa en la zona del negocio.
 */
export async function obtenerDetalleCampana(publicacionId: number, zonaHoraria: string): Promise<DetalleCampana> {
  await reconstruirVariantes(publicacionId);

  const [porVariante, porNumero, porHora] = await Promise.all([
    consultar<FilaDesglose>(
      `SELECT CASE WHEN pd.variante_indice IS NULL THEN 'Sin identificar'
                   ELSE 'Variante ' || (pd.variante_indice + 1) END AS clave,
         p.variantes_mensaje[pd.variante_indice + 1] AS texto,
         ${SQL_CONTEOS_DESGLOSE}
       FROM publicacion_destinatarios pd
       JOIN publicaciones p ON p.id = pd.publicacion_id
       JOIN leads l ON l.id = pd.lead_id
       WHERE pd.publicacion_id = $1 AND pd.estado = 'enviado'
       GROUP BY pd.variante_indice, p.variantes_mensaje ORDER BY pd.variante_indice NULLS LAST`,
      [publicacionId],
    ),
    consultar<FilaDesglose>(
      `SELECT COALESCE(n.etiqueta, 'Número eliminado') AS clave, NULL AS texto, ${SQL_CONTEOS_DESGLOSE}
       FROM publicacion_destinatarios pd
       JOIN leads l ON l.id = pd.lead_id
       LEFT JOIN numeros_whatsapp n ON n.id = pd.numero_id
       WHERE pd.publicacion_id = $1 AND pd.estado = 'enviado'
       GROUP BY n.id, n.etiqueta ORDER BY enviados DESC`,
      [publicacionId],
    ),
    consultar<FilaDesglose>(
      `SELECT LPAD(EXTRACT(HOUR FROM pd.enviado_en AT TIME ZONE $2)::text, 2, '0') || ':00' AS clave,
         NULL AS texto, ${SQL_CONTEOS_DESGLOSE}
       FROM publicacion_destinatarios pd
       JOIN leads l ON l.id = pd.lead_id
       WHERE pd.publicacion_id = $1 AND pd.estado = 'enviado'
       GROUP BY 1 ORDER BY 1`,
      [publicacionId, zonaHoraria],
    ),
  ]);

  return {
    porVariante: mapearDesglose(porVariante),
    porNumero: mapearDesglose(porNumero),
    porHora: mapearDesglose(porHora),
  };
}

export async function obtenerLogCampana(publicacionId: number): Promise<FilaLogCampana[]> {
  const filas = await consultar<{
    empresa: string;
    telefono: string;
    estado: string;
    motivo_fallo: string | null;
    enviado_en: string | null;
    entregado_en: string | null;
    leido_en: string | null;
    respondio_en: string | null;
  }>(
    `SELECT l.empresa, l.telefono, pd.estado, pd.motivo_fallo, pd.enviado_en,
       pd.entregado_en, pd.leido_en, pd.respondio_en
     FROM publicacion_destinatarios pd
     JOIN leads l ON l.id = pd.lead_id
     WHERE pd.publicacion_id = $1
     ORDER BY pd.id ASC`,
    [publicacionId],
  );
  return filas.map((f) => ({
    empresa: f.empresa,
    telefono: f.telefono,
    estado: f.estado,
    motivoFallo: f.motivo_fallo,
    enviadoEn: f.enviado_en,
    entregadoEn: f.entregado_en,
    leidoEn: f.leido_en,
    respondioEn: f.respondio_en,
  }));
}

export type FilaExportarLeads = {
  empresa: string;
  telefono: string;
  rubro: string | null;
  etapaPipeline: string;
  creadoEn: string;
};

export async function exportarLeads(f: FiltrosReportes): Promise<FilaExportarLeads[]> {
  const [desde, hasta] = rangoFechas(f);
  const filas = await consultar<{
    empresa: string;
    telefono: string;
    rubro: string | null;
    etapa_pipeline: string;
    creado_en: string;
  }>(
    `SELECT empresa, telefono, rubro, etapa_pipeline, creado_en
     FROM leads
     WHERE ($1::timestamptz IS NULL OR creado_en >= $1)
       AND ($2::timestamptz IS NULL OR creado_en <= $2)
       AND ($3::text IS NULL OR rubro = $3)
     ORDER BY creado_en DESC`,
    [desde, hasta, f.rubro],
  );
  return filas.map((f2) => ({
    empresa: f2.empresa,
    telefono: f2.telefono,
    rubro: f2.rubro,
    etapaPipeline: f2.etapa_pipeline,
    creadoEn: f2.creado_en,
  }));
}
