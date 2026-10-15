import type { ConversacionResumen } from '../../lib/types';

/** Como se muestra un chat: el nombre de la agenda del telefono, la empresa del lead, su nombre de WhatsApp o el numero. */
export function nombreDeChat(c: Pick<ConversacionResumen, 'nombreAgenda' | 'empresa' | 'nombreContacto' | 'telefono'>): string {
  return c.nombreAgenda ?? c.empresa ?? c.nombreContacto ?? `+${c.telefono}`;
}

/** Iniciales para el avatar ("Hotel Sol" → "HS"; un numero → "#"). */
export function inicialesDeChat(nombre: string): string {
  if (nombre.startsWith('+')) return '#';
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  return ((palabras[0]?.[0] ?? '') + (palabras[1]?.[0] ?? '')).toUpperCase() || '#';
}
