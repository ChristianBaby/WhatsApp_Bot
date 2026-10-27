import { solicitudInvalida } from '../../lib/errors.js';
import { normalizarParaWhatsapp } from '../../lib/telefono.js';
import {
  CANDIDATOS_EMPRESA,
  CANDIDATOS_RUBRO,
  CANDIDATOS_TELEFONO,
  COLUMNAS_APIFY,
  COLUMNAS_IGNORADAS,
  DATOS_CONOCIDOS,
  encontrarColumna,
  esExportApify,
  normalizarEncabezado,
} from './columnas.js';
import { calcularPrioridad, numeroDe, siNoDe, tipoDeWeb } from './enriquecimiento.js';
import type { ArchivoParseado, FilaCruda } from './parseo.js';
import type { FilaInvalida, FilaValida, ResultadoValidacion } from './tipos.js';

/**
 * Valida y normaliza cada fila, y arma el resumen que el usuario ve antes
 * de confirmar la carga (seccion 3.2). No toca la base de datos: es pura
 * funcion de entrada/salida, facil de probar y de ajustar. La deteccion de
 * columnas (que encabezado es cada dato) vive en columnas.ts.
 *
 * Primero cada fila se lleva a una forma comun (FilaLeida), venga de un
 * export de Apify o de cualquier planilla; despues se aplican las mismas
 * reglas a todas: telefono de WhatsApp, empresa, cerrados, duplicados, y se
 * calculan tiene_web y prioridad.
 */

/** Orden en que se guardan (y se muestran) los datos que el sistema entiende. */
const ORDEN_CONOCIDOS = ['categoria', 'zona', 'ciudad', 'web', 'tiene_web', 'calificacion', 'resenas', 'ficha_reclamada', 'maps', 'prioridad'];

type FilaLeida = {
  filaNumero: number;
  telefono: string;
  empresa: string;
  rubro: string | null;
  cerrado: boolean;
  /** categoria, zona, ciudad, web, calificacion, resenas, ficha_reclamada ('si'/'no'), maps. */
  conocidos: Record<string, string>;
  /** Columnas que el sistema no conoce: se guardan igual, como variables libres. */
  libres: Record<string, string>;
};

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

// ==================== Export de Apify ====================

function leerApify(filas: FilaCruda[]): FilaLeida[] {
  const a = COLUMNAS_APIFY;
  return filas.map((fila) => {
    const v = (columna: string) => (fila.valores[columna] ?? '').trim();
    const sinReclamar = siNoDe(v(a.fichaSinReclamar));
    return {
      filaNumero: fila.filaNumero,
      telefono: a.telefono.map(v).find(Boolean) ?? '',
      empresa: v(a.empresa),
      rubro: null,
      cerrado: siNoDe(v(a.cerradoTemporal)) === true || siNoDe(v(a.cerradoPermanente)) === true,
      conocidos: {
        categoria: v(a.categoria),
        zona: v(a.zona),
        web: v(a.web),
        calificacion: v(a.calificacion),
        // Apify deja la celda vacia cuando el negocio no tiene ninguna resena.
        resenas: v(a.resenas) || '0',
        ficha_reclamada: sinReclamar === null ? '' : sinReclamar ? 'no' : 'si',
        maps: v(a.maps),
      },
      libres: {},
    };
  });
}

// ==================== Cualquier otra planilla ====================

function leerPlanilla(encabezados: string[], filas: FilaCruda[]): FilaLeida[] {
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

  const usadas = new Set<string>([columnaTelefono, columnaEmpresa, columnaRubro].filter((c): c is string => Boolean(c)));
  const ignoradas = new Set(COLUMNAS_IGNORADAS);

  // Dato que el sistema entiende -> columna del archivo (la primera que calce).
  const columnaDe = new Map<string, string>();
  for (const [dato, candidatos] of Object.entries(DATOS_CONOCIDOS)) {
    const libres = encabezados.filter((h) => h && !usadas.has(h));
    const columna = encontrarColumna(libres, candidatos);
    if (columna) {
      columnaDe.set(dato, columna);
      usadas.add(columna);
    }
  }

  // El resto (ni conocidas ni ignoradas) queda como variable libre.
  const variablePorColumna = new Map<string, string>();
  const variablesUsadas = new Set<string>([...ORDEN_CONOCIDOS]);
  for (const columna of encabezados) {
    if (!columna || usadas.has(columna) || ignoradas.has(normalizarEncabezado(columna))) continue;
    const variable = normalizarNombreVariable(columna);
    if (!variable || variablesUsadas.has(variable)) continue;
    variablesUsadas.add(variable);
    variablePorColumna.set(columna, variable);
  }

  return filas.map((fila) => {
    // En las celdas con hipervinculo ("Ver en Maps") lo que sirve es el link.
    const valor = (columna: string) => (fila.enlaces[columna] || fila.valores[columna] || '').trim();
    const conocidos: Record<string, string> = {};
    for (const [dato, columna] of columnaDe) {
      let texto = valor(columna);
      if (dato === 'ficha_reclamada') {
        const reclamada = siNoDe(texto);
        texto = reclamada === null ? '' : reclamada ? 'si' : 'no';
      }
      conocidos[dato] = texto;
    }
    const libres: Record<string, string> = {};
    for (const [columna, variable] of variablePorColumna) {
      const texto = (fila.valores[columna] ?? '').trim();
      if (texto) libres[variable] = texto;
    }
    return {
      filaNumero: fila.filaNumero,
      telefono: fila.valores[columnaTelefono] ?? '',
      empresa: (fila.valores[columnaEmpresa] ?? '').trim(),
      rubro: columnaRubro ? (fila.valores[columnaRubro]?.trim() || null) : null,
      cerrado: false,
      conocidos,
      libres,
    };
  });
}

