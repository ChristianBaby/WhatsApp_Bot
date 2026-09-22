/**
 * Deteccion de columnas por nombre de encabezado. Lo usan tanto
 * validacion.ts (para saber cual es telefono/empresa/rubro dentro de la
 * hoja ya elegida) como parseo.ts (para elegir, de entre varias hojas de
 * un mismo Excel, cual es la que realmente tiene la tabla de leads).
 */

// Encabezados candidatos por campo, ya normalizados (sin tildes, minusculas).
// El primero que calce con una columna del archivo (de izquierda a derecha) gana.
export const CANDIDATOS_TELEFONO = ['telefono', 'phone', 'celular', 'movil', 'whatsapp', 'numero'];
export const CANDIDATOS_EMPRESA = [
  'nombre del negocio',
  'empresa',
  'negocio',
  'compania',
  'company',
  'razon social',
];
export const CANDIDATOS_RUBRO = ['rubro', 'giro', 'sector', 'categoria', 'industria'];

export function normalizarEncabezado(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes
    .toLowerCase()
    .trim();
}

export function encontrarColumna(encabezados: string[], candidatos: string[]): string | null {
  const normalizados = encabezados.map((h) => ({ original: h, normal: normalizarEncabezado(h) }));
  for (const candidato of candidatos) {
    const coincidencia = normalizados.find((h) => h.normal === candidato || h.normal.includes(candidato));
    if (coincidencia) return coincidencia.original;
  }
  return null;
}
