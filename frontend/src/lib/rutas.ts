/**
 * Las 7 secciones del panel. Esta lista alimenta el sidebar, la barra
 * superior y el router: agregar una seccion es agregar una entrada aqui.
 * `grupo` decide bajo que titulo aparece en el sidebar.
 */
export const SECCIONES = [
  { id: 'respuestas', ruta: '/respuestas', etiqueta: 'Chats', grupo: 'Bandeja' },
  { id: 'leads', ruta: '/leads', etiqueta: 'Leads', grupo: 'Ventas' },
  { id: 'publicaciones', ruta: '/publicaciones', etiqueta: 'Publicaciones', grupo: 'Ventas' },
  { id: 'reportes', ruta: '/reportes', etiqueta: 'Reportes', grupo: 'Ventas' },
  { id: 'auto', ruta: '/auto-respuestas', etiqueta: 'Auto-respuestas', grupo: 'Automatización' },
  { id: 'conexion', ruta: '/conexion', etiqueta: 'Conexión', grupo: 'Ajustes' },
  { id: 'config', ruta: '/configuracion', etiqueta: 'Configuración', grupo: 'Ajustes' },
] as const;

export type SeccionId = (typeof SECCIONES)[number]['id'];
export type Seccion = (typeof SECCIONES)[number];

/** Grupos del sidebar en el orden en que se muestran. */
export const GRUPOS = ['Bandeja', 'Ventas', 'Automatización', 'Ajustes'] as const;

/** Seccion que se muestra al entrar al panel. */
export const RUTA_INICIAL = '/conexion';

/** La seccion que corresponde a una ruta (para el titulo de la barra superior). */
export function seccionDeRuta(ruta: string): Seccion | undefined {
  return SECCIONES.find((s) => ruta === s.ruta || ruta.startsWith(`${s.ruta}/`));
}
