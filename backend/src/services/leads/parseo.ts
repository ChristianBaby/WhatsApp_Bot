import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { solicitudInvalida } from '../../lib/errors.js';

/**
 * Lee un CSV o XLSX y lo deja como filas crudas (encabezado -> texto),
 * sin ninguna validacion todavia. El numero de fila coincide con el que
 * el usuario ve en su planilla (fila 1 = encabezados, fila 2 = primer dato).
 */

export type FilaCruda = { filaNumero: number; valores: Record<string, string> };

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
    return { filaNumero: indice + 2, valores };
  });

  return { encabezados, filas };
}

async function parsearXlsx(buffer: Buffer): Promise<ArchivoParseado> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const hoja = libro.worksheets[0];
  if (!hoja) throw solicitudInvalida('El archivo no tiene ninguna hoja');

  const filaEncabezados = hoja.getRow(1);
  const encabezados: string[] = [];
  filaEncabezados.eachCell({ includeEmpty: false }, (celda, columna) => {
    encabezados[columna - 1] = limpiarCelda(celda.value);
  });

  if (encabezados.length === 0) {
    throw solicitudInvalida('El archivo esta vacio');
  }

  const filas: FilaCruda[] = [];
  hoja.eachRow({ includeEmpty: false }, (fila, numeroFila) => {
    if (numeroFila === 1) return; // encabezados

    const valores: Record<string, string> = {};
    let tieneAlgunDato = false;
    encabezados.forEach((encabezado, i) => {
      const texto = limpiarCelda(fila.getCell(i + 1).value);
      if (texto) tieneAlgunDato = true;
      valores[encabezado] = texto;
    });

    if (tieneAlgunDato) filas.push({ filaNumero: numeroFila, valores });
  });

  return { encabezados, filas };
}

export async function parsearArchivo(buffer: Buffer, nombreArchivo: string): Promise<ArchivoParseado> {
  const extension = nombreArchivo.toLowerCase().split('.').pop();

  if (extension === 'csv') return parsearCsv(buffer);
  if (extension === 'xlsx') return parsearXlsx(buffer);

  throw solicitudInvalida('Formato no soportado. Sube un archivo .csv o .xlsx');
}
