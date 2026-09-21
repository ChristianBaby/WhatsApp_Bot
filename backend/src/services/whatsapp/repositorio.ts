import { consultar, consultarUno } from '../../db/pool.js';
import { noEncontrado } from '../../lib/errors.js';

export type EstadoNumero = 'esperando_qr' | 'conectado' | 'desconectado' | 'pausado_error';

export type NumeroWhatsapp = {
  id: number;
  etiqueta: string;
  telefono: string | null;
  estado: EstadoNumero;
  ultimoError: string | null;
  conectadoEn: string | null;
  /** Interruptor por numero del auto-responder (seccion 3.10), ademas del global en "configuracion". */
  autoRespuestasActivo: boolean;
  creadoEn: string;
  actualizadoEn: string;
};

type FilaNumero = {
  id: number;
  etiqueta: string;
  telefono: string | null;
  estado: EstadoNumero;
  ultimo_error: string | null;
  conectado_en: string | null;
  auto_respuestas_activo: boolean;
  creado_en: string;
  actualizado_en: string;
};

function mapear(fila: FilaNumero): NumeroWhatsapp {
  return {
    id: fila.id,
    etiqueta: fila.etiqueta,
    telefono: fila.telefono,
    estado: fila.estado,
    ultimoError: fila.ultimo_error,
    conectadoEn: fila.conectado_en,
    autoRespuestasActivo: fila.auto_respuestas_activo,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export async function listar(): Promise<NumeroWhatsapp[]> {
  const filas = await consultar<FilaNumero>('SELECT * FROM numeros_whatsapp ORDER BY creado_en ASC');
  return filas.map(mapear);
}

export async function obtener(id: number): Promise<NumeroWhatsapp | null> {
  const fila = await consultarUno<FilaNumero>('SELECT * FROM numeros_whatsapp WHERE id = $1', [id]);
  return fila ? mapear(fila) : null;
}

export async function crear(etiqueta: string): Promise<NumeroWhatsapp> {
  const fila = await consultarUno<FilaNumero>(
    `INSERT INTO numeros_whatsapp (etiqueta, estado) VALUES ($1, 'esperando_qr') RETURNING *`,
    [etiqueta],
  );
  return mapear(fila!);
}

export async function renombrar(id: number, etiqueta: string): Promise<NumeroWhatsapp> {
  const fila = await consultarUno<FilaNumero>(
    'UPDATE numeros_whatsapp SET etiqueta = $2 WHERE id = $1 RETURNING *',
    [id, etiqueta],
  );
  if (!fila) throw noEncontrado('Numero no encontrado');
  return mapear(fila);
}

export async function cambiarAutoRespuestas(id: number, activo: boolean): Promise<NumeroWhatsapp> {
  const fila = await consultarUno<FilaNumero>(
    'UPDATE numeros_whatsapp SET auto_respuestas_activo = $2 WHERE id = $1 RETURNING *',
    [id, activo],
  );
  if (!fila) throw noEncontrado('Numero no encontrado');
  return mapear(fila);
}

type CambiosEstado = Partial<{
  estado: EstadoNumero;
  telefono: string | null;
  ultimoError: string | null;
  conectadoEn: string | null;
}>;

// Whitelist explicita columna<->clave: evita construir SQL con nombres
// arbitrarios y deja clarisimo que camelCase mapea a que columna.
const COLUMNAS: Record<keyof CambiosEstado, string> = {
  estado: 'estado',
  telefono: 'telefono',
  ultimoError: 'ultimo_error',
  conectadoEn: 'conectado_en',
};

export async function actualizarEstado(id: number, cambios: CambiosEstado): Promise<NumeroWhatsapp> {
  const claves = Object.keys(cambios) as (keyof CambiosEstado)[];

  if (claves.length === 0) {
    const actual = await obtener(id);
    if (!actual) throw noEncontrado('Numero no encontrado');
    return actual;
  }

  const asignaciones = claves.map((clave, i) => `${COLUMNAS[clave]} = $${i + 2}`);
  const valores = claves.map((clave) => cambios[clave]);

  const fila = await consultarUno<FilaNumero>(
    `UPDATE numeros_whatsapp SET ${asignaciones.join(', ')} WHERE id = $1 RETURNING *`,
    [id, ...valores],
  );
  if (!fila) throw noEncontrado('Numero no encontrado');
  return mapear(fila);
}
