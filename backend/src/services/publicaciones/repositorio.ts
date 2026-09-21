import { consultar, consultarUno, insertarEnBloque, transaccion } from '../../db/pool.js';
import { noEncontrado } from '../../lib/errors.js';
import * as leadsRepo from '../leads/repositorio.js';
import type {
  DatosCreacionPublicacion,
  EstadoDestinatario,
  EstadoPublicacion,
  Publicacion,
  PublicacionConProgreso,
  TipoAdjunto,
} from './tipos.js';

type FilaPublicacion = {
  id: number;
  nombre: string;
  lista_id: number;
  variantes_mensaje: string[];
  adjunto_ruta: string | null;
  adjunto_tipo: TipoAdjunto | null;
  adjunto_nombre_original: string | null;
  catalogo_url: string | null;
  numero_ids: number[];
  programada_para: string;
  pausa_min_segundos: number | null;
  pausa_max_segundos: number | null;
  tamano_lote: number | null;
  pausa_entre_lotes_minutos: number | null;
  horario_inicio: string | null;
  horario_fin: string | null;
  max_mensajes: number | null;
  estado: EstadoPublicacion;
  motivo_pausa: string | null;
  enviados_lote_actual: number;
  iniciada_en: string | null;
  finalizada_en: string | null;
  creado_en: string;
  actualizado_en: string;
};

