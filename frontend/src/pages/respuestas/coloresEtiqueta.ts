/**
 * Los 20 colores de etiqueta de WhatsApp Business, en el mismo orden (el
 * telefono guarda solo el numero). Se usan igual en modo claro y oscuro:
 * el texto de la etiqueta va sobre un fondo suave del mismo color.
 */
export const COLORES_ETIQUETA = [
  '#ff9485',
  '#64c4ff',
  '#ffd429',
  '#dfaef0',
  '#99b6c1',
  '#55ccb3',
  '#ff9dff',
  '#d3a91d',
  '#6d7cce',
  '#d7e752',
  '#00d0e2',
  '#ffc5c7',
  '#93ceac',
  '#f74848',
  '#00a0f2',
  '#83e422',
  '#ffaf04',
  '#b5ebff',
  '#9ba6ff',
  '#9368cf',
];

export function colorEtiqueta(indice: number): string {
  return COLORES_ETIQUETA[((indice % COLORES_ETIQUETA.length) + COLORES_ETIQUETA.length) % COLORES_ETIQUETA.length]!;
}
