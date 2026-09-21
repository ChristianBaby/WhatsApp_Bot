import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, esperarConexion, cerrarPool } from './pool.js';
import { crearLogger } from '../lib/logger.js';

const log = crearLogger('migraciones');

/**
 * Runner de migraciones SQL. Cada archivo .sql de ./migrations se aplica una
 * sola vez, en orden alfabetico, dentro de su propia transaccion, y queda
 * registrado en migraciones_aplicadas. Por eso los archivos se numeran
 * (001_, 002_) y NUNCA se editan una vez aplicados: se agrega uno nuevo.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));

/** Busca la carpeta de migraciones tanto al correr con tsx (src/) como compilado (dist/). */
async function ubicarCarpeta(): Promise<string> {
  const candidatas = [
    path.join(aqui, 'migrations'),
    path.join(aqui, '..', '..', 'src', 'db', 'migrations'),
  ];
  for (const c of candidatas) {
    try {
      if ((await fs.stat(c)).isDirectory()) return c;
    } catch {
      /* siguiente candidata */
    }
  }
  throw new Error(`No se encontro la carpeta de migraciones. Busque en:\n${candidatas.join('\n')}`);
}

async function asegurarTablaDeControl(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
      nombre      TEXT PRIMARY KEY,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function migrar(): Promise<void> {
  await esperarConexion();
  await asegurarTablaDeControl();

  const carpeta = await ubicarCarpeta();
  const archivos = (await fs.readdir(carpeta)).filter((f) => f.endsWith('.sql')).sort();

  const { rows } = await pool.query<{ nombre: string }>('SELECT nombre FROM migraciones_aplicadas');
  const yaAplicadas = new Set(rows.map((r) => r.nombre));
  const pendientes = archivos.filter((f) => !yaAplicadas.has(f));

  if (pendientes.length === 0) {
    log.info(`Base de datos al dia (${yaAplicadas.size} migraciones aplicadas)`);
    return;
  }

  log.info(`Aplicando ${pendientes.length} migracion(es) pendiente(s)...`);

  for (const archivo of pendientes) {
    const sql = await fs.readFile(path.join(carpeta, archivo), 'utf8');
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(sql);
      await cliente.query('INSERT INTO migraciones_aplicadas (nombre) VALUES ($1)', [archivo]);
      await cliente.query('COMMIT');
      log.info(`  OK ${archivo}`);
    } catch (err) {
      await cliente.query('ROLLBACK');
      log.error({ err }, `  FALLO ${archivo} — se revirtio, no se aplico nada de este archivo`);
      throw err;
    } finally {
      cliente.release();
    }
  }

  log.info('Migraciones completadas');
}

// Permite ejecutarlo directamente: npm run migrate
const ejecutadoDirecto =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (ejecutadoDirecto) {
  migrar()
    .then(() => cerrarPool())
    .then(() => process.exit(0))
    .catch((err) => {
      log.error({ err }, 'Fallo la migracion');
      process.exit(1);
    });
}
