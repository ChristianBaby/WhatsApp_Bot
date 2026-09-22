import { consultar, consultarUno } from '../../db/pool.js';
import type {
  CampanaResumen,
  EtapaEmbudo,
  FiltrosReportes,
  FilaLogCampana,
  KpisGenerales,
  ResumenAutoResponder,
  RubroResumen,
} from './tipos.js';

/**
 * Todas las agregaciones de la pantalla de Reportes (seccion 3.7). Cada
 * funcion arma su propio WHERE porque cada una filtra una columna de
 * fecha distinta (leads.creado_en, publicacion_destinatarios.enviado_en,
 * leads.venta_concretada_en...) — un helper generico de filtros terminaria
 * siendo menos claro que escribirlo directo en cada consulta.
 */

// Cualquier etapa que solo se alcanza despues de que el lead escribio de
// vuelta al menos una vez (seccion 3.9).
const ETAPAS_RESPONDIO_O_MAS = [
  'respondio',
  'en_conversacion',
  'interesado',
  'no_interesado',
  'duda_precio',
  'venta_concretada',
  'descartado',
];

function rangoFechas(f: FiltrosReportes): [string | null, string | null] {
  return [f.desde, f.hasta];
}

export async function obtenerKpis(f: FiltrosReportes): Promise<KpisGenerales> {
  const [desde, hasta] = rangoFechas(f);

  const enviados = await consultarUno<{ total: number }>(
    `SELECT COUNT(*) AS total
     FROM publicacion_destinatarios pd
     JOIN leads l ON l.id = pd.lead_id
     WHERE pd.estado = 'enviado'
       AND ($1::timestamptz IS NULL OR pd.enviado_en >= $1)
       AND ($2::timestamptz IS NULL OR pd.enviado_en <= $2)
       AND ($3::text IS NULL OR l.rubro = $3)`,
    [desde, hasta, f.rubro],
  );

  const pipeline = await consultarUno<{ contactados: number; respondieron: number; total: number; ventas: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE etapa_pipeline != 'nuevo') AS contactados,
       COUNT(*) FILTER (WHERE etapa_pipeline = ANY($3::text[])) AS respondieron,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE etapa_pipeline = 'venta_concretada') AS ventas
     FROM leads
     WHERE ($1::timestamptz IS NULL OR creado_en >= $1)
       AND ($2::timestamptz IS NULL OR creado_en <= $2)
       AND ($4::text IS NULL OR rubro = $4)`,
    [desde, hasta, ETAPAS_RESPONDIO_O_MAS, f.rubro],
  );

  const ventasEnPeriodo = await consultarUno<{ total: number }>(
    `SELECT COUNT(*) AS total FROM leads
     WHERE etapa_pipeline = 'venta_concretada'
       AND ($1::timestamptz IS NULL OR venta_concretada_en >= $1)
       AND ($2::timestamptz IS NULL OR venta_concretada_en <= $2)
       AND ($3::text IS NULL OR rubro = $3)`,
    [desde, hasta, f.rubro],
  );

  const contactados = pipeline?.contactados ?? 0;
  const total = pipeline?.total ?? 0;

  return {
    mensajesEnviados: enviados?.total ?? 0,
    tasaRespuesta: contactados > 0 ? Math.round(((pipeline!.respondieron / contactados) * 1000)) / 10 : 0,
    ventasConcretadas: ventasEnPeriodo?.total ?? 0,
    tasaConversion: total > 0 ? Math.round(((pipeline!.ventas / total) * 1000)) / 10 : 0,
  };
}

export async function obtenerEmbudo(f: FiltrosReportes): Promise<EtapaEmbudo[]> {
  const [desde, hasta] = rangoFechas(f);

  const fila = await consultarUno<{
    nuevo: number;
    contactado: number;
    respondio: number;
    interesado: number;
    venta_concretada: number;
  }>(
    `SELECT
       COUNT(*) AS nuevo,
       COUNT(*) FILTER (WHERE etapa_pipeline != 'nuevo') AS contactado,
       COUNT(*) FILTER (WHERE etapa_pipeline = ANY($3::text[])) AS respondio,
       COUNT(*) FILTER (WHERE etapa_pipeline IN ('interesado', 'venta_concretada')) AS interesado,
       COUNT(*) FILTER (WHERE etapa_pipeline = 'venta_concretada') AS venta_concretada
     FROM leads
     WHERE ($1::timestamptz IS NULL OR creado_en >= $1)
       AND ($2::timestamptz IS NULL OR creado_en <= $2)
       AND ($4::text IS NULL OR rubro = $4)`,
    [desde, hasta, ETAPAS_RESPONDIO_O_MAS, f.rubro],
  );

  const total = fila?.nuevo ?? 0;
  const pct = (valor: number) => (total > 0 ? Math.round((valor / total) * 100) : 0);

  return [
    { etapa: 'Nuevo', valor: fila?.nuevo ?? 0, pct: 100 },
    { etapa: 'Contactado', valor: fila?.contactado ?? 0, pct: pct(fila?.contactado ?? 0) },
    { etapa: 'Respondió', valor: fila?.respondio ?? 0, pct: pct(fila?.respondio ?? 0) },
    { etapa: 'Interesado', valor: fila?.interesado ?? 0, pct: pct(fila?.interesado ?? 0) },
    { etapa: 'Venta concretada', valor: fila?.venta_concretada ?? 0, pct: pct(fila?.venta_concretada ?? 0) },
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

export async function listarCampanas(f: FiltrosReportes): Promise<CampanaResumen[]> {
  const [desde, hasta] = rangoFechas(f);

  const filas = await consultar<{
    id: number;
    nombre: string;
    finalizada_en: string | null;
    iniciada_en: string | null;
    enviados: number;
    sin_whatsapp: number;
    fallidos: number;
    respondieron: number;
  }>(
    `SELECT p.id, p.nombre, p.finalizada_en, p.iniciada_en,
       COUNT(pd.id) FILTER (WHERE pd.estado = 'enviado')      AS enviados,
       COUNT(pd.id) FILTER (WHERE pd.estado = 'sin_whatsapp')  AS sin_whatsapp,
       COUNT(pd.id) FILTER (WHERE pd.estado = 'fallido')       AS fallidos,
       COUNT(pd.id) FILTER (
         WHERE pd.estado = 'enviado' AND l.etapa_pipeline = ANY($3::text[])
       ) AS respondieron
     FROM publicaciones p
     JOIN publicacion_destinatarios pd ON pd.publicacion_id = p.id
     JOIN leads l ON l.id = pd.lead_id
     WHERE p.estado = 'completada'
       AND ($1::timestamptz IS NULL OR p.finalizada_en >= $1)
       AND ($2::timestamptz IS NULL OR p.finalizada_en <= $2)
       AND ($4::text IS NULL OR l.rubro = $4)
     GROUP BY p.id
     ORDER BY p.finalizada_en DESC`,
    [desde, hasta, ['respondio', 'en_conversacion', 'interesado', 'no_interesado', 'duda_precio', 'venta_concretada', 'descartado'], f.rubro],
  );

  return filas.map((fila) => {
    const duracionMinutos =
      fila.iniciada_en && fila.finalizada_en
        ? Math.round((new Date(fila.finalizada_en).getTime() - new Date(fila.iniciada_en).getTime()) / 60000)
        : null;
    return {
      id: fila.id,
      nombre: fila.nombre,
      fecha: fila.finalizada_en,
      enviados: fila.enviados,
      sinWhatsapp: fila.sin_whatsapp,
      fallidos: fila.fallidos,
      tasaRespuesta: fila.enviados > 0 ? Math.round((fila.respondieron / fila.enviados) * 1000) / 10 : 0,
      duracionMinutos,
    };
  });
}

export async function obtenerLogCampana(publicacionId: number): Promise<FilaLogCampana[]> {
  const filas = await consultar<{
    empresa: string;
    telefono: string;
    estado: string;
    motivo_fallo: string | null;
    enviado_en: string | null;
  }>(
    `SELECT l.empresa, l.telefono, pd.estado, pd.motivo_fallo, pd.enviado_en
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