function mapear(fila: FilaPublicacion): Publicacion {
  return {
    id: fila.id,
    nombre: fila.nombre,
    listaId: fila.lista_id,
    variantesMensaje: fila.variantes_mensaje,
    adjuntoRuta: fila.adjunto_ruta,
    adjuntoTipo: fila.adjunto_tipo,
    adjuntoNombreOriginal: fila.adjunto_nombre_original,
    catalogoUrl: fila.catalogo_url,
    numeroIds: fila.numero_ids,
    programadaPara: fila.programada_para,
    pausaMinSegundos: fila.pausa_min_segundos,
    pausaMaxSegundos: fila.pausa_max_segundos,
    tamanoLote: fila.tamano_lote,
    pausaEntreLotesMinutos: fila.pausa_entre_lotes_minutos,
    horarioInicio: fila.horario_inicio,
    horarioFin: fila.horario_fin,
    maxMensajes: fila.max_mensajes,
    estado: fila.estado,
    motivoPausa: fila.motivo_pausa,
    enviadosLoteActual: fila.enviados_lote_actual,
    iniciadaEn: fila.iniciada_en,
    finalizadaEn: fila.finalizada_en,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export async function obtener(id: number): Promise<Publicacion | null> {
  const fila = await consultarUno<FilaPublicacion>('SELECT * FROM publicaciones WHERE id = $1', [id]);
  return fila ? mapear(fila) : null;
}

const SELECT_CON_PROGRESO = `
  SELECT
    p.*,
    ll.nombre AS nombre_lista,
    COUNT(pd.id) AS total_destinatarios,
    COUNT(pd.id) FILTER (WHERE pd.estado = 'enviado')      AS enviados,
    COUNT(pd.id) FILTER (WHERE pd.estado = 'sin_whatsapp')  AS sin_whatsapp,
    COUNT(pd.id) FILTER (WHERE pd.estado = 'fallido')       AS fallidos,
    COUNT(pd.id) FILTER (WHERE pd.estado = 'pendiente')     AS pendientes
  FROM publicaciones p
  JOIN listas_leads ll ON ll.id = p.lista_id
  LEFT JOIN publicacion_destinatarios pd ON pd.publicacion_id = p.id
`;

type FilaConProgreso = FilaPublicacion & {
  nombre_lista: string;
  total_destinatarios: number;
  enviados: number;
  sin_whatsapp: number;
  fallidos: number;
  pendientes: number;
};

function mapearConProgreso(fila: FilaConProgreso): PublicacionConProgreso {
  return {
    ...mapear(fila),
    nombreLista: fila.nombre_lista,
    progreso: {
      totalDestinatarios: fila.total_destinatarios,
      enviados: fila.enviados,
      sinWhatsapp: fila.sin_whatsapp,
      fallidos: fila.fallidos,
      pendientes: fila.pendientes,
    },
  };
}

export async function listarConProgreso(): Promise<PublicacionConProgreso[]> {
  const filas = await consultar<FilaConProgreso>(`
    ${SELECT_CON_PROGRESO}
    GROUP BY p.id, ll.nombre
    ORDER BY
      CASE p.estado
        WHEN 'en_curso'    THEN 0
        WHEN 'pausada'     THEN 1
        WHEN 'programada'  THEN 2
        WHEN 'borrador'    THEN 3
        ELSE 4
      END,
      p.programada_para ASC
  `);
  return filas.map(mapearConProgreso);
}

export async function obtenerConProgreso(id: number): Promise<PublicacionConProgreso | null> {
  const fila = await consultarUno<FilaConProgreso>(`${SELECT_CON_PROGRESO} WHERE p.id = $1 GROUP BY p.id, ll.nombre`, [
    id,
  ]);
  return fila ? mapearConProgreso(fila) : null;
}

export async function crear(datos: DatosCreacionPublicacion): Promise<Publicacion> {
  const fila = await consultarUno<FilaPublicacion>(
    `INSERT INTO publicaciones
       (nombre, lista_id, variantes_mensaje, adjunto_ruta, adjunto_tipo, adjunto_nombre_original,
        catalogo_url, numero_ids, programada_para, pausa_min_segundos, pausa_max_segundos,
        tamano_lote, pausa_entre_lotes_minutos, horario_inicio, horario_fin, max_mensajes, estado)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      datos.nombre,
      datos.listaId,
      datos.variantesMensaje,
      datos.adjuntoRuta,
      datos.adjuntoTipo,
      datos.adjuntoNombreOriginal,
      datos.catalogoUrl,
      datos.numeroIds,
      datos.programadaPara,
      datos.pausaMinSegundos,
      datos.pausaMaxSegundos,
      datos.tamanoLote,
      datos.pausaEntreLotesMinutos,
      datos.horarioInicio,
      datos.horarioFin,
      datos.maxMensajes,
      datos.estado,
    ],
  );
  return mapear(fila!);
}

type CambiosEditables = Partial<Omit<DatosCreacionPublicacion, 'estado'>>;

const COLUMNAS_EDITABLES: Record<keyof CambiosEditables, string> = {
  nombre: 'nombre',
  listaId: 'lista_id',
  variantesMensaje: 'variantes_mensaje',
  adjuntoRuta: 'adjunto_ruta',
  adjuntoTipo: 'adjunto_tipo',
  adjuntoNombreOriginal: 'adjunto_nombre_original',
  catalogoUrl: 'catalogo_url',
  numeroIds: 'numero_ids',
  programadaPara: 'programada_para',
  pausaMinSegundos: 'pausa_min_segundos',
  pausaMaxSegundos: 'pausa_max_segundos',
  tamanoLote: 'tamano_lote',
  pausaEntreLotesMinutos: 'pausa_entre_lotes_minutos',
  horarioInicio: 'horario_inicio',
  horarioFin: 'horario_fin',
  maxMensajes: 'max_mensajes',
};

export async function actualizar(id: number, cambios: CambiosEditables): Promise<Publicacion> {
  const claves = Object.keys(cambios) as (keyof CambiosEditables)[];
  if (claves.length === 0) {
    const actual = await obtener(id);
    if (!actual) throw noEncontrado('Publicacion no encontrada');
    return actual;
  }

  const asignaciones = claves.map((clave, i) => `${COLUMNAS_EDITABLES[clave]} = $${i + 2}`);
  const valores = claves.map((clave) => cambios[clave]);

  const fila = await consultarUno<FilaPublicacion>(
    `UPDATE publicaciones SET ${asignaciones.join(', ')} WHERE id = $1 RETURNING *`,
    [id, ...valores],
  );
  if (!fila) throw noEncontrado('Publicacion no encontrada');
  return mapear(fila);
}

type CambioEstado = {
  estado: EstadoPublicacion;
  motivoPausa?: string | null;
  iniciadaEn?: string | null;
  finalizadaEn?: string | null;
};

export async function cambiarEstado(id: number, cambio: CambioEstado): Promise<Publicacion> {
  const fila = await consultarUno<FilaPublicacion>(
    `UPDATE publicaciones
     SET estado = $2,
         motivo_pausa = COALESCE($3, motivo_pausa),
         iniciada_en = COALESCE($4, iniciada_en),
         finalizada_en = COALESCE($5, finalizada_en)
     WHERE id = $1
     RETURNING *`,
    [id, cambio.estado, cambio.motivoPausa ?? null, cambio.iniciadaEn ?? null, cambio.finalizadaEn ?? null],
  );
  if (!fila) throw noEncontrado('Publicacion no encontrada');
  return mapear(fila);
}

/** Limpia el motivo de pausa al reanudar (COALESCE no sirve para "borrar a null" a proposito). */
export async function limpiarMotivoPausa(id: number): Promise<void> {
  await consultarUno('UPDATE publicaciones SET motivo_pausa = NULL WHERE id = $1', [id]);
}

export async function contarDestinatarios(publicacionId: number): Promise<number> {
  const fila = await consultarUno<{ total: number }>(
    'SELECT COUNT(*) AS total FROM publicacion_destinatarios WHERE publicacion_id = $1',
    [publicacionId],
  );
  return fila?.total ?? 0;
}

/**
 * Crea un destinatario por cada lead de la lista, repartiendo numero_id en
 * round-robin entre los numeros elegidos (seccion 3.3: repartir la lista
 * entre varios numeros). Se llama una sola vez, al arrancar la publicacion
 * por primera vez — reanudar una pausada NUNCA vuelve a llamar esto.
 */
export async function generarDestinatarios(publicacionId: number, listaId: number, numeroIds: number[]): Promise<number> {
  const leadIds = await leadsRepo.listarIdsPorLista(listaId);
  if (leadIds.length === 0) return 0;

  return transaccion(async (cliente) => {
    await insertarEnBloque(
      cliente,
      'publicacion_destinatarios',
      ['publicacion_id', 'lead_id', 'numero_id'],
      leadIds.map((leadId, i) => [publicacionId, leadId, numeroIds[i % numeroIds.length]]),
    );
    return leadIds.length;
  });
}

export type DestinatarioPendiente = {
  destinatarioId: number;
  leadId: number;
  numeroId: number;
  telefono: string;
  empresa: string;
  rubro: string | null;
  datosExtra: Record<string, string>;
};

type FilaPendiente = {
  id: number;
  lead_id: number;
  numero_id: number;
  telefono: string;
  empresa: string;
  rubro: string | null;
  datos_extra: Record<string, string>;
};

/**
 * El siguiente pendiente, pero solo entre los que su numero asignado esta
 * conectado ahora mismo. Asi, si un numero se cae, sus destinatarios
 * simplemente esperan (quedan pendientes) mientras el resto de la campana
 * sigue avanzando con normalidad (seccion 3.1).
 */
export async function siguientePendiente(
  publicacionId: number,
  numerosConectados: number[],
): Promise<DestinatarioPendiente | null> {
  if (numerosConectados.length === 0) return null;

  const fila = await consultarUno<FilaPendiente>(
    `SELECT pd.id, pd.lead_id, pd.numero_id, l.telefono, l.empresa, l.rubro, l.datos_extra
     FROM publicacion_destinatarios pd
     JOIN leads l ON l.id = pd.lead_id
     WHERE pd.publicacion_id = $1 AND pd.estado = 'pendiente' AND pd.numero_id = ANY($2::int[])
     ORDER BY pd.id ASC
     LIMIT 1`,
    [publicacionId, numerosConectados],
  );
  if (!fila) return null;
  return {
    destinatarioId: fila.id,
    leadId: fila.lead_id,
    numeroId: fila.numero_id,
    telefono: fila.telefono,
    empresa: fila.empresa,
    rubro: fila.rubro,
    datosExtra: fila.datos_extra,
  };
}

export async function marcarResultadoDestinatario(
  destinatarioId: number,
  estado: EstadoDestinatario,
  detalle: { motivoFallo?: string | null; mensajeEnviado?: string | null; numeroId?: number } = {},
): Promise<void> {
  await consultarUno(
    `UPDATE publicacion_destinatarios
     SET estado = $2, motivo_fallo = $3, mensaje_enviado = $4,
         numero_id = COALESCE($5, numero_id),
         enviado_en = CASE WHEN $2 = 'enviado' THEN now() ELSE enviado_en END
     WHERE id = $1`,
    [destinatarioId, estado, detalle.motivoFallo ?? null, detalle.mensajeEnviado ?? null, detalle.numeroId ?? null],
  );
}

/** Devuelve el nuevo contador (persistido, para sobrevivir un reinicio del proceso). */
export async function incrementarLoteActual(publicacionId: number): Promise<number> {
  const fila = await consultarUno<{ enviados_lote_actual: number }>(
    'UPDATE publicaciones SET enviados_lote_actual = enviados_lote_actual + 1 WHERE id = $1 RETURNING enviados_lote_actual',
    [publicacionId],
  );
  return fila?.enviados_lote_actual ?? 0;
}

export async function reiniciarLoteActual(publicacionId: number): Promise<void> {
  await consultarUno('UPDATE publicaciones SET enviados_lote_actual = 0 WHERE id = $1', [publicacionId]);
}

/** Publicaciones programadas cuya hora ya llego (para que el worker las arranque). */
export async function publicacionesListasParaIniciar(): Promise<Publicacion[]> {
  const filas = await consultar<FilaPublicacion>(
    `SELECT * FROM publicaciones WHERE estado = 'programada' AND programada_para <= now() ORDER BY programada_para ASC`,
  );
  return filas.map(mapear);
}

export async function publicacionEnCurso(): Promise<Publicacion | null> {
  const fila = await consultarUno<FilaPublicacion>(`SELECT * FROM publicaciones WHERE estado = 'en_curso' LIMIT 1`);
  return fila ? mapear(fila) : null;
}
