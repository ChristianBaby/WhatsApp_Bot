import type { ConversacionResumen, MensajeConversacion } from '../../lib/types';

type DatosNombre = Pick<ConversacionResumen, 'nombreAgenda' | 'empresa' | 'nombreContacto' | 'telefono'> & {
  esGrupo?: boolean;
  ficha?: { nombre: string | null };
};

/** Como se muestra un chat: el nombre de la ficha, el de la agenda del telefono, la empresa del lead, su nombre de WhatsApp o el numero. */
export function nombreDeChat(c: DatosNombre): string {
  if (c.esGrupo) return c.nombreAgenda ?? 'Grupo';
  return c.ficha?.nombre ?? c.nombreAgenda ?? c.empresa ?? c.nombreContacto ?? `+${c.telefono}`;
}

/** Iniciales para el avatar ("Hotel Sol" → "HS"; un numero → "#"). */
export function inicialesDeChat(nombre: string): string {
  if (nombre.startsWith('+')) return '#';
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  return ((palabras[0]?.[0] ?? '') + (palabras[1]?.[0] ?? '')).toUpperCase() || '#';
}

/** Quien escribio un mensaje: "Tú", "Bot", el contacto, o en un grupo el integrante. */
export function nombreDeAutor(m: Pick<MensajeConversacion, 'autor' | 'extra'>, nombreContacto: string, esGrupo: boolean): string {
  if (m.autor === 'yo') return 'Tú';
  if (m.autor === 'bot') return 'Bot';
  if (!esGrupo) return nombreContacto;
  const p = m.extra?.participante;
  return p?.nombre ?? (p?.telefono ? `+${p.telefono}` : 'Participante');
}

// Como en WhatsApp: cada integrante del grupo con su color.
const COLORES_PARTICIPANTE = ['#e5484d', '#d6409f', '#8e4ec6', '#3e63dd', '#0090ff', '#12a594', '#30a46c', '#f76b15', '#a18072'];

export function colorDeParticipante(jid: string): string {
  let hash = 0;
  for (const letra of jid) hash = (hash * 31 + letra.charCodeAt(0)) | 0;
  return COLORES_PARTICIPANTE[Math.abs(hash) % COLORES_PARTICIPANTE.length]!;
}
