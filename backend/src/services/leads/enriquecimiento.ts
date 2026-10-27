/**
 * Datos que el sistema calcula para cada lead a partir de lo que trae el
 * archivo: si tiene web propia y que prioridad tiene para contactarlo.
 * Se guardan en datos_extra junto al resto (tiene_web, prioridad) para que
 * sirvan de variable en los mensajes, de contexto a la IA y de filtro.
 */

export type TieneWeb = 'si' | 'solo_redes' | 'no';
export type Prioridad = 'alta' | 'media' | 'baja';

// Un perfil de red social o un enlace de WhatsApp no es una web propia.
const REDES = /(facebook\.com|fb\.com|fb\.me|instagram\.com|tiktok\.com|linktr\.ee|beacons\.ai|wa\.me|whatsapp\.com|twitter\.com|x\.com|youtube\.com)/i;

export function tipoDeWeb(web: string | null | undefined): TieneWeb {
  const valor = (web ?? '').trim();
  if (!valor) return 'no';
  return REDES.test(valor) ? 'solo_redes' : 'si';
}

/** Numero de una celda ("4,6", "4.6", "1 231") o null si no hay. */
export function numeroDe(texto: string | null | undefined): number | null {
  const limpio = (texto ?? '').replace(/\s/g, '').replace(',', '.');
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

// Un buen negocio que no tiene web propia: el cliente mas claro para venderle una.
const CALIFICACION_ALTA = 4.3;
const RESENAS_ALTA = 30;

/**
 * Alta: sin web propia (o solo redes) y con buena reputacion (4.3+ y 30+
 * resenas), o sin ninguna web y con la ficha de Google sin reclamar.
 * Media: el resto de los que no tienen web propia. Baja: ya tiene web.
 */
export function calcularPrioridad(datos: {
  tieneWeb: TieneWeb;
  calificacion: number | null;
  resenas: number | null;
  fichaReclamada: boolean | null;
}): Prioridad {
  if (datos.tieneWeb === 'si') return 'baja';
  const buenaReputacion = (datos.calificacion ?? 0) >= CALIFICACION_ALTA && (datos.resenas ?? 0) >= RESENAS_ALTA;
  if (buenaReputacion) return 'alta';
  if (datos.tieneWeb === 'no' && datos.fichaReclamada === false) return 'alta';
  return 'media';
}

/** "si"/"no" de una celda que dice si la ficha esta reclamada (true/false, sí/no). */
export function siNoDe(texto: string | null | undefined): boolean | null {
  const valor = (texto ?? '').trim().toLowerCase();
  if (['true', 'si', 'sí', 'yes', '1'].includes(valor)) return true;
  if (['false', 'no', '0'].includes(valor)) return false;
  return null;
}
