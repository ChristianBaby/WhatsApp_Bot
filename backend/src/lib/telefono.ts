import { env } from '../config/env.js';

/** Deja solo digitos (sin "+"): el formato que usa todo el sistema para JIDs de WhatsApp. */
export function normalizarTelefono(crudo: string): string {
  return crudo.replace(/\D/g, '');
}

/**
 * Telefono escrito por una persona (Excel, panel) -> formato WhatsApp con
 * codigo de pais, o null si no puede ser un WhatsApp. Lo que llega desde
 * WhatsApp mismo (JIDs) ya trae el codigo: para eso basta normalizarTelefono.
 *
 * Peru (51): celulares de 9 digitos que empiezan con 9. Un numero local de
 * 9 digitos se completa con 51; los fijos (con o sin 51) no tienen WhatsApp
 * y se rechazan — antes pasaban y terminaban como "sin WhatsApp".
 */
export function normalizarParaWhatsapp(crudo: string, codigoPais = env.CODIGO_PAIS): string | null {
  let digitos = normalizarTelefono(crudo);
  if (digitos.startsWith('00')) digitos = digitos.slice(2); // prefijo internacional 00

  if (codigoPais === '51') {
    if (/^9\d{8}$/.test(digitos)) return `51${digitos}`;
    if (/^519\d{8}$/.test(digitos)) return digitos;
    if (digitos.startsWith('51') || digitos.startsWith('0') || digitos.length <= 9) return null; // fijo o incompleto
    return digitos.length <= 15 ? digitos : null; // otro pais, ya con su codigo
  }

  // Otros paises: sin reglas propias, solo completar el codigo si falta.
  if (digitos.length < 8 || digitos.length > 15) return null;
  return digitos.startsWith(codigoPais) ? digitos : `${codigoPais}${digitos}`;
}
