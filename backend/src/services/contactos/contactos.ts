import { consultarUno } from '../../db/pool.js';
import { normalizarParaWhatsapp } from '../../lib/telefono.js';
import * as configRepo from '../configuracion/repositorio.js';

/**
 * Reglas transversales sobre CON QUIEN se puede hablar: el telefono del
 * dueño (que recibe avisos y nunca debe tratarse como lead) y la lista de
 * "no contactar" (bajas). Las consultan las campanas y el auto-responder.
 */

/** Telefono del dueño en formato WhatsApp, o null si no esta configurado o no es valido. */
export async function telefonoDueno(): Promise<string | null> {
  const crudo = await configRepo.obtenerValor<string>('telefono_propietario');
  return crudo ? normalizarParaWhatsapp(crudo) : null;
}

export async function estaBloqueado(telefono: string): Promise<boolean> {
  return Boolean(await consultarUno('SELECT 1 FROM contactos_bloqueados WHERE telefono = $1', [telefono]));
}

/** true si se bloqueo ahora; false si ya estaba bloqueado (para no confirmar dos veces). */
export async function bloquear(telefono: string, motivo: 'pidio_baja' | 'manual', textoOrigen: string | null): Promise<boolean> {
  const fila = await consultarUno(
    `INSERT INTO contactos_bloqueados (telefono, motivo, texto_origen) VALUES ($1, $2, $3)
     ON CONFLICT (telefono) DO NOTHING RETURNING telefono`,
    [telefono, motivo, textoOrigen],
  );
  return Boolean(fila);
}

/** Saca de las campanas pendientes a un telefono recien bloqueado. Devuelve cuantos destinatarios excluyo. */
export async function excluirDeCampanasPendientes(telefono: string, motivo: string): Promise<number> {
  const fila = await consultarUno<{ total: number }>(
    `WITH excluidos AS (
       UPDATE publicacion_destinatarios pd SET estado = 'excluido', motivo_fallo = $2
       FROM leads l
       WHERE l.id = pd.lead_id AND l.telefono = $1 AND pd.estado = 'pendiente'
       RETURNING pd.id
     )
     SELECT COUNT(*)::int AS total FROM excluidos`,
    [telefono, motivo],
  );
  return fila?.total ?? 0;
}

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tildes
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Frases de "no me escriban mas". Se buscan frases completas en imperativo,
// no raices sueltas: "no me mandaron el catalogo" o "¿bajan el precio?" NO
// son bajas, y bloquear a un interesado es peor que no detectar una baja.
const IMPERATIVO = '(escriban|escribas|envien|envies|manden|mandes|contacten|contactes|llamen|llames)';
const FRASES_BAJA = [
  new RegExp(`\\bno (me|nos) ${IMPERATIVO} (mas|nunca)\\b`),
  new RegExp(`\\bno (me|nos) ${IMPERATIVO}( (por favor|porfa|porfavor|gracias))*$`), // al final del mensaje
  /\bno (me|nos) (vuelvan|vuelvas|sigan|sigas) (a )?(escribir|enviar|mandar|contactar|llamar|escribiendo|enviando|mandando|molestando)\b/,
  /\bno (me|nos) (molesten|molestes)\b/,
  /\b(deja|dejen|dejes) de (escribir|enviar|mandar|molestar|contactar)(me|nos)?\b/,
  /\b(dar|darme|darnos|denme|den|dame|deme) de baja\b/,
  /\bno (quiero|queremos) (recibir )?(mas )?(sus |tus )?(mensajes|publicidad|promociones)\b/,
  /\b(eliminen|elimina|borren|borra|saquen|saca|quiten|quita) (mi|nuestro) (numero|contacto)\b/,
];

// Mensaje que es SOLO la palabra (ej. "STOP"): ahi si es inequivoco.
const PALABRAS_BAJA_SOLAS = new Set(['baja', 'stop', 'alto', 'unsubscribe', 'desuscribir', 'desuscribirme']);

// Pide otro canal ("no me escribas, llamame"): no es una baja, lo atiende una persona.
const PIDE_OTRO_CANAL = /\b(llamame|llamenme|llamarme|al correo|por correo|por email|mejor por|escribeme al|escribanme al)\b/;

/**
 * ¿El lead esta pidiendo no recibir mas mensajes? Deteccion deliberadamente
 * conservadora: ante la duda devuelve false (la IA y el asesor siguen ahi).
 */
export function esPedidoDeBaja(texto: string): boolean {
  const t = normalizarTexto(texto);
  if (!t) return false;
  if (PALABRAS_BAJA_SOLAS.has(t)) return true;
  if (PIDE_OTRO_CANAL.test(t)) return false;
  return FRASES_BAJA.some((frase) => frase.test(t));
}
