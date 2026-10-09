import { consultar, consultarUno } from '../../db/pool.js';
import { noEncontrado } from '../../lib/errors.js';

/**
 * Base de conocimiento de la IA: documentos (idealmente .md) con los
 * servicios, precios, preguntas frecuentes, horarios, etc. del negocio.
 */

export type DocumentoConocimiento = {
  id: number;
  nombre: string;
  contenido: string;
  activo: boolean;
  caracteres: number;
  actualizadoEn: string;
};

type FilaDocumento = {
  id: number;
  nombre: string;
  contenido: string;
  activo: boolean;
  actualizado_en: string;
};

function mapear(f: FilaDocumento): DocumentoConocimiento {
  return {
    id: f.id,
    nombre: f.nombre,
    contenido: f.contenido,
    activo: f.activo,
    caracteres: f.contenido.length,
    actualizadoEn: f.actualizado_en,
  };
}

export async function listar(): Promise<DocumentoConocimiento[]> {
  const filas = await consultar<FilaDocumento>('SELECT * FROM documentos_conocimiento ORDER BY nombre ASC');
  return filas.map(mapear);
}

export async function crear(nombre: string, contenido: string): Promise<DocumentoConocimiento> {
  const fila = await consultarUno<FilaDocumento>(
    'INSERT INTO documentos_conocimiento (nombre, contenido) VALUES ($1, $2) RETURNING *',
    [nombre, contenido],
  );
  return mapear(fila!);
}

export async function actualizar(
  id: number,
  cambios: { nombre?: string; contenido?: string; activo?: boolean },
): Promise<DocumentoConocimiento> {
  const fila = await consultarUno<FilaDocumento>(
    `UPDATE documentos_conocimiento
     SET nombre = COALESCE($2, nombre), contenido = COALESCE($3, contenido), activo = COALESCE($4, activo)
     WHERE id = $1 RETURNING *`,
    [id, cambios.nombre ?? null, cambios.contenido ?? null, cambios.activo ?? null],
  );
  if (!fila) throw noEncontrado('Documento no encontrado');
  return mapear(fila);
}

export async function eliminar(id: number): Promise<void> {
  const fila = await consultarUno('DELETE FROM documentos_conocimiento WHERE id = $1 RETURNING id', [id]);
  if (!fila) throw noEncontrado('Documento no encontrado');
}

// ==================== Seleccion de contexto ====================

/**
 * Hasta este tamaño se manda todo (Gemini admite mucho mas, pero menos
 * texto = respuestas mas rapidas, mas baratas y mas enfocadas).
 */
const PRESUPUESTO_CARACTERES = 60_000;

type Seccion = { documento: string; titulo: string; texto: string };

/** Corta un .md por sus titulos (#, ##, ###): cada seccion conserva su titulo. */
function dividirEnSecciones(documento: string, contenido: string): Seccion[] {
  const secciones: Seccion[] = [];
  let titulo = documento;
  let lineas: string[] = [];
  const cerrar = () => {
    const texto = lineas.join('\n').trim();
    if (texto) secciones.push({ documento, titulo, texto });
  };
  for (const linea of contenido.split(/\r?\n/)) {
    const encabezado = /^#{1,3}\s+(.+)$/.exec(linea);
    if (encabezado) {
      cerrar();
      titulo = encabezado[1]!.trim();
      lineas = [linea];
    } else {
      lineas.push(linea);
    }
  }
  cerrar();
  return secciones;
}

const PALABRAS_VACIAS = new Set(
  'para como cual cuales cuando donde desde esta este estos estas esto tiene tienen tengo quiero quisiera sobre entre hola buenas buenos dias tardes noches gracias favor puede pueden podria seria usted ustedes nosotros ellos ellas porque pero tambien solo cada todo todos todas mucho muchas muchos'.split(
    ' ',
  ),
);

function terminos(texto: string): Set<string> {
  return new Set(
    texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9ñ]+/)
      .filter((t) => t.length > 3 && !PALABRAS_VACIAS.has(t)),
  );
}

export type ContextoConocimiento = {
  texto: string;
  /** "documento › seccion" de lo que se incluyo (para mostrar en "Probar la IA"). */
  fuentes: string[];
};

/**
 * Lo que la IA lee para responder. Si los documentos activos entran en el
 * presupuesto, van completos; si no, solo las secciones que mas se parecen
 * a la conversacion (por palabras en comun, priorizando el titulo).
 */
export async function seleccionarContexto(consulta: string): Promise<ContextoConocimiento> {
  const documentos = (await listar()).filter((d) => d.activo && d.contenido.trim());
  const total = documentos.reduce((suma, d) => suma + d.contenido.length, 0);

  if (total <= PRESUPUESTO_CARACTERES) {
    return {
      texto: documentos.map((d) => `### Documento: ${d.nombre}\n${d.contenido.trim()}`).join('\n\n'),
      fuentes: documentos.map((d) => d.nombre),
    };
  }

  const buscados = terminos(consulta);
  const puntuadas = documentos
    .flatMap((d) => dividirEnSecciones(d.nombre, d.contenido))
    .map((s, orden) => {
      const enTitulo = terminos(s.titulo);
      const enTexto = terminos(s.texto);
      let puntos = 0;
      for (const t of buscados) {
        if (enTitulo.has(t)) puntos += 3;
        if (enTexto.has(t)) puntos += 1;
      }
      return { s, puntos, orden };
    })
    .sort((a, b) => b.puntos - a.puntos || a.orden - b.orden);

  // Se cuenta el bloque completo (encabezado + texto + separador), no solo el
  // texto: si no, el total se pasaba del presupuesto.
  const bloqueDe = (s: Seccion) => `### ${s.documento} › ${s.titulo}\n${s.texto}`;
  const bloques: string[] = [];
  const fuentes: string[] = [];
  let usado = 0;
  for (const { s } of puntuadas) {
    const bloque = bloqueDe(s);
    if (usado + bloque.length + 2 > PRESUPUESTO_CARACTERES) continue;
    bloques.push(bloque);
    fuentes.push(`${s.documento} › ${s.titulo}`);
    usado += bloque.length + 2;
  }

  return { texto: bloques.join('\n\n'), fuentes };
}
