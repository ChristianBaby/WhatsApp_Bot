import { consultar, consultarUno } from '../../db/pool.js';
import { noEncontrado } from '../../lib/errors.js';
import type {
  AutorMensaje,
  ConversacionDetalle,
  ConversacionResumen,
  EscaladoMotivo,
  EstadoEntrega,
  ExtraMensaje,
  ExtrasMensaje,
  FiltroConversaciones,
  MediaInfo,
  MensajeConversacion,
  ModoConversacion,
  Reacciones,
  TipoMensaje,
} from './tipos.js';

/**
 * La lista de chats necesita, por cada conversacion: los datos del lead (si
 * hay uno), y el nombre de la ultima campana que se le envio a ese lead — de
 * ahi el LEFT JOIN y la subconsulta. Como la lista se pide de a una pagina
 * (ver listar), la subconsulta corre solo para esas pocas filas.
 */
const SELECT_RESUMEN = `
  SELECT
    c.id, c.numero_id, c.lead_id, c.telefono, c.nombre_contacto, c.nombre_agenda,
    c.no_leidos, c.ultimo_mensaje_en, c.ultimo_mensaje_en::text AS orden_fecha,
    c.ultimo_mensaje_preview, c.creado_en,
    c.modo, c.escalado_motivo, c.ia_sugerencia, c.ia_sugerencia_en,
    l.empresa, l.rubro, l.etapa_pipeline, l.notas,
    (
      SELECT p.nombre FROM publicacion_destinatarios pd
      JOIN publicaciones p ON p.id = pd.publicacion_id
      WHERE pd.lead_id = c.lead_id AND pd.estado = 'enviado'
      ORDER BY pd.enviado_en DESC LIMIT 1
    ) AS campana_nombre
  FROM conversaciones c
  LEFT JOIN leads l ON l.id = c.lead_id
`;

type FilaResumen = {
  id: number;
  numero_id: number;
  lead_id: number | null;
  telefono: string;
  nombre_contacto: string | null;
  nombre_agenda: string | null;
  no_leidos: number;
  ultimo_mensaje_en: string | null;
  /** La fecha como texto de Postgres (microsegundos): el cursor no puede perder precision. */
  orden_fecha: string | null;
  ultimo_mensaje_preview: string | null;
  creado_en: string;
  modo: ModoConversacion;
  escalado_motivo: EscaladoMotivo | null;
  ia_sugerencia: string | null;
  ia_sugerencia_en: string | null;
  empresa: string | null;
  rubro: string | null;
  etapa_pipeline: string | null;
  notas: string | null;
  campana_nombre: string | null;
};

function mapearResumen(fila: FilaResumen): ConversacionResumen {
  return {
    id: fila.id,
    leadId: fila.lead_id,
    numeroId: fila.numero_id,
    telefono: fila.telefono,
    nombreContacto: fila.nombre_contacto,
    nombreAgenda: fila.nombre_agenda,
    empresa: fila.empresa,
    rubro: fila.rubro,
    etapaPipeline: fila.etapa_pipeline,
    campanaNombre: fila.campana_nombre,
    noLeidos: fila.no_leidos,
    ultimoMensajeEn: fila.ultimo_mensaje_en,
    ultimoMensajePreview: fila.ultimo_mensaje_preview,
    modo: fila.modo,
    escaladoMotivo: fila.escalado_motivo,
    iaSugerencia: fila.ia_sugerencia,
    iaSugerenciaEn: fila.ia_sugerencia_en,
    creadoEn: fila.creado_en,
  };
}

function mapearDetalle(fila: FilaResumen): ConversacionDetalle {
  return { ...mapearResumen(fila), notas: fila.notas };
}

export type PaginaConversaciones = {
  conversaciones: ConversacionResumen[];
  /** Para pedir la pagina siguiente; null si ya no hay mas. */
  siguienteCursor: string | null;
};

// El cursor es "fecha|id" de la ultima fila de la pagina, en base64url: es
// opaco para el panel y estable aunque lleguen mensajes nuevos mientras se
// recorre la lista (una paginacion por OFFSET repetiria o saltaria chats).
function codificarCursor(fecha: string, id: number): string {
  return Buffer.from(`${fecha}|${id}`).toString('base64url');
}

