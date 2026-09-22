import { consultar, consultarUno } from '../../db/pool.js';
import { noEncontrado } from '../../lib/errors.js';
import type {
  AutorMensaje,
  ConversacionDetalle,
  ConversacionResumen,
  EscaladoMotivo,
  MensajeConversacion,
  ModoConversacion,
} from './tipos.js';

/**
 * La lista de Respuestas (seccion 3.6) necesita, por cada conversacion: los
 * datos del lead (si hay uno), y el nombre de la ultima campana que se le
 * envio a ese lead — de ahi el par de LEFT JOIN con subconsulta. A este
 * volumen (decenas de conversaciones, cientos de leads) es una consulta
 * barata; si algun dia crece mucho se puede materializar en una columna.
 */
const SELECT_RESUMEN = `
  SELECT
    c.id, c.numero_id, c.lead_id, c.telefono, c.nombre_contacto,
    c.no_leidos, c.ultimo_mensaje_en, c.ultimo_mensaje_preview, c.creado_en,
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
  no_leidos: number;
  ultimo_mensaje_en: string | null;
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

/**
 * Solo conversaciones con lead conocido Y que de verdad escribio de vuelta
 * al menos una vez: la pantalla de Respuestas es "leads que CONTESTARON tus
 * campañas", no la lista completa de a quien se le envio algo (eso ya lo
 * cubre el reporte de la campana, seccion 3.7). El envio saliente de una
 * campana si crea la conversacion (para que el historial este completo
 * desde el primer mensaje), pero no la hace aparecer aqui hasta que haya
 * al menos un mensaje del lead.
 */
export async function listarConLead(): Promise<ConversacionResumen[]> {
  const filas = await consultar<FilaResumen>(
    `${SELECT_RESUMEN}
     WHERE c.lead_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM mensajes_conversacion mc WHERE mc.conversacion_id = c.id AND mc.autor = 'lead')
     ORDER BY c.ultimo_mensaje_en DESC NULLS LAST`,
  );
  return filas.map(mapearResumen);
}

export async function obtenerDetalle(id: number): Promise<ConversacionDetalle | null> {
  const fila = await consultarUno<FilaResumen>(`${SELECT_RESUMEN} WHERE c.id = $1`, [id]);
  return fila ? mapearDetalle(fila) : null;
}

export async function contarNoLeidas(): Promise<number> {
  const fila = await consultarUno<{ total: number }>(
    `SELECT COUNT(*) AS total FROM conversaciones WHERE no_leidos > 0 AND lead_id IS NOT NULL`,
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

export async function contarMensajes(conversacionId: number): Promise<number> {
  const fila = await consultarUno<{ total: number }>(
    'SELECT COUNT(*) AS total FROM mensajes_conversacion WHERE conversacion_id = $1',
    [conversacionId],
  );
  return fila?.total ?? 0;
}

type FilaMensaje = { id: number; autor: AutorMensaje; texto: string; creado_en: string };

export async function obtenerMensajes(conversacionId: number): Promise<MensajeConversacion[]> {
  const filas = await consultar<FilaMensaje>(
    'SELECT id, autor, texto, creado_en FROM mensajes_conversacion WHERE conversacion_id = $1 ORDER BY creado_en ASC',
    [conversacionId],
  );
  return filas.map((f) => ({ id: f.id, autor: f.autor, texto: f.texto, creadoEn: f.creado_en }));
}

/**
 * Agrega un mensaje y actualiza el resumen de la conversacion (preview,
 * fecha, no_leidos). Si whatsapp_id ya existe, no duplica (Baileys puede
 * reemitir el mismo evento tras una reconexion).
 */
export async function agregarMensaje(
  conversacionId: number,
  autor: AutorMensaje,
  texto: string,
  whatsappId: string | null,
): Promise<MensajeConversacion | null> {
  if (whatsappId) {
    const yaExiste = await consultarUno('SELECT 1 FROM mensajes_conversacion WHERE whatsapp_id = $1', [whatsappId]);
    if (yaExiste) return null;
  }

  const fila = await consultarUno<FilaMensaje>(
    `INSERT INTO mensajes_conversacion (conversacion_id, autor, texto, whatsapp_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, autor, texto, creado_en`,
    [conversacionId, autor, texto, whatsappId],
  );
  if (!fila) return null;

  const preview = texto.length > 140 ? `${texto.slice(0, 140)}…` : texto;
  await consultarUno(
    `UPDATE conversaciones
     SET ultimo_mensaje_en = $2, ultimo_mensaje_preview = $3,
         no_leidos = CASE WHEN $4 = 'lead' THEN no_leidos + 1 ELSE no_leidos END
     WHERE id = $1`,
    [conversacionId, fila.creado_en, preview, autor],
  );

  return { id: fila.id, autor: fila.autor, texto: fila.texto, creadoEn: fila.creado_en };
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
