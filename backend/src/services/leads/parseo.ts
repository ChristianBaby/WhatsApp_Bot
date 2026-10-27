import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { solicitudInvalida } from '../../lib/errors.js';
import { esHojaDeLeads } from './columnas.js';

/**
 * Lee un CSV o XLSX y lo deja como filas crudas (encabezado -> texto),
 * sin ninguna validacion todavia. El numero de fila coincide con el que
 * el usuario ve en su planilla (fila 1 = encabezados, fila 2 = primer dato).
 */

/** enlaces: el link de las celdas que lo tienen ("Ver en Maps" -> la URL), por encabezado. */
export type FilaCruda = { filaNumero: number; valores: Record<string, string>; enlaces: Record<string, string> };

export type ArchivoParseado = {
  encabezados: string[];
  filas: FilaCruda[];
};

function limpiarCelda(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'object') {
    // exceljs puede devolver formulas ({result}), fechas (Date) o hipervinculos ({text}).
    if (valor instanceof Date) return valor.toISOString();
    if ('text' in valor) return String((valor as { text: unknown }).text ?? '');
    if ('result' in valor) return String((valor as { result: unknown }).result ?? '');
    return '';
  }
  return String(valor).trim();
}

function parsearCsv(buffer: Buffer): ArchivoParseado {
  const registros: string[][] = parseCsv(buffer, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });

  if (registros.length === 0) {
    throw solicitudInvalida('El archivo esta vacio');
  }

  const encabezados = registros[0]!.map((h) => h.trim());
  const filas: FilaCruda[] = registros.slice(1).map((fila, indice) => {
    const valores: Record<string, string> = {};
    encabezados.forEach((encabezado, i) => {
      valores[encabezado] = (fila[i] ?? '').trim();
    });
    return { filaNumero: indice + 2, valores, enlaces: {} };
  });

  return { encabezados, filas };
}

/** El hipervinculo de una celda de Excel, si lo tiene. */
function enlaceDeCelda(valor: unknown): string {
  if (valor && typeof valor === 'object' && 'hyperlink' in valor) return String((valor as { hyperlink: unknown }).hyperlink ?? '').trim();
  return '';
}

function encabezadosDeHoja(hoja: ExcelJS.Worksheet): string[] {
  const encabezados: string[] = [];
  hoja.getRow(1).eachCell({ includeEmpty: false }, (celda, columna) => {
    encabezados[columna - 1] = limpiarCelda(celda.value);
  });
  return encabezados;
}

/**
 * Un Excel exportado de un buscador de leads (Google Maps, etc.) suele
 * traer varias hojas: un "Resumen" sin tabla, la lista completa, un
 * filtro... Se elige la hoja mas grande que de verdad tenga columnas de
 * telefono y empresa, en vez de asumir siempre que es la primera.
 */
function elegirMejorHoja(libro: ExcelJS.Workbook): ExcelJS.Worksheet {
  let mejor: { hoja: ExcelJS.Worksheet; filas: number } | null = null;

  for (const hoja of libro.worksheets) {
    if (esHojaDeLeads(encabezadosDeHoja(hoja)) && (!mejor || hoja.rowCount > mejor.filas)) {
      mejor = { hoja, filas: hoja.rowCount };
    }
  }

  // Si ninguna hoja califica, se cae a la primera — el error de "falta la
  // columna de telefono" que tira validarArchivo sigue siendo claro.
  return mejor?.hoja ?? libro.worksheets[0]!;
}

async function parsearXlsx(buffer: Buffer): Promise<ArchivoParseado> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  if (libro.worksheets.length === 0) throw solicitudInvalida('El archivo no tiene ninguna hoja');
  const hoja = elegirMejorHoja(libro);

  const encabezados = encabezadosDeHoja(hoja);

  if (encabezados.length === 0) {
    throw solicitudInvalida('El archivo esta vacio');
  }

  const filas: FilaCruda[] = [];
  hoja.eachRow({ includeEmpty: false }, (fila, numeroFila) => {
    if (numeroFila === 1) return; // encabezados

    const valores: Record<string, string> = {};
    const enlaces: Record<string, string> = {};
    let tieneAlgunDato = false;
    encabezados.forEach((encabezado, i) => {
      if (!encabezado) return;
      const celda = fila.getCell(i + 1).value;
      const texto = limpiarCelda(celda);
      if (texto) tieneAlgunDato = true;
      valores[encabezado] = texto;
      const enlace = enlaceDeCelda(celda);
      if (enlace) enlaces[encabezado] = enlace;
    });

    if (tieneAlgunDato) filas.push({ filaNumero: numeroFila, valores, enlaces });
  });

  return { encabezados, filas };
}

export async function parsearArchivo(buffer: Buffer, nombreArchivo: string): Promise<ArchivoParseado> {
  const extension = nombreArchivo.toLowerCase().split('.').pop();

  if (extension === 'csv') return parsearCsv(buffer);
  if (extension === 'xlsx') return parsearXlsx(buffer);

  throw solicitudInvalida('Formato no soportado. Sube un archivo .csv o .xlsx');
}
