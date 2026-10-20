import { consultar, consultarUno } from '../../db/pool.js';
import { noEncontrado, solicitudInvalida } from '../../lib/errors.js';
import { crearLogger } from '../../lib/logger.js';
import { emitir } from '../../lib/sse.js';
import * as contactos from '../contactos/contactos.js';
import * as conversacionesRepo from '../conversaciones/repositorio.js';
import type { ConversacionDetalle } from '../conversaciones/tipos.js';
import { enviarMensaje } from '../whatsapp/envio.js';
import type { Autor } from './ficha.js';

/**
 * Recordatorios de un chat ("volver a escribirle el viernes"). Cuando vence,
 * se avisa una sola vez: en el panel (en vivo) y por WhatsApp al numero del
 * dueño, desde el mismo numero del chat. El chat queda con ⏰ hasta que se
 * marque como hecho.
 */

const log = crearLogger('crm-recordatorios');
const CANAL_SSE = 'conversaciones';
/** Cada cuanto se revisa si vencio alguno. */
const CADA_MS = 30_000;

export type Recordatorio = {
  id: number;
  conversacionId: number;
  texto: string;
  venceEn: string;
  creadoPorEmail: string | null;
  avisadoEn: string | null;
  hechoEn: string | null;
  creadoEn: string;
};

type Fila = {
  id: number;
  conversacion_id: number;
  texto: string;
  vence_en: string;
  creado_por_email: string | null;
  avisado_en: string | null;
  hecho_en: string | null;
  creado_en: string;
};

const CAMPOS = 'id, conversacion_id, texto, vence_en, creado_por_email, avisado_en, hecho_en, creado_en';

const mapear = (f: Fila): Recordatorio => ({
  id: f.id,
  conversacionId: f.conversacion_id,
  texto: f.texto,
  venceEn: f.vence_en,
  creadoPorEmail: f.creado_por_email,
  avisadoEn: f.avisado_en,
  hechoEn: f.hecho_en,
  creadoEn: f.creado_en,
});

async function emitirConversacion(id: number): Promise<void> {
  const detalle = await conversacionesRepo.obtenerDetalle(id);
  if (detalle) emitir(CANAL_SSE, 'conversacion:actualizada', detalle);
}

/** Los pendientes primero (el mas proximo arriba); despues los hechos, los ultimos 20. */
export async function listar(conversacionId: number): Promise<Recordatorio[]> {
  const filas = await consultar<Fila>(
    `(SELECT ${CAMPOS} FROM recordatorios WHERE conversacion_id = $1 AND hecho_en IS NULL ORDER BY vence_en)
     UNION ALL
     (SELECT ${CAMPOS} FROM recordatorios WHERE conversacion_id = $1 AND hecho_en IS NOT NULL ORDER BY hecho_en DESC LIMIT 20)`,
    [conversacionId],
  );
  return filas.map(mapear);
}

export async function crear(conversacionId: number, texto: string, venceEn: Date, autor: Autor): Promise<Recordatorio> {
  await conversacionesRepo.obtenerDatosChat(conversacionId);
  if (Number.isNaN(venceEn.getTime())) throw solicitudInvalida('Fecha inválida');
  const fila = await consultarUno<Fila>(
    `INSERT INTO recordatorios (conversacion_id, texto, vence_en, creado_por, creado_por_email)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${CAMPOS}`,
    [conversacionId, texto, venceEn, autor.id, autor.email ?? null],
  );
  await emitirConversacion(conversacionId);
  emitir(CANAL_SSE, 'recordatorio:cambio', { conversacionId });
  return mapear(fila!);
}

/** Hecho (o deshacer: vuelve a pendiente; si ya vencio no se avisa de nuevo). */
export async function marcarHecho(conversacionId: number, id: number, hecho: boolean): Promise<Recordatorio> {
  const fila = await consultarUno<Fila>(
    `UPDATE recordatorios SET hecho_en = CASE WHEN $3 THEN now() ELSE NULL END
     WHERE id = $1 AND conversacion_id = $2 RETURNING ${CAMPOS}`,
    [id, conversacionId, hecho],
  );
  if (!fila) throw noEncontrado('Recordatorio no encontrado');
  await emitirConversacion(conversacionId);
  emitir(CANAL_SSE, 'recordatorio:cambio', { conversacionId });
  return mapear(fila);
}

export async function borrar(conversacionId: number, id: number): Promise<void> {
  const fila = await consultarUno('DELETE FROM recordatorios WHERE id = $1 AND conversacion_id = $2 RETURNING id', [id, conversacionId]);
  if (!fila) throw noEncontrado('Recordatorio no encontrado');
  await emitirConversacion(conversacionId);
  emitir(CANAL_SSE, 'recordatorio:cambio', { conversacionId });
}

// ==================== Aviso al vencer ====================

function nombreDelChat(c: ConversacionDetalle): string {
  if (c.esGrupo) return c.nombreAgenda ?? 'un grupo';
  return c.ficha.nombre ?? c.nombreAgenda ?? c.empresa ?? c.nombreContacto ?? `+${c.telefono}`;
}

/**
 * Avisa los recordatorios que vencieron y todavia no se avisaron. Primero se
 * marcan como avisados (aunque el WhatsApp al dueño falle): asi un error
 * nunca hace que se repita el aviso cada 30 segundos.
 */
export async function avisarVencidos(): Promise<number> {
  const vencidos = await consultar<Fila>(
    `UPDATE recordatorios SET avisado_en = now()
     WHERE hecho_en IS NULL AND avisado_en IS NULL AND vence_en <= now()
     RETURNING ${CAMPOS}`,
  );
  if (!vencidos.length) return 0;
  const dueno = await contactos.telefonoDueno();
  for (const fila of vencidos) {
    const detalle = await conversacionesRepo.obtenerDetalle(fila.conversacion_id);
    if (!detalle) continue;
    const nombre = nombreDelChat(detalle);
    emitir(CANAL_SSE, 'recordatorio:vencido', { recordatorio: mapear(fila), conversacionId: detalle.id, nombre });
    emitir(CANAL_SSE, 'conversacion:actualizada', detalle);
    if (dueno) {
      await enviarMensaje(detalle.numeroId, dueno, `⏰ Recordatorio — ${nombre}:\n"${fila.texto}"\nÁbrelo en el panel de Chats.`).catch(
        (err: unknown) => log.warn({ err, recordatorioId: fila.id }, 'No se pudo avisar el recordatorio por WhatsApp'),
      );
    }
  }
  log.info({ cantidad: vencidos.length }, 'Recordatorios vencidos avisados');
  return vencidos.length;
}

let intervalo: NodeJS.Timeout | null = null;

export function iniciarRecordatorios(): void {
  intervalo = setInterval(() => {
    avisarVencidos().catch((err: unknown) => log.error({ err }, 'Fallo la revision de recordatorios'));
  }, CADA_MS);
}

export function detenerRecordatorios(): void {
  if (intervalo) clearInterval(intervalo);
}
