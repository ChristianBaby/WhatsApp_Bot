/** Elige una variante al azar (seccion 3.3: evita mandar el mismo string exacto a todos). */
export function elegirVariante(variantes: string[]): string {
  const indice = Math.floor(Math.random() * variantes.length);
  return variantes[indice] ?? variantes[0] ?? '';
}

/**
 * Reemplaza {variable} por su valor. Una variable sin dato disponible se
 * deja tal cual (mejor que el usuario note el {placeholder} sin llenar que
 * mandar un mensaje con un hueco en blanco silencioso).
 */
export function sustituirPlaceholders(texto: string, datos: Record<string, string>): string {
  return texto.replace(/\{(\w+)\}/g, (coincidencia, clave: string) => datos[clave] ?? coincidencia);
}

/** Arma el diccionario de variables disponibles para un lead: {empresa} + sus columnas libres. */
export function datosPlaceholderDeLead(lead: { empresa: string; datosExtra: Record<string, string> }): Record<string, string> {
  return { empresa: lead.empresa, ...lead.datosExtra };
}

/** Datos de muestra para dry-run/prueba cuando no hay un lead real de referencia. */
export const DATOS_PLACEHOLDER_MUESTRA: Record<string, string> = {
  empresa: 'Empresa de Prueba',
  contacto: 'Contacto de Prueba',
};
