import { consultar, consultarUno, insertarEnBloque, transaccion } from '../../db/pool.js';
import type {
  DatosLead,
  FilaInvalida,
  FilaValida,
  LeadExcluido,
  LeadGestion,
  ListaLeads,
  MotivoExclusion,
} from './tipos.js';

type FilaListaLeads = {
  id: number;
  nombre: string;
  nombre_archivo_original: string | null;
  total_filas: number;
  validas: number;
  invalidas: number;
  duplicadas: number;
  columnas_extra: string[];
  archivo_ruta: string | null;
  creado_en: string;
  actualizado_en: string;
};

function mapearLista(fila: FilaListaLeads): ListaLeads {
  return {
    id: fila.id,
    nombre: fila.nombre,
    nombreArchivoOriginal: fila.nombre_archivo_original,
    totalFilas: fila.total_filas,
    validas: fila.validas,
    invalidas: fila.invalidas,
    duplicadas: fila.duplicadas,
    columnasExtra: fila.columnas_extra,
    tieneArchivo: Boolean(fila.archivo_ruta),
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

/** Listas activas (las archivadas no se muestran ni se pueden elegir en campanas nuevas). */
export async function listar(): Promise<ListaLeads[]> {
  const filas = await consultar<FilaListaLeads>(
    'SELECT * FROM listas_leads WHERE archivada_en IS NULL ORDER BY creado_en DESC',
  );
  return filas.map(mapearLista);
}

export async function rutaArchivo(listaId: number): Promise<{ ruta: string; nombre: string } | null> {
  const fila = await consultarUno<{ archivo_ruta: string | null; nombre_archivo_original: string | null }>(
    'SELECT archivo_ruta, nombre_archivo_original FROM listas_leads WHERE id = $1',
    [listaId],
  );
  if (!fila?.archivo_ruta) return null;
  return { ruta: fila.archivo_ruta, nombre: fila.nombre_archivo_original ?? fila.archivo_ruta };
}

export async function rutasArchivoEnUso(): Promise<Set<string>> {
  const filas = await consultar<{ archivo_ruta: string }>(
    'SELECT archivo_ruta FROM listas_leads WHERE archivo_ruta IS NOT NULL',
  );
  return new Set(filas.map((f) => f.archivo_ruta));
}

// ==================== Gestion de leads de una lista ====================

type FilaLeadGestion = {
  id: number;
  telefono: string;
  empresa: string;
  rubro: string | null;
  datos_extra: Record<string, string>;
  etapa_pipeline: string;
  bloqueado: boolean;
  ultimo_envio_en: string | null;
  tiene_historial: boolean;
};

export async function listarLeadsDeLista(
  listaId: number,
  opciones: { buscar: string | null; pagina: number; tamano: number },
): Promise<{ total: number; leads: LeadGestion[] }> {
  const buscar = opciones.buscar ? `%${opciones.buscar}%` : null;
  const condicion = `l.lista_id = $1 AND ($2::text IS NULL OR l.empresa ILIKE $2 OR l.telefono LIKE $2 OR l.rubro ILIKE $2)`;

  const total = await consultarUno<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM leads l WHERE ${condicion}`,
    [listaId, buscar],
  );
  const filas = await consultar<FilaLeadGestion>(
    `SELECT l.id, l.telefono, l.empresa, l.rubro, l.datos_extra, l.etapa_pipeline,
       EXISTS (SELECT 1 FROM contactos_bloqueados b WHERE b.telefono = l.telefono) AS bloqueado,
       (SELECT MAX(pd.enviado_en) FROM publicacion_destinatarios pd WHERE pd.lead_id = l.id) AS ultimo_envio_en,
       EXISTS (SELECT 1 FROM publicacion_destinatarios pd WHERE pd.lead_id = l.id) AS tiene_historial
     FROM leads l WHERE ${condicion}
     ORDER BY l.id ASC
     LIMIT $3 OFFSET $4`,
    [listaId, buscar, opciones.tamano, (opciones.pagina - 1) * opciones.tamano],
  );

  return {
    total: total?.total ?? 0,
    leads: filas.map((f) => ({
      id: f.id,
      telefono: f.telefono,
      empresa: f.empresa,
      rubro: f.rubro,
      datosExtra: f.datos_extra,
      etapaPipeline: f.etapa_pipeline,
      bloqueado: f.bloqueado,
      ultimoEnvioEn: f.ultimo_envio_en,
      tieneHistorial: f.tiene_historial,
    })),
  };
}

async function telefonoRepetidoEnLista(listaId: number, telefono: string, excluirLeadId: number | null): Promise<boolean> {
  return Boolean(
    await consultarUno('SELECT 1 FROM leads WHERE lista_id = $1 AND telefono = $2 AND id <> COALESCE($3, 0)', [
      listaId,
      telefono,
      excluirLeadId,
    ]),
  );
}

/** Alta manual de un lead (telefono ya normalizado). null si el telefono ya esta en la lista. */
export async function agregarLead(listaId: number, datos: DatosLead): Promise<number | null> {
  if (await telefonoRepetidoEnLista(listaId, datos.telefono, null)) return null;
  return transaccion(async (cliente) => {
    const { rows } = await cliente.query<{ id: number }>(
      `INSERT INTO leads (lista_id, telefono, empresa, rubro) VALUES ($1, $2, $3, $4) RETURNING id`,
      [listaId, datos.telefono, datos.empresa, datos.rubro],
    );
    await cliente.query('UPDATE listas_leads SET validas = validas + 1, total_filas = total_filas + 1 WHERE id = $1', [
      listaId,
    ]);
    return rows[0]!.id;
  });
}

/** Edita un lead. false si el telefono nuevo ya lo tiene otro lead de la misma lista. */
export async function actualizarLead(leadId: number, listaId: number, datos: DatosLead): Promise<boolean> {
  if (await telefonoRepetidoEnLista(listaId, datos.telefono, leadId)) return false;
  await consultarUno('UPDATE leads SET telefono = $2, empresa = $3, rubro = $4 WHERE id = $1', [
    leadId,
    datos.telefono,
    datos.empresa,
    datos.rubro,
  ]);
  return true;
}

export async function obtenerListaDeLead(leadId: number): Promise<{ listaId: number; tieneHistorial: boolean } | null> {
  const fila = await consultarUno<{ lista_id: number; tiene_historial: boolean }>(
    `SELECT l.lista_id, EXISTS (SELECT 1 FROM publicacion_destinatarios pd WHERE pd.lead_id = l.id) AS tiene_historial
     FROM leads l WHERE l.id = $1`,
    [leadId],
  );
  return fila ? { listaId: fila.lista_id, tieneHistorial: fila.tiene_historial } : null;
}

/** Solo leads sin historial de campanas (borrar uno con envios borraria sus metricas en cascada). */
export async function eliminarLead(leadId: number, listaId: number): Promise<void> {
  await transaccion(async (cliente) => {
    await cliente.query('DELETE FROM leads WHERE id = $1', [leadId]);
    await cliente.query(
      'UPDATE listas_leads SET validas = GREATEST(validas - 1, 0), total_filas = GREATEST(total_filas - 1, 0) WHERE id = $1',
      [listaId],
    );
  });
}

/** Estados de las campanas que usaron esta lista (para decidir borrar, archivar o impedir). */
export async function estadosCampanasDeLista(listaId: number): Promise<string[]> {
  const filas = await consultar<{ estado: string }>('SELECT estado FROM publicaciones WHERE lista_id = $1', [listaId]);
  return filas.map((f) => f.estado);
}

export async function borrarLista(listaId: number): Promise<void> {
  await consultarUno('DELETE FROM listas_leads WHERE id = $1', [listaId]);
}

export async function archivarLista(listaId: number): Promise<void> {
  await consultarUno('UPDATE listas_leads SET archivada_en = now() WHERE id = $1', [listaId]);
}

export async function guardarArchivo(listaId: number, archivoRuta: string): Promise<void> {
  await consultarUno('UPDATE listas_leads SET archivo_ruta = $2 WHERE id = $1', [listaId, archivoRuta]);
}

export async function obtener(id: number): Promise<ListaLeads | null> {
  const fila = await consultarUno<FilaListaLeads>('SELECT * FROM listas_leads WHERE id = $1', [id]);
  return fila ? mapearLista(fila) : null;
}

type FilaLeadExcluido = {
  id: number;
  fila_numero: number;
  motivo: MotivoExclusion;
  dato_referencia: string | null;
};

/** IDs de todos los leads de una lista, en orden estable (para repartir entre numeros). */
export async function listarIdsPorLista(listaId: number): Promise<number[]> {
  const filas = await consultar<{ id: number }>('SELECT id FROM leads WHERE lista_id = $1 ORDER BY id ASC', [
    listaId,
  ]);
  return filas.map((f) => f.id);
}

export type LeadResumen = {
  id: number;
  telefono: string;
  empresa: string;
  rubro: string | null;
  datosExtra: Record<string, string>;
};

type FilaLead = {
  id: number;
  telefono: string;
  empresa: string;
  rubro: string | null;
  datos_extra: Record<string, string>;
};

/** Leads completos de una lista (para armar publicaciones: dry-run, envio de prueba, destinatarios). */
export async function listarPorLista(listaId: number): Promise<LeadResumen[]> {
  const filas = await consultar<FilaLead>(
    'SELECT id, telefono, empresa, rubro, datos_extra FROM leads WHERE lista_id = $1 ORDER BY id ASC',
    [listaId],
  );
  return filas.map((f) => ({
    id: f.id,
    telefono: f.telefono,
    empresa: f.empresa,
    rubro: f.rubro,
    datosExtra: f.datos_extra,
  }));
}

/**
 * Etapa automatica del mini-CRM (seccion 3.9): al enviarle una campana, un
 * lead nuevo pasa a "contactado". Solo avanza desde 'nuevo' — si ya esta
 * mas adelante en el pipeline (por una campana anterior), no lo retrocede.
 */
export async function marcarContactado(leadId: number): Promise<void> {
  await consultarUno(
    `UPDATE leads SET etapa_pipeline = 'contactado' WHERE id = $1 AND etapa_pipeline = 'nuevo'`,
    [leadId],
  );
}

/** Automatico en cuanto llega su primera respuesta (seccion 3.9). */
export async function marcarRespondio(leadId: number): Promise<void> {
  await consultarUno(
    `UPDATE leads SET etapa_pipeline = 'respondio' WHERE id = $1 AND etapa_pipeline IN ('nuevo', 'contactado')`,
    [leadId],
  );
}

/** Automatico si hay varios intercambios de mensajes con ese lead (seccion 3.9). */
export async function marcarEnConversacion(leadId: number): Promise<void> {
  await consultarUno(
    `UPDATE leads SET etapa_pipeline = 'en_conversacion'
     WHERE id = $1 AND etapa_pipeline IN ('nuevo', 'contactado', 'respondio')`,
    [leadId],
  );
}

/** Pidio no recibir mas mensajes: deja de ser un prospecto (salvo que ya sea cliente o este cerrado). */
export async function marcarPidioBaja(leadId: number): Promise<void> {
  await consultarUno(
    `UPDATE leads SET etapa_pipeline = 'no_interesado'
     WHERE id = $1 AND etapa_pipeline NOT IN ('venta_concretada', 'descartado')`,
    [leadId],
  );
}

export type EtapaManual = 'interesado' | 'no_interesado' | 'duda_precio' | 'venta_concretada' | 'descartado';

/**
 * Cambios de etapa que solo pasan por decision del usuario (seccion 3.9):
 * confirmar o corregir una sugerencia de la IA, o marcar venta concretada /
 * descartado. Nunca se llama desde un flujo automatico del sistema.
 */
export async function actualizarEtapaManual(leadId: number, etapa: EtapaManual): Promise<void> {
  await consultarUno(
    `UPDATE leads
     SET etapa_pipeline = $2,
         venta_concretada_en = CASE WHEN $2 = 'venta_concretada' THEN now() ELSE venta_concretada_en END
     WHERE id = $1`,
    [leadId, etapa],
  );
}

export async function actualizarNotas(leadId: number, notas: string): Promise<void> {
  await consultarUno('UPDATE leads SET notas = $2 WHERE id = $1', [leadId, notas]);
}

export type LeadDetalle = LeadResumen & {
  etapaPipeline: string;
  notas: string | null;
  creadoEn: string;
};

type FilaLeadDetalle = FilaLead & { etapa_pipeline: string; notas: string | null; creado_en: string };

function mapearDetalle(fila: FilaLeadDetalle): LeadDetalle {
  return {
    id: fila.id,
    telefono: fila.telefono,
    empresa: fila.empresa,
    rubro: fila.rubro,
    datosExtra: fila.datos_extra,
    etapaPipeline: fila.etapa_pipeline,
    notas: fila.notas,
    creadoEn: fila.creado_en,
  };
}

// Incluye etapa_pipeline: services/conversaciones/mensajeEntrante.ts la usa
// para no sugerir clasificacion de IA en leads ya cerrados (venta_concretada/descartado).
const SELECT_LEAD_DETALLE = 'SELECT id, telefono, empresa, rubro, datos_extra, etapa_pipeline, notas, creado_en FROM leads';

/** El lead más reciente con ese telefono (puede repetirse entre listas distintas). */
export async function buscarPorTelefono(telefono: string): Promise<LeadDetalle | null> {
  const fila = await consultarUno<FilaLeadDetalle>(
    `${SELECT_LEAD_DETALLE} WHERE telefono = $1 ORDER BY id DESC LIMIT 1`,
    [telefono],
  );
  return fila ? mapearDetalle(fila) : null;
}

export async function obtenerDetalle(leadId: number): Promise<LeadDetalle | null> {
  const fila = await consultarUno<FilaLeadDetalle>(`${SELECT_LEAD_DETALLE} WHERE id = $1`, [leadId]);
  return fila ? mapearDetalle(fila) : null;
}

export async function obtenerExcluidos(listaId: number): Promise<LeadExcluido[]> {
  const filas = await consultar<FilaLeadExcluido>(
    'SELECT * FROM leads_excluidos WHERE lista_id = $1 ORDER BY fila_numero ASC',
    [listaId],
  );
  return filas.map((f) => ({
    id: f.id,
    filaNumero: f.fila_numero,
    motivo: f.motivo,
    datoReferencia: f.dato_referencia,
  }));
}

type DatosCreacionLista = {
  nombre: string;
  nombreArchivoOriginal: string;
  columnasExtra: string[];
  filasValidas: FilaValida[];
  filasInvalidas: FilaInvalida[];
};

export async function crear(datos: DatosCreacionLista): Promise<ListaLeads> {
  const { nombre, nombreArchivoOriginal, columnasExtra, filasValidas, filasInvalidas } = datos;
  const duplicadas = filasInvalidas.filter((f) => f.motivo === 'duplicado').length;
  const totalFilas = filasValidas.length + filasInvalidas.length;

  return transaccion(async (cliente) => {
    const { rows } = await cliente.query<FilaListaLeads>(
      `INSERT INTO listas_leads
         (nombre, nombre_archivo_original, total_filas, validas, invalidas, duplicadas, columnas_extra)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [nombre, nombreArchivoOriginal, totalFilas, filasValidas.length, filasInvalidas.length, duplicadas, columnasExtra],
    );
    const lista = rows[0]!;

    // Postgres tiene un limite de ~65535 parametros por consulta; en lotes
    // de a 500 filas (x6 columnas) nunca nos acercamos, pero se deja la
    // insercion en un solo bloque por simplicidad al volumen esperado (3.2: 50-200).
    await insertarEnBloque(
      cliente,
      'leads',
      ['lista_id', 'telefono', 'empresa', 'rubro', 'datos_extra'],
      filasValidas.map((f) => [lista.id, f.telefono, f.empresa, f.rubro, JSON.stringify(f.datosExtra)]),
    );

    await insertarEnBloque(
      cliente,
      'leads_excluidos',
      ['lista_id', 'fila_numero', 'motivo', 'dato_referencia'],
      filasInvalidas.map((f) => [lista.id, f.filaNumero, f.motivo, f.datoReferencia]),
    );

    return mapearLista(lista);
  });
}
