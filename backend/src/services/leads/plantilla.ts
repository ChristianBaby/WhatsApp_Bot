import ExcelJS from 'exceljs';

/**
 * Plantilla .xlsx para armar una lista a mano (sin Apify). Tiene los mismos
 * datos que el sistema saca de un export de Apify, asi una lista hecha a
 * mano se ve igual en el dashboard. Solo telefono y empresa son obligatorios.
 */

const COLUMNAS: { encabezado: string; ancho: number; obligatoria: boolean; ayuda: string }[] = [
  { encabezado: 'telefono', ancho: 16, obligatoria: true, ayuda: 'Celular con o sin 51: 987654321, +51 987 654 321. Los fijos se descartan (no tienen WhatsApp).' },
  { encabezado: 'empresa', ancho: 32, obligatoria: true, ayuda: 'Nombre del negocio. Se usa como {empresa} en el mensaje.' },
  { encabezado: 'rubro', ancho: 18, obligatoria: false, ayuda: 'Hotel, Restaurante, Agencia de viajes... Si lo dejas vacío, lo eliges al subir (uno para toda la lista).' },
  { encabezado: 'categoria', ancho: 24, obligatoria: false, ayuda: 'Categoría de Google Maps: Pizzería, Marisquería, Travel agency...' },
  { encabezado: 'zona', ancho: 20, obligatoria: false, ayuda: 'Barrio o zona: Centro Histórico, Wánchaq... Se usa como {zona} en el mensaje.' },
  { encabezado: 'web', ancho: 32, obligatoria: false, ayuda: 'Sitio web o red social. Si es Facebook/Instagram cuenta como "solo redes".' },
  { encabezado: 'calificacion', ancho: 13, obligatoria: false, ayuda: 'Nota de Google, de 1 a 5 (ej. 4.6).' },
  { encabezado: 'resenas', ancho: 10, obligatoria: false, ayuda: 'Cantidad de reseñas en Google (ej. 312).' },
  { encabezado: 'ficha_reclamada', ancho: 16, obligatoria: false, ayuda: '"si" o "no": si el dueño reclamó su ficha de Google Maps.' },
  { encabezado: 'maps', ancho: 32, obligatoria: false, ayuda: 'Enlace del negocio en Google Maps.' },
];

const EJEMPLOS = [
  ['987654321', 'Hotel Inti', 'Hotel', 'Hotel', 'San Blas', '', '4.6', '312', 'no', 'https://maps.google.com/?cid=123'],
  ['+51 944 123 456', 'Pizzería Don Luca', 'Restaurante', 'Pizzería', 'Centro Histórico', 'https://www.instagram.com/donluca', '4.4', '58', 'si', ''],
];

export async function generarPlantilla(): Promise<ExcelJS.Workbook> {
  const libro = new ExcelJS.Workbook();

  const hoja = libro.addWorksheet('Leads');
  hoja.columns = COLUMNAS.map((c) => ({ header: c.encabezado, key: c.encabezado, width: c.ancho }));
  const encabezado = hoja.getRow(1);
  encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  COLUMNAS.forEach((c, i) => {
    encabezado.getCell(i + 1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: c.obligatoria ? 'FF1F5FD1' : 'FF0A1F44' },
    };
    encabezado.getCell(i + 1).note = c.ayuda;
  });
  for (const fila of EJEMPLOS) hoja.addRow(fila);
  // El telefono como texto: si Excel lo toma como numero, borra el "+" y los espacios no importan, pero los ceros si.
  hoja.getColumn(1).numFmt = '@';
  hoja.views = [{ state: 'frozen', ySplit: 1 }];

  const ayuda = libro.addWorksheet('Instrucciones');
  ayuda.columns = [
    { header: 'Columna', key: 'columna', width: 18 },
    { header: 'Obligatoria', key: 'obligatoria', width: 12 },
    { header: 'Qué poner', key: 'ayuda', width: 90 },
  ];
  ayuda.getRow(1).font = { bold: true };
  for (const c of COLUMNAS) ayuda.addRow({ columna: c.encabezado, obligatoria: c.obligatoria ? 'Sí' : 'No', ayuda: c.ayuda });
  ayuda.addRow({});
  ayuda.addRow({ columna: 'Notas', ayuda: 'Borra las filas de ejemplo antes de subir. Puedes agregar más columnas: se guardan y se usan como {nombre_de_columna} en el mensaje y como contexto para la IA.' });
  ayuda.addRow({ ayuda: 'La prioridad y si tiene web las calcula el sistema; el estado de contacto lo lleva el sistema con las campañas y los chats.' });
  ayuda.addRow({ ayuda: 'El export de Apify (Google Maps Scraper) se puede subir tal cual, sin pasarlo a esta plantilla.' });

  return libro;
}
