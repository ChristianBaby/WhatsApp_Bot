/**
 * Las 7 secciones del panel, en el mismo orden que la maquetacion.
 * Esta lista alimenta el sidebar y el router: agregar una seccion
 * es agregar una entrada aqui, nada mas.
 */
export const SECCIONES = [
  { id: 'conexion', ruta: '/conexion', etiqueta: 'Conexion' },
  { id: 'leads', ruta: '/leads', etiqueta: 'Leads' },
  { id: 'publicaciones', ruta: '/publicaciones', etiqueta: 'Publicaciones' },
  { id: 'reportes', ruta: '/reportes', etiqueta: 'Reportes' },
  { id: 'respuestas', ruta: '/respuestas', etiqueta: 'Respuestas' },
  { id: 'auto', ruta: '/auto-respuestas', etiqueta: 'Auto-respuestas' },
  { id: 'config', ruta: '/configuracion', etiqueta: 'Configuracion' },
] as const;

export type SeccionId = (typeof SECCIONES)[number]['id'];

/** Seccion que se muestra al entrar al panel. */
export const RUTA_INICIAL = '/conexion';