// ==================== Reglas comunes ====================

export function validarArchivo(archivo: ArchivoParseado): ResultadoValidacion {
  const { encabezados, filas } = archivo;
  const formato = esExportApify(encabezados) ? 'apify' : 'planilla';
  const leidas = formato === 'apify' ? leerApify(filas) : leerPlanilla(encabezados, filas);

  const filasValidas: FilaValida[] = [];
  const filasInvalidas: FilaInvalida[] = [];
  const telefonosVistos = new Set<string>();
  const clavesPresentes = new Set<string>();
  let duplicadas = 0;

  for (const fila of leidas) {
    const referencia = fila.empresa || '—';

    if (fila.cerrado) {
      filasInvalidas.push({ filaNumero: fila.filaNumero, motivo: 'cerrado', datoReferencia: referencia });
      continue;
    }
    if (!fila.telefono.trim()) {
      filasInvalidas.push({ filaNumero: fila.filaNumero, motivo: 'sin_telefono', datoReferencia: referencia });
      continue;
    }

    // Con codigo de pais: asi 987654321 y 51987654321 son el mismo contacto
    // (duplicado) y WhatsApp lo reconoce al enviar. Los fijos se rechazan.
    const telefono = normalizarParaWhatsapp(fila.telefono);
    if (!telefono) {
      filasInvalidas.push({ filaNumero: fila.filaNumero, motivo: 'telefono_invalido', datoReferencia: fila.telefono });
      continue;
    }

    if (!fila.empresa) {
      filasInvalidas.push({ filaNumero: fila.filaNumero, motivo: 'sin_empresa', datoReferencia: fila.telefono });
      continue;
    }

    // El primero gana: en Apify es el de mejor posicion en Google.
    if (telefonosVistos.has(telefono)) {
      duplicadas += 1;
      filasInvalidas.push({ filaNumero: fila.filaNumero, motivo: 'duplicado', datoReferencia: `${fila.empresa} (ya existe en la lista)` });
      continue;
    }
    telefonosVistos.add(telefono);

    const c = fila.conocidos;
    const tieneWeb = tipoDeWeb(c.web);
    const prioridad = calcularPrioridad({
      tieneWeb,
      calificacion: numeroDe(c.calificacion),
      resenas: numeroDe(c.resenas),
      fichaReclamada: c.ficha_reclamada === 'si' ? true : c.ficha_reclamada === 'no' ? false : null,
    });

    const datosExtra: Record<string, string> = {};
    for (const [clave, texto] of Object.entries(c)) if (texto) datosExtra[clave] = texto;
    datosExtra.tiene_web = tieneWeb;
    datosExtra.prioridad = prioridad;
    Object.assign(datosExtra, fila.libres);
    for (const clave of Object.keys(datosExtra)) clavesPresentes.add(clave);

    filasValidas.push({ filaNumero: fila.filaNumero, telefono, empresa: fila.empresa, rubro: fila.rubro, datosExtra });
  }

  // Columnas extra: primero las que el sistema entiende (en orden fijo), despues las libres.
  const columnasExtra = [
    ...ORDEN_CONOCIDOS.filter((clave) => clavesPresentes.has(clave)),
    ...[...clavesPresentes].filter((clave) => !ORDEN_CONOCIDOS.includes(clave)),
  ];

  return {
    formato,
    traeRubro: filasValidas.some((f) => f.rubro),
    resumen: {
      totalFilas: leidas.length,
      validas: filasValidas.length,
      invalidas: filasInvalidas.length,
      duplicadas,
    },
    columnasExtra,
    filasValidas,
    filasInvalidas,
  };
}
