import { consultar, consultarUno, insertarEnBloque, transaccion } from '../../db/pool.js';
import { noEncontrado } from '../../lib/errors.js';
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
    COUNT(pd.id) FILTER (WHERE pd.estado = 'excluido')      AS excluidos,
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
  excluidos: number;
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
      excluidos: fila.excluidos,
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

type FilaCandidato = {
  lead_id: number;
  telefono: string;
  etapa_pipeline: string;
  bloqueado: boolean;
  con_asesor: boolean;
  contactado_reciente: boolean;
};

/**
 * Por que NO hay que escribirle a este contacto en esta campana, o null si
 * se le puede escribir. Es la unica fuente de estas reglas (al generar los
 * destinatarios y al reconfirmar justo antes de cada envio).
 */
function motivoExclusion(c: Omit<FilaCandidato, 'lead_id' | 'telefono'>, diasSinRecontactar: number): string | null {
  if (c.bloqueado) return 'Pidió no recibir mensajes';
  if (c.etapa_pipeline === 'venta_concretada') return 'Ya es cliente';
  if (c.etapa_pipeline === 'descartado') return 'Descartado';
  if (c.con_asesor) return 'En conversación con un asesor';
  if (c.contactado_reciente) return `Recibió una campaña en los últimos ${diasSinRecontactar} días`;
  return null;
}

// Mismas condiciones para una lista entera o para un solo telefono.
const CONDICIONES_CANDIDATO = `
  EXISTS (SELECT 1 FROM contactos_bloqueados b WHERE b.telefono = l.telefono) AS bloqueado,
  EXISTS (SELECT 1 FROM conversaciones c WHERE c.telefono = l.telefono AND c.modo = 'manual') AS con_asesor,
  EXISTS (
    SELECT 1 FROM publicacion_destinatarios pd2 JOIN leads l2 ON l2.id = pd2.lead_id
    WHERE l2.telefono = l.telefono AND pd2.estado = 'enviado' AND pd2.publicacion_id <> $1
      AND pd2.enviado_en > now() - make_interval(days => $2)
  ) AS contactado_reciente`;

/**
 * Crea un destinatario por cada lead de la lista. Los que no hay que
 * contactar quedan como 'excluido' con su motivo (no desaparecen: se ven en
 * el progreso y en el log). Los enviables se reparten en round-robin entre
 * los numeros elegidos (seccion 3.3). Se llama una sola vez, al arrancar la
 * publicacion por primera vez — reanudar una pausada NUNCA vuelve a llamar esto.
 */
/**
 * Cada lead de la lista con su motivo de exclusion (null = enviable). Lo
 * usan la generacion real de destinatarios y la simulacion (dry-run), asi
 * las dos aplican exactamente las mismas reglas. publicacionId = 0 en la
 * simulacion (todavia no existe).
 */
async function clasificarCandidatos(
  publicacionId: number,
  listaId: number,
  diasSinRecontactar: number,
): Promise<{ leadId: number; motivo: string | null }[]> {
  const candidatos = await consultar<FilaCandidato>(
    `SELECT l.id AS lead_id, l.telefono, l.etapa_pipeline, ${CONDICIONES_CANDIDATO}
     FROM leads l WHERE l.lista_id = $3 ORDER BY l.id`,
    [publicacionId, diasSinRecontactar, listaId],
  );

  const telefonosVistos = new Set<string>();
  return candidatos.map((c) => {
    let motivo = motivoExclusion(c, diasSinRecontactar);
    if (!motivo && telefonosVistos.has(c.telefono)) motivo = 'Teléfono repetido en la lista';
    telefonosVistos.add(c.telefono);
    return { leadId: c.lead_id, motivo };
  });
}

/** Para la simulacion: cuantos se enviarian y cuantos se excluyen por cada motivo. */
export async function resumirExclusiones(
  listaId: number,
  diasSinRecontactar: number,
): Promise<{ enviables: number[]; excluidosPorMotivo: Record<string, number> }> {
  const clasificados = await clasificarCandidatos(0, listaId, diasSinRecontactar);
  const excluidosPorMotivo: Record<string, number> = {};
  const enviables: number[] = [];
  for (const c of clasificados) {
    if (c.motivo) excluidosPorMotivo[c.motivo] = (excluidosPorMotivo[c.motivo] ?? 0) + 1;
    else enviables.push(c.leadId);
  }
  return { enviables, excluidosPorMotivo };
}

export async function generarDestinatarios(
  publicacionId: number,
  listaId: number,
  numeroIds: number[],
  diasSinRecontactar: number,
): Promise<{ total: number; excluidos: number }> {
  const clasificados = await clasificarCandidatos(publicacionId, listaId, diasSinRecontactar);
  if (clasificados.length === 0) return { total: 0, excluidos: 0 };

  let enviables = 0;
  const filas = clasificados.map(({ leadId, motivo }) => {
    if (motivo) return [publicacionId, leadId, null, 'excluido', motivo];
    const numeroId = numeroIds[enviables % numeroIds.length];
    enviables += 1;
    return [publicacionId, leadId, numeroId, 'pendiente', null];
  });

  await transaccion(async (cliente) => {
    await insertarEnBloque(
      cliente,
      'publicacion_destinatarios',
      ['publicacion_id', 'lead_id', 'numero_id', 'estado', 'motivo_fallo'],
      filas,
    );
  });
  return { total: clasificados.length, excluidos: clasificados.length - enviables };
}

