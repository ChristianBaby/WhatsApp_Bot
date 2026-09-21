/** Deja solo digitos (sin "+"): el formato que usa todo el sistema para JIDs de WhatsApp. */
export function normalizarTelefono(crudo: string): string {
  return crudo.replace(/\D/g, '');
}
