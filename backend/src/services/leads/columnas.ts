/**
 * Deteccion de columnas por nombre de encabezado. Lo usan tanto
 * validacion.ts (para saber que columna es cada dato dentro de la hoja ya
 * elegida) como parseo.ts (para elegir, de entre varias hojas de un mismo
 * Excel, cual es la que realmente tiene la tabla de leads).
 *
 * Se aceptan dos formas de archivo:
 *  - El export de Apify "Google Maps Scraper", tal cual se descarga (con
 *    cientos de columnas): se toman solo las que sirven (COLUMNAS_APIFY).
 *  - Cualquier otra planilla (la plantilla del panel o una hecha a mano):
 *    las columnas se reconocen por nombre (CANDIDATOS_* y DATOS_CONOCIDOS)
 *    y las que no se reconocen se guardan igual, como variables libres.
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
  'nombre del restaurante',
  'nombre del hotel',
  'nombre comercial',
  'nombre',
];
// La categoria de Google ("Pizzeria", "Travel agency") NO es el rubro: el
// rubro de una lista se elige al subirla si el archivo no lo trae.
export const CANDIDATOS_RUBRO = ['rubro', 'giro', 'sector', 'industria'];

/**
 * Datos que el sistema entiende (dashboard, filtros, prioridad), con los
 * nombres con que pueden venir en una planilla. Clave = nombre interno, que
 * es tambien la variable del mensaje ({zona}, {calificacion}...).
 */
export const DATOS_CONOCIDOS: Record<string, string[]> = {
  categoria: ['categoria'],
  zona: ['zona', 'barrio', 'distrito', 'neighborhood'],
  ciudad: ['ciudad', 'city'],
  web: ['sitio web', 'pagina web', 'website', 'web'],
  calificacion: ['calificacion', 'rating', 'puntuacion', 'totalscore'],
  resenas: ['resenas', 'reviews', 'opiniones'],
  ficha_reclamada: ['ficha reclamada', 'ficha_reclamada'],
  maps: ['google maps', 'maps', 'mapa'],
};

// Columnas de una planilla que no se guardan: el sistema las lleva solo
// (el estado de contacto es la etapa del pipeline; tiene_web y la prioridad
// se recalculan siempre; la direccion no aporta para contactar).
export const COLUMNAS_IGNORADAS = ['estado de contacto', 'estado', 'prioridad', 'tiene web', 'tiene_web', 'direccion'];

/** Export de Apify Google Maps Scraper: columna de Apify -> dato interno. */
export const COLUMNAS_APIFY = {
  empresa: 'title',
  telefono: ['phoneUnformatted', 'phone'],
  categoria: 'categoryName',
  zona: 'neighborhood',
  web: 'website',
  calificacion: 'totalScore',
  resenas: 'reviewsCount',
  // true = el dueno NO reclamo su ficha de Google.
  fichaSinReclamar: 'claimThisBusiness',
  maps: 'url',
  cerradoTemporal: 'temporarilyClosed',
  cerradoPermanente: 'permanentlyClosed',
} as const;

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

/** El archivo es un export de Apify Google Maps Scraper (sus encabezados exactos). */
export function esExportApify(encabezados: string[]): boolean {
  const presentes = new Set(encabezados);
  return presentes.has('title') && (presentes.has('phone') || presentes.has('phoneUnformatted')) && presentes.has('categoryName');
}

/** La hoja tiene una tabla de leads (de Apify o una planilla con telefono y empresa). */
export function esHojaDeLeads(encabezados: string[]): boolean {
  if (esExportApify(encabezados)) return true;
  return Boolean(encontrarColumna(encabezados, CANDIDATOS_TELEFONO) && encontrarColumna(encabezados, CANDIDATOS_EMPRESA));
}