/**
 * Reconfirma justo antes de enviar: entre que se armo la campana y este
 * envio el contacto puede haber pedido la baja o haber pasado a un asesor.
 */
export async function motivoExclusionAlEnviar(
  publicacionId: number,
  leadId: number,
  diasSinRecontactar: number,
): Promise<string | null> {
  const fila = await consultarUno<FilaCandidato>(
    `SELECT l.id AS lead_id, l.telefono, l.etapa_pipeline, ${CONDICIONES_CANDIDATO}
     FROM leads l WHERE l.id = $3`,
    [publicacionId, diasSinRecontactar, leadId],
  );
  return fila ? motivoExclusion(fila, diasSinRecontactar) : 'El lead ya no existe';
}

/** Arranque o reanudacion: desde aca se cuenta el limite de mensajes de esta ejecucion. */
export async function marcarInicioEjecucion(publicacionId: number): Promise<void> {
  await consultarUno('UPDATE publicaciones SET ejecucion_iniciada_en = now() WHERE id = $1', [publicacionId]);
}

export async function contarEnviadosEjecucion(publicacionId: number): Promise<number> {
  const fila = await consultarUno<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM publicacion_destinatarios pd JOIN publicaciones p ON p.id = pd.publicacion_id
     WHERE pd.publicacion_id = $1 AND pd.estado = 'enviado'
       AND pd.enviado_en >= COALESCE(p.ejecucion_iniciada_en, p.iniciada_en, '-infinity'::timestamptz)`,
    [publicacionId],
  );
  return fila?.total ?? 0;
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
 * El siguiente pendiente. Si su numero asignado no esta conectado (se cayo
 * o se archivo), se reasigna a uno conectado de la campana: antes esos
 * destinatarios quedaban esperando para siempre y la campana se pausaba.
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
     WHERE pd.publicacion_id = $1 AND pd.estado = 'pendiente'
     ORDER BY (pd.numero_id = ANY($2::int[])) DESC, pd.id ASC
     LIMIT 1`,
    [publicacionId, numerosConectados],
  );
  if (!fila) return null;

  let numeroId = fila.numero_id;
  if (!numerosConectados.includes(numeroId)) {
    numeroId = numerosConectados[fila.id % numerosConectados.length]!;
    await consultarUno('UPDATE publicacion_destinatarios SET numero_id = $2 WHERE id = $1', [fila.id, numeroId]);
  }

  return {
    destinatarioId: fila.id,
    leadId: fila.lead_id,
    numeroId,
    telefono: fila.telefono,
    empresa: fila.empresa,
    rubro: fila.rubro,
    datosExtra: fila.datos_extra,
  };
}

export async function marcarResultadoDestinatario(
  destinatarioId: number,
  estado: EstadoDestinatario,
  detalle: {
    motivoFallo?: string | null;
    mensajeEnviado?: string | null;
    numeroId?: number;
    whatsappId?: string | null;
    varianteIndice?: number;
  } = {},
): Promise<void> {
  await consultarUno(
    `UPDATE publicacion_destinatarios
     SET estado = $2, motivo_fallo = $3, mensaje_enviado = $4,
         numero_id = COALESCE($5, numero_id),
         whatsapp_id = COALESCE($6, whatsapp_id),
         variante_indice = COALESCE($7, variante_indice),
         enviado_en = CASE WHEN $2 = 'enviado' THEN now() ELSE enviado_en END
     WHERE id = $1`,
    [
      destinatarioId,
      estado,
      detalle.motivoFallo ?? null,
      detalle.mensajeEnviado ?? null,
      detalle.numeroId ?? null,
      detalle.whatsappId ?? null,
      detalle.varianteIndice ?? null,
    ],
  );
}

/**
 * Confirmaciones de WhatsApp (los "vistos"): entregado y leido. Solo
 * avanzan; leido implica entregado aunque WhatsApp no haya mandado ese paso.
 */
export async function registrarEstadoEntrega(whatsappId: string, estado: 'entregado' | 'leido'): Promise<void> {
  await consultarUno(
    `UPDATE publicacion_destinatarios
     SET entregado_en = COALESCE(entregado_en, now()),
         leido_en = CASE WHEN $2 = 'leido' THEN COALESCE(leido_en, now()) ELSE leido_en END
     WHERE whatsapp_id = $1`,
    [whatsappId, estado],
  );
}

/**
 * Primera respuesta del lead a su envio mas reciente (de los ultimos 30
 * dias). Es lo que mide la tasa de respuesta real de cada campana.
 */
export async function registrarRespuesta(telefono: string): Promise<void> {
  await consultarUno(
    `UPDATE publicacion_destinatarios SET respondio_en = now()
     WHERE id = (
       SELECT pd.id FROM publicacion_destinatarios pd JOIN leads l ON l.id = pd.lead_id
       WHERE l.telefono = $1 AND pd.estado = 'enviado' AND pd.enviado_en > now() - interval '30 days'
       ORDER BY pd.enviado_en DESC LIMIT 1
     ) AND respondio_en IS NULL`,
    [telefono],
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