function decodificarCursor(cursor: string): { fecha: string; id: number } | null {
  const [fecha, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const numero = Number(id);
  if (!fecha || !Number.isInteger(numero)) return null;
  return { fecha, id: numero };
}

/**
 * La lista de chats, mas recientes primero, de a una pagina: el panel pide
 * la siguiente solo cuando el usuario llega al final de la lista. Solo
 * chats con al menos un mensaje (una conversacion vacia no tiene nada que
 * mostrar).
 *
 * Filtros: 'leads' es lo que antes era toda la pantalla de Respuestas (leads
 * que contestaron una campana); 'asesor', los chats que el bot paso a una
 * persona porque lo pidieron o porque no supo responder.
 */
export async function listar(opciones: {
  filtro: FiltroConversaciones;
  busqueda?: string | null;
  cursor?: string | null;
  limite: number;
}): Promise<PaginaConversaciones> {
  const params: unknown[] = [];
  const param = (valor: unknown) => {
    params.push(valor);
    return `$${params.length}`;
  };
  const condiciones = ['c.ultimo_mensaje_en IS NOT NULL'];

  if (opciones.filtro === 'no_leidos') condiciones.push('c.no_leidos > 0');
  if (opciones.filtro === 'leads') {
    condiciones.push(
      `c.lead_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM mensajes_conversacion mc WHERE mc.conversacion_id = c.id AND mc.autor = 'lead')`,
    );
  }
  if (opciones.filtro === 'asesor') {
    condiciones.push(`c.modo = 'manual' AND c.escalado_motivo IN ('palabra_clave', 'baja_confianza')`);
  }

  const busqueda = opciones.busqueda?.trim();
  if (busqueda) {
    const patron = param(`%${busqueda.replace(/[\\%_]/g, '\\$&')}%`);
    const digitos = busqueda.replace(/\D/g, '');
    condiciones.push(
      `(c.nombre_agenda ILIKE ${patron} OR c.nombre_contacto ILIKE ${patron} OR l.empresa ILIKE ${patron}
        ${digitos.length >= 3 ? `OR c.telefono LIKE ${param(`%${digitos}%`)}` : ''})`,
    );
  }

  const cursor = opciones.cursor ? decodificarCursor(opciones.cursor) : null;
  if (cursor) {
    condiciones.push(`(c.ultimo_mensaje_en, c.id) < (${param(cursor.fecha)}::timestamptz, ${param(cursor.id)}::int)`);
  }

  const filas = await consultar<FilaResumen>(
    `${SELECT_RESUMEN}
     WHERE ${condiciones.join(' AND ')}
     ORDER BY c.ultimo_mensaje_en DESC, c.id DESC
     LIMIT ${param(opciones.limite + 1)}`,
    params,
  );

  const hayMas = filas.length > opciones.limite;
  const pagina = hayMas ? filas.slice(0, opciones.limite) : filas;
  const ultima = pagina[pagina.length - 1];
  return {
    conversaciones: pagina.map(mapearResumen),
    siguienteCursor: hayMas && ultima?.orden_fecha ? codificarCursor(ultima.orden_fecha, ultima.id) : null,
  };
}

export async function obtenerDetalle(id: number): Promise<ConversacionDetalle | null> {
  const fila = await consultarUno<FilaResumen>(`${SELECT_RESUMEN} WHERE c.id = $1`, [id]);
  return fila ? mapearDetalle(fila) : null;
}

/** Chats con mensajes sin leer (el numerito de la barra lateral). */
export async function contarNoLeidas(): Promise<number> {
  const fila = await consultarUno<{ total: number }>(
    'SELECT COUNT(*)::int AS total FROM conversaciones WHERE no_leidos > 0',
  );
  return fila?.total ?? 0;
}

export type FilaConversacionCruda = {
  id: number;
  numero_id: number;
  lead_id: number | null;
  telefono: string;
  no_leidos: number;
  modo: ModoConversacion;
  bienvenida_enviada_en: string | null;
};

const CAMPOS_CRUDOS = 'id, numero_id, lead_id, telefono, no_leidos, modo, bienvenida_enviada_en';

/**
 * Busca la conversacion de (numero, telefono) o la crea si es la primera
 * vez que escriben. Devuelve el estado ANTES de agregar el mensaje actual
 * (util para decidir si avisar al dueño y si corresponde auto-responder:
 * ver services/conversaciones/mensajeEntrante.ts).
 */
export async function obtenerOCrearConversacion(datos: {
  numeroId: number;
  telefono: string;
  nombreContacto: string | null;
  leadId: number | null;
}): Promise<FilaConversacionCruda> {
  const existente = await consultarUno<FilaConversacionCruda>(
    `SELECT ${CAMPOS_CRUDOS} FROM conversaciones WHERE numero_id = $1 AND telefono = $2`,
    [datos.numeroId, datos.telefono],
  );

  if (existente) {
    // Si antes no tenia lead y ahora si calza (ej. se subio la lista despues
    // de que ya habia escrito), lo enlazamos; nunca lo desenlazamos.
    if (!existente.lead_id && datos.leadId) {
      await consultarUno('UPDATE conversaciones SET lead_id = $2 WHERE id = $1', [existente.id, datos.leadId]);
      existente.lead_id = datos.leadId;
    }
    if (datos.nombreContacto) {
      await consultarUno('UPDATE conversaciones SET nombre_contacto = $2 WHERE id = $1', [
        existente.id,
        datos.nombreContacto,
      ]);
    }
    return existente;
  }

  const creada = await consultarUno<FilaConversacionCruda>(
    `INSERT INTO conversaciones (numero_id, lead_id, telefono, nombre_contacto)
     VALUES ($1, $2, $3, $4)
     RETURNING ${CAMPOS_CRUDOS}`,
    [datos.numeroId, datos.leadId, datos.telefono, datos.nombreContacto],
  );
  return creada!;
}

/** Estado actual (modo, bienvenida...) para decidir en el momento de auto-responder, no al recibir. */
export async function obtenerCruda(conversacionId: number): Promise<FilaConversacionCruda | null> {
  return consultarUno<FilaConversacionCruda>(`SELECT ${CAMPOS_CRUDOS} FROM conversaciones WHERE id = $1`, [conversacionId]);
}

/**
 * Lo que el lead escribio desde la ultima vez que le respondimos (bot o
 * persona). Si mando 3 mensajes seguidos, se contestan juntos una sola vez.
 * Lo importado del historial del telefono no cuenta: son mensajes viejos
 * que el usuario ya vio (o no) en su celular, no algo que la IA deba contestar.
 */
export async function mensajesLeadSinResponder(conversacionId: number): Promise<string[]> {
  const filas = await consultar<{ texto: string }>(
    `SELECT texto FROM mensajes_conversacion
     WHERE conversacion_id = $1 AND autor = 'lead' AND NOT del_historial
       AND creado_en > COALESCE(
         (SELECT MAX(creado_en) FROM mensajes_conversacion WHERE conversacion_id = $1 AND autor IN ('bot', 'yo')),
         '-infinity'::timestamptz)
     ORDER BY creado_en ASC`,
    [conversacionId],
  );
  return filas.map((f) => f.texto);
}

export async function existeMensaje(whatsappId: string): Promise<boolean> {
  return Boolean(await consultarUno('SELECT 1 FROM mensajes_conversacion WHERE whatsapp_id = $1', [whatsappId]));
}

/** Ultimos mensajes, de mas antiguo a mas reciente (contexto para la IA). */
export async function obtenerUltimosMensajes(
  conversacionId: number,
  limite: number,
): Promise<{ autor: AutorMensaje; texto: string }[]> {
  const filas = await consultar<{ autor: AutorMensaje; texto: string }>(
    `SELECT autor, texto FROM (
       SELECT autor, texto, creado_en, id FROM mensajes_conversacion
       WHERE conversacion_id = $1 ORDER BY creado_en DESC, id DESC LIMIT $2
     ) ultimos ORDER BY creado_en ASC, id ASC`,
    [conversacionId, limite],
  );
  return filas;
}

/** Respuestas automaticas en esta conversacion en los ultimos N minutos (freno anti-bucle). */
export async function contarRespuestasBot(conversacionId: number, minutos: number): Promise<number> {
  const fila = await consultarUno<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM mensajes_conversacion
     WHERE conversacion_id = $1 AND autor = 'bot' AND creado_en > now() - make_interval(mins => $2)`,
    [conversacionId, minutos],
  );
  return fila?.total ?? 0;
}

export async function contarMensajes(conversacionId: number): Promise<number> {
  const fila = await consultarUno<{ total: number }>(
    'SELECT COUNT(*) AS total FROM mensajes_conversacion WHERE conversacion_id = $1',
    [conversacionId],
  );
  return fila?.total ?? 0;
}

const CAMPOS_MENSAJE =
  'id, autor, texto, tipo, media, estado_entrega, creado_en, whatsapp_id, extra, reacciones, editado_en, eliminado';

type FilaMensaje = {
  id: number;
  autor: AutorMensaje;
  texto: string;
  tipo: TipoMensaje;
  media: MediaInfo | null;
  estado_entrega: EstadoEntrega | null;
  creado_en: string;
  whatsapp_id: string | null;
  extra: ExtraMensaje | null;
  reacciones: Reacciones | null;
  editado_en: string | null;
  eliminado: boolean;
};

function mapearMensaje(f: FilaMensaje): MensajeConversacion {
  return {
    id: f.id,
    autor: f.autor,
    texto: f.texto,
    tipo: f.tipo,
    media: f.media,
    estadoEntrega: f.estado_entrega,
    creadoEn: f.creado_en,
    whatsappId: f.whatsapp_id,
    extra: f.extra,
    reacciones: f.reacciones,
    editado: f.editado_en !== null,
    eliminado: f.eliminado,
  };
}

function preview(texto: string): string {
  return texto.length > 140 ? `${texto.slice(0, 140)}…` : texto;
}

/**
 * Una pagina de mensajes de un chat, de mas antiguo a mas reciente: los
 * ultimos `limite`, o los anteriores al mensaje `antesDeId` (el panel pide
 * mas cuando el usuario sube hasta el principio del chat).
 */
export async function obtenerMensajesPagina(
  conversacionId: number,
  antesDeId: number | null,
  limite: number,
): Promise<{ mensajes: MensajeConversacion[]; hayMas: boolean }> {
  const filas = await consultar<FilaMensaje>(
    `SELECT ${CAMPOS_MENSAJE} FROM mensajes_conversacion
     WHERE conversacion_id = $1
       AND ($2::int IS NULL OR (creado_en, id) < (
         SELECT creado_en, id FROM mensajes_conversacion WHERE id = $2 AND conversacion_id = $1))
     ORDER BY creado_en DESC, id DESC
     LIMIT $3`,
    [conversacionId, antesDeId, limite + 1],
  );
  const hayMas = filas.length > limite;
  return { mensajes: filas.slice(0, limite).reverse().map(mapearMensaje), hayMas };
}

/**
 * Agrega un mensaje y actualiza el resumen de la conversacion (preview,
 * fecha, no_leidos). Si whatsapp_id ya existe, no duplica (Baileys puede
 * reemitir el mismo evento tras una reconexion) y devuelve null.
 */
export async function agregarMensaje(
  conversacionId: number,
  autor: AutorMensaje,
  texto: string,
  whatsappId: string | null,
  extras: ExtrasMensaje = {},
): Promise<MensajeConversacion | null> {
  const fila = await consultarUno<FilaMensaje>(
    `INSERT INTO mensajes_conversacion
       (conversacion_id, autor, texto, whatsapp_id, tipo, media, media_descarga, media_archivo, estado_entrega, creado_en,
        media_usado_en, extra)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::text, $9, COALESCE($10::timestamptz, now()),
             CASE WHEN $8::text IS NOT NULL THEN now() END, $11::jsonb)
     ON CONFLICT (whatsapp_id) WHERE whatsapp_id IS NOT NULL DO NOTHING
     RETURNING ${CAMPOS_MENSAJE}`,
    [
      conversacionId,
      autor,
      texto,
      whatsappId,
      extras.tipo ?? 'texto',
      extras.media ? JSON.stringify(extras.media) : null,
      extras.mediaDescarga ?? null,
      extras.mediaArchivo ?? null,
      extras.estadoEntrega ?? null,
      extras.creadoEn ?? null,
      extras.extra ? JSON.stringify(extras.extra) : null,
    ],
  );
  if (!fila) return null;

  // Un mensaje con fecha anterior al ultimo (llega tarde) no cambia el preview.
  await consultarUno(
    `UPDATE conversaciones
     SET ultimo_mensaje_preview = CASE WHEN ultimo_mensaje_en IS NULL OR $2 >= ultimo_mensaje_en
                                       THEN $3 ELSE ultimo_mensaje_preview END,
         ultimo_mensaje_en = GREATEST(ultimo_mensaje_en, $2),
         no_leidos = CASE WHEN $4 = 'lead' THEN no_leidos + 1 ELSE no_leidos END
     WHERE id = $1`,
    [conversacionId, fila.creado_en, preview(texto), autor],
  );

  return mapearMensaje(fila);
}

// ==================== Adjuntos ====================

export type MediaDeMensaje = {
  tipo: TipoMensaje;
  media: MediaInfo | null;
  /** Mensaje de WhatsApp serializado con BufferJSON (texto JSON). */
  mediaDescarga: string | null;
  mediaArchivo: string | null;
};

export async function obtenerMediaDeMensaje(conversacionId: number, mensajeId: number): Promise<MediaDeMensaje | null> {
  const fila = await consultarUno<{
    tipo: TipoMensaje;
    media: MediaInfo | null;
    media_descarga: string | null;
    media_archivo: string | null;
  }>(
    `SELECT tipo, media, media_descarga::text AS media_descarga, media_archivo
     FROM mensajes_conversacion WHERE id = $1 AND conversacion_id = $2`,
    [mensajeId, conversacionId],
  );
  if (!fila) return null;
  return { tipo: fila.tipo, media: fila.media, mediaDescarga: fila.media_descarga, mediaArchivo: fila.media_archivo };
}

/** El archivo ya se descargo una vez: las siguientes veces se sirve del disco. */
export async function guardarArchivoMedia(mensajeId: number, archivo: string): Promise<void> {
  await consultarUno('UPDATE mensajes_conversacion SET media_archivo = $2, media_usado_en = now() WHERE id = $1', [
    mensajeId,
    archivo,
  ]);
}

/**
 * Un adjunto enviado desde el panel ya esta en disco. Si el eco de Baileys
 * guardo el mensaje antes que la ruta de envio, se le asocia el archivo
 * local por whatsapp_id (asi no hay que volver a bajarlo de WhatsApp).
 */
export async function asociarArchivoLocal(whatsappId: string, archivo: string): Promise<void> {
  await consultarUno(
    `UPDATE mensajes_conversacion
     SET media_archivo = $2, media_usado_en = now(), estado_entrega = COALESCE(estado_entrega, 'enviado')
     WHERE whatsapp_id = $1`,
    [whatsappId, archivo],
  );
}

/**
 * ✓✓ / ✓✓ azul de WhatsApp sobre un mensaje nuestro. Solo avanza (enviado →
 * entregado → leido): los eventos pueden llegar desordenados.
 */
export async function actualizarEstadoEntrega(
  whatsappId: string,
  estado: EstadoEntrega,
): Promise<{ mensajeId: number; conversacionId: number } | null> {
  const fila = await consultarUno<{ id: number; conversacion_id: number }>(
    `UPDATE mensajes_conversacion SET estado_entrega = $2
     WHERE whatsapp_id = $1 AND autor IN ('yo', 'bot')
       AND (estado_entrega IS NULL OR estado_entrega = 'enviado' OR (estado_entrega = 'entregado' AND $2 = 'leido'))
     RETURNING id, conversacion_id`,
    [whatsappId, estado],
  );
  return fila ? { mensajeId: fila.id, conversacionId: fila.conversacion_id } : null;
}

// ==================== Reacciones, ediciones y eliminados ====================

export type MensajeCambiado = { conversacionId: number; mensaje: MensajeConversacion };

/** Si el mensaje cambiado es el ultimo del chat, el preview de la lista tiene que reflejarlo. */
async function refrescarPreviewSiEsUltimo(conversacionId: number, mensajeId: number, texto: string): Promise<void> {
  await consultarUno(
    `UPDATE conversaciones SET ultimo_mensaje_preview = $3
     WHERE id = $1 AND $2 = (SELECT id FROM mensajes_conversacion WHERE conversacion_id = $1
                             ORDER BY creado_en DESC, id DESC LIMIT 1)`,
    [conversacionId, mensajeId, preview(texto)],
  );
}

/** Reaccion de un lado del chat (emoji null = la quito). */
export async function aplicarReaccion(
  whatsappId: string,
  quien: 'yo' | 'lead',
  emoji: string | null,
): Promise<MensajeCambiado | null> {
  const fila = await consultarUno<FilaMensaje & { conversacion_id: number }>(
    `UPDATE mensajes_conversacion
     SET reacciones = NULLIF(
           CASE WHEN $3::text IS NULL THEN COALESCE(reacciones, '{}'::jsonb) - $2::text
                ELSE COALESCE(reacciones, '{}'::jsonb) || jsonb_build_object($2::text, $3::text) END,
           '{}'::jsonb)
     WHERE whatsapp_id = $1
     RETURNING conversacion_id, ${CAMPOS_MENSAJE}`,
    [whatsappId, quien, emoji],
  );
  return fila ? { conversacionId: fila.conversacion_id, mensaje: mapearMensaje(fila) } : null;
}

/** Edicion de un mensaje: el texto, o la leyenda si es una foto/video/documento. */
export async function aplicarEdicion(
  whatsappId: string,
  texto: string,
  leyenda: string | null,
): Promise<MensajeCambiado | null> {
  const fila = await consultarUno<FilaMensaje & { conversacion_id: number }>(
    `UPDATE mensajes_conversacion
     SET texto = CASE WHEN media IS NULL THEN $2 ELSE texto END,
         media = CASE WHEN media IS NULL THEN media ELSE jsonb_set(media, '{leyenda}', to_jsonb($3::text)) END,
         editado_en = now()
     WHERE whatsapp_id = $1 AND NOT eliminado
     RETURNING conversacion_id, ${CAMPOS_MENSAJE}`,
    [whatsappId, texto, leyenda],
  );
  if (!fila) return null;
  await refrescarPreviewSiEsUltimo(fila.conversacion_id, fila.id, fila.texto);
  return { conversacionId: fila.conversacion_id, mensaje: mapearMensaje(fila) };
}

/** "Eliminar para todos": se conserva el contenido, el panel lo oculta. */
export async function marcarEliminado(whatsappId: string): Promise<MensajeCambiado | null> {
  const fila = await consultarUno<FilaMensaje & { conversacion_id: number }>(
    `UPDATE mensajes_conversacion SET eliminado = true
     WHERE whatsapp_id = $1 AND NOT eliminado
     RETURNING conversacion_id, ${CAMPOS_MENSAJE}`,
    [whatsappId],
  );
  if (!fila) return null;
  await refrescarPreviewSiEsUltimo(fila.conversacion_id, fila.id, '🚫 Se eliminó este mensaje');
  return { conversacionId: fila.conversacion_id, mensaje: mapearMensaje(fila) };
}

// ==================== Historial y agenda ====================

/** El nombre con que el usuario guardo al contacto en su telefono (solo si el chat ya existe). */
export async function actualizarNombreAgenda(numeroId: number, telefono: string, nombre: string): Promise<number | null> {
  const fila = await consultarUno<{ id: number }>(
    `UPDATE conversaciones SET nombre_agenda = $3
     WHERE numero_id = $1 AND telefono = $2 AND nombre_agenda IS DISTINCT FROM $3
     RETURNING id`,
    [numeroId, telefono, nombre],
  );
  return fila?.id ?? null;
}

/**
 * Crea (o completa) el chat de un contacto que viene en el historial del
 * telefono. Nunca pisa lo que ya habia: un lead enlazado, un nombre de
 * agenda, ni baja los no leidos.
 */
export async function asegurarConversacionHistorial(datos: {
  numeroId: number;
  telefono: string;
  nombreAgenda: string | null;
  nombreContacto: string | null;
  leadId: number | null;
  noLeidos: number;
}): Promise<number> {
  const fila = await consultarUno<{ id: number }>(
    `INSERT INTO conversaciones (numero_id, telefono, nombre_agenda, nombre_contacto, lead_id, no_leidos)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (numero_id, telefono) DO UPDATE SET
       nombre_agenda = COALESCE(EXCLUDED.nombre_agenda, conversaciones.nombre_agenda),
       nombre_contacto = COALESCE(conversaciones.nombre_contacto, EXCLUDED.nombre_contacto),
       lead_id = COALESCE(conversaciones.lead_id, EXCLUDED.lead_id),
       no_leidos = GREATEST(conversaciones.no_leidos, EXCLUDED.no_leidos)
     RETURNING id`,
    [datos.numeroId, datos.telefono, datos.nombreAgenda, datos.nombreContacto, datos.leadId, datos.noLeidos],
  );
  return fila!.id;
}

export type MensajeHistorial = {
  autor: AutorMensaje;
  texto: string;
  whatsappId: string;
  creadoEn: Date;
  tipo: TipoMensaje;
  media: MediaInfo | null;
  mediaDescarga: string | null;
  extra: ExtraMensaje | null;
  reacciones: Reacciones | null;
};

const FILAS_POR_INSERT = 200;

/**
 * Guarda de una vez un lote de mensajes viejos del telefono (sin duplicar
 * los que ya estaban) y deja el preview del chat en su mensaje mas reciente.
 * Devuelve cuantos eran nuevos.
 */
export async function importarMensajesHistorial(conversacionId: number, mensajes: MensajeHistorial[]): Promise<number> {
  let nuevos = 0;
  for (let i = 0; i < mensajes.length; i += FILAS_POR_INSERT) {
    const lote = mensajes.slice(i, i + FILAS_POR_INSERT);
    const params: unknown[] = [];
    const valores = lote.map((m) => {
      const base = params.length;
      params.push(
        conversacionId,
        m.autor,
        m.texto,
        m.whatsappId,
        m.tipo,
        m.media ? JSON.stringify(m.media) : null,
        m.mediaDescarga,
        m.creadoEn,
        m.autor === 'lead' ? null : 'enviado',
        m.extra ? JSON.stringify(m.extra) : null,
        m.reacciones ? JSON.stringify(m.reacciones) : null,
      );
      const p = (n: number) => `$${base + n}`;
      return `(${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}::jsonb, ${p(7)}::jsonb, ${p(8)}::timestamptz, ${p(9)}, true, ${p(10)}::jsonb, ${p(11)}::jsonb)`;
    });
    const insertados = await consultar<{ id: number }>(
      `INSERT INTO mensajes_conversacion
         (conversacion_id, autor, texto, whatsapp_id, tipo, media, media_descarga, creado_en, estado_entrega, del_historial,
          extra, reacciones)
       VALUES ${valores.join(', ')}
       ON CONFLICT (whatsapp_id) WHERE whatsapp_id IS NOT NULL DO NOTHING
       RETURNING id`,
      params,
    );
    nuevos += insertados.length;
  }

  await consultarUno(
    `UPDATE conversaciones c
     SET ultimo_mensaje_en = m.creado_en,
         ultimo_mensaje_preview = CASE WHEN length(m.texto) > 140 THEN left(m.texto, 140) || '…' ELSE m.texto END
     FROM (SELECT creado_en, texto FROM mensajes_conversacion
           WHERE conversacion_id = $1 ORDER BY creado_en DESC, id DESC LIMIT 1) m
     WHERE c.id = $1`,
    [conversacionId],
  );
  return nuevos;
}

export async function guardarJidChat(conversacionId: number, jid: string): Promise<void> {
  await consultarUno('UPDATE conversaciones SET jid_chat = $2 WHERE id = $1 AND jid_chat IS DISTINCT FROM $2', [
    conversacionId,
    jid,
  ]);
}

/** Tope de mensajes a confirmar de una vez: un chat con cientos sin leer no necesita mas para quedar en azul. */
const MAX_CONFIRMAR_LECTURA = 100;

export type PendientesDeLectura = { numeroId: number; telefono: string; jid: string | null; ids: string[] };

/**
 * Los ultimos mensajes del lead que siguen sin leer (tantos como no_leidos),
 * para mandarle a WhatsApp la confirmacion de lectura. Las llamadas no son
 * mensajes de WhatsApp (su id es "llamada-..."), no se confirman.
 */
export async function pendientesDeLectura(conversacionId: number): Promise<PendientesDeLectura | null> {
  const conversacion = await consultarUno<{ numero_id: number; telefono: string; jid_chat: string | null; no_leidos: number }>(
    'SELECT numero_id, telefono, jid_chat, no_leidos FROM conversaciones WHERE id = $1',
    [conversacionId],
  );
  if (!conversacion || conversacion.no_leidos <= 0) return null;
  const filas = await consultar<{ whatsapp_id: string }>(
    `SELECT whatsapp_id FROM mensajes_conversacion
     WHERE conversacion_id = $1 AND autor = 'lead' AND whatsapp_id IS NOT NULL AND whatsapp_id NOT LIKE 'llamada-%'
     ORDER BY creado_en DESC, id DESC
     LIMIT $2`,
    [conversacionId, Math.min(conversacion.no_leidos, MAX_CONFIRMAR_LECTURA)],
  );
  if (!filas.length) return null;
  return {
    numeroId: conversacion.numero_id,
    telefono: conversacion.telefono,
    jid: conversacion.jid_chat,
    ids: filas.map((f) => f.whatsapp_id),
  };
}

export async function marcarLeida(conversacionId: number): Promise<ConversacionDetalle> {
  await consultarUno('UPDATE conversaciones SET no_leidos = 0 WHERE id = $1', [conversacionId]);
  const actualizada = await obtenerDetalle(conversacionId);
  if (!actualizada) throw noEncontrado('Conversacion no encontrada');
  return actualizada;
}

/**
 * Cambia el modo bot/manual (seccion 3.10). motivo solo aplica al pasar a
 * 'manual' de forma automatica (palabra clave / baja confianza); al volver
 * a 'bot' o al tomarlo el usuario a proposito, se limpia.
 */
export async function cambiarModo(
  conversacionId: number,
  modo: ModoConversacion,
  motivo: EscaladoMotivo | null = null,
  palabra: string | null = null,
): Promise<void> {
  await consultarUno(
    'UPDATE conversaciones SET modo = $2, escalado_motivo = $3, escalado_palabra = $4 WHERE id = $1',
    [conversacionId, modo, modo === 'manual' ? motivo : null, modo === 'manual' ? palabra : null],
  );
}

export async function marcarBienvenidaEnviada(conversacionId: number): Promise<void> {
  await consultarUno('UPDATE conversaciones SET bienvenida_enviada_en = now() WHERE id = $1', [conversacionId]);
}

/** Sugerencia de la IA (seccion 3.9) — nunca toca leads.etapa_pipeline por si sola. */
export async function guardarSugerenciaIA(conversacionId: number, sugerencia: string): Promise<void> {
  await consultarUno('UPDATE conversaciones SET ia_sugerencia = $2, ia_sugerencia_en = now() WHERE id = $1', [
    conversacionId,
    sugerencia,
  ]);
}

/** Se llama al confirmar o corregir una sugerencia: la tarjeta pendiente desaparece del panel. */
export async function limpiarSugerenciaIA(conversacionId: number): Promise<void> {
  await consultarUno('UPDATE conversaciones SET ia_sugerencia = NULL, ia_sugerencia_en = NULL WHERE id = $1', [
    conversacionId,
  ]);
}
