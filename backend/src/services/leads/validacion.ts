import { solicitudInvalida } from '../../lib/errors.js';
import { normalizarTelefono } from '../../lib/telefono.js';
import type { ArchivoParseado } from './parseo.js';
import type { FilaInvalida, FilaValida, ResultadoValidacion } from './tipos.js';

/**
 * Detecta que columna del archivo es cada campo, valida y normaliza cada
 * fila, y arma el resumen que el usuario ve antes de confirmar la carga
 * (seccion 3.2). No toca la base de datos: es pura funcion de
 * entrada/salida, facil de probar y de ajustar.
 */

// Encabezados candidatos por campo, ya normalizados (sin tildes, minusculas).
// El primero que calce con una columna del archivo (de izquierda a derecha) gana.
const CANDIDATOS_TELEFONO = ['telefono', 'phone', 'celular', 'movil', 'whatsapp', 'numero'];
const CANDIDATOS_EMPRESA = ['empresa', 'negocio', 'compania', 'company', 'razon social'];
const CANDIDATOS_RUBRO = ['rubro', 'giro', 'sector', 'categoria', 'industria'];

const TELEFONO_DIGITOS_MIN = 8;
const TELEFONO_DIGITOS_MAX = 15;

function normalizarEncabezado(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes
    .toLowerCase()
    .trim();
}

/**
 * Nombre de columna -> nombre de variable de plantilla. "Contacto" y
 * "Fecha Nacimiento" se vuelven "contacto" y "fecha_nacimiento": asi lo que
 * el usuario escribe en su mensaje ({contacto}) SIEMPRE calza con la clave
 * guardada en datos_extra, sin importar como venia capitalizado el Excel.
 */
function normalizarNombreVariable(texto: string): string {
  return normalizarEncabezado(texto)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function encontrarColumna(encabezados: string[], candidatos: string[]): string | null {
  const normalizados = encabezados.map((h) => ({ original: h, normal: normalizarEncabezado(h) }));
  for (const candidato of candidatos) {
    const coincidencia = normalizados.find((h) => h.normal === candidato || h.normal.includes(candidato));
    if (coincidencia) return coincidencia.original;
  }
  return null;
}

export function validarArchivo(archivo: ArchivoParseado): ResultadoValidacion {
  const { encabezados, filas } = archivo;

  const columnaTelefono = encontrarColumna(encabezados, CANDIDATOS_TELEFONO);
  const columnaEmpresa = encontrarColumna(encabezados, CANDIDATOS_EMPRESA);
  const columnaRubro = encontrarColumna(encabezados, CANDIDATOS_RUBRO);

  if (!columnaTelefono) {
    throw solicitudInvalida(
      'No se encontro una columna de telefono en el archivo. Debe llamarse algo como "telefono", "celular" o "whatsapp".',
    );
  }
  if (!columnaEmpresa) {
    throw solicitudInvalida(
      'No se encontro una columna de empresa en el archivo. Debe llamarse algo como "empresa" o "negocio".',
    );
  }

  const columnasReservadas = new Set([columnaTelefono, columnaEmpresa, columnaRubro].filter(Boolean));
  const columnasLibres = encabezados.filter((h) => !columnasReservadas.has(h));

  // Encabezado original -> nombre de variable ({placeholder}). Si dos
  // columnas distintas normalizan igual (raro, pero posible), la primera gana.
  const variablePorColumnaOriginal = new Map<string, string>();
  const variablesUsadas = new Set<string>();
  const columnasExtra: string[] = [];
  for (const columna of columnasLibres) {
    const variable = normalizarNombreVariable(columna);
    if (!variable || variablesUsadas.has(variable)) continue;
    variablesUsadas.add(variable);
    variablePorColumnaOriginal.set(columna, variable);
    columnasExtra.push(variable);
  }

  const filasValidas: FilaValida[] = [];
  const filasInvalidas: FilaInvalida[] = [];
  const telefonosVistos = new Set<string>();
  let duplicadas = 0;

  for (const fila of filas) {
    const telefonoCrudo = fila.valores[columnaTelefono] ?? '';
    const empresaCruda = (fila.valores[columnaEmpresa] ?? '').trim();

    if (!telefonoCrudo.trim()) {
      filasInvalidas.push({ filaNumero: fila.filaNumero, motivo: 'sin_telefono', datoReferencia: empresaCruda || '—' });
      continue;
    }

    const telefono = normalizarTelefono(telefonoCrudo);
    if (telefono.length < TELEFONO_DIGITOS_MIN || telefono.length > TELEFONO_DIGITOS_MAX) {
      filasInvalidas.push({ filaNumero: fila.filaNumero, motivo: 'telefono_invalido', datoReferencia: telefonoCrudo });
      continue;
    }

    if (!empresaCruda) {
      filasInvalidas.push({ filaNumero: fila.filaNumero, motivo: 'sin_empresa', datoReferencia: telefonoCrudo });
      continue;
    }

    if (telefonosVistos.has(telefono)) {
      duplicadas += 1;
      filasInvalidas.push({ filaNumero: fila.filaNumero, motivo: 'duplicado', datoReferencia: 'ya existe en la lista' });
      continue;
    }
    telefonosVistos.add(telefono);

    const datosExtra: Record<string, string> = {};
    for (const [columnaOriginal, variable] of variablePorColumnaOriginal) {
      const valor = fila.valores[columnaOriginal];
      if (valor) datosExtra[variable] = valor;
    }

    filasValidas.push({
      filaNumero: fila.filaNumero,
      telefono,
      empresa: empresaCruda,
      rubro: columnaRubro ? (fila.valores[columnaRubro]?.trim() || null) : null,
      datosExtra,
    });
  }

  return {
    resumen: {
      totalFilas: filas.length,
      validas: filasValidas.length,
      invalidas: filasInvalidas.length,
      duplicadas,
    },
    columnasExtra,
    filasValidas,
    filasInvalidas,
  };
}
