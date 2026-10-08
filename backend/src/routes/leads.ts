import { Router } from 'express';
import ExcelJS from 'exceljs';
import multer from 'multer';
import { z } from 'zod';
import { manejarAsync } from '../middleware/errorHandler.js';
import { noEncontrado, solicitudInvalida } from '../lib/errors.js';
import { normalizarParaWhatsapp } from '../lib/telefono.js';
import { parsearArchivo } from '../services/leads/parseo.js';
import { validarArchivo } from '../services/leads/validacion.js';
import * as archivos from '../services/leads/archivos.js';
import * as repo from '../services/leads/repositorio.js';

export const rutasLeads = Router();

const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB: de sobra para 50-200 contactos (3.2)
  fileFilter: (_req, archivo, cb) => {
    const extension = archivo.originalname.toLowerCase().split('.').pop();
    if (extension === 'csv' || extension === 'xlsx') return cb(null, true);
    cb(solicitudInvalida('Formato no soportado. Sube un archivo .csv o .xlsx'));
  },
});

function idDesdeParametro(valor: string | undefined): number {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw solicitudInvalida('Id invalido');
  return id;
}

async function listaDesdeParametro(valor: string | undefined) {
  const lista = await repo.obtener(idDesdeParametro(valor));
  if (!lista) throw noEncontrado('Lista de leads no encontrada');
  return lista;
}

// --- Previsualizar: parsea y valida, pero todavia no guarda nada en la base. ---
// Si guarda una copia del archivo (archivoToken): al confirmar queda asociada
// a la lista para poder descargarla; si se cancela, se borra a las 24 h.
rutasLeads.post(
  '/listas-leads/previsualizar',
  subida.single('archivo'),
  manejarAsync(async (req, res) => {
    if (!req.file) throw solicitudInvalida('Falta el archivo');

    const archivoParseado = await parsearArchivo(req.file.buffer, req.file.originalname);
    const resultado = validarArchivo(archivoParseado);

    const archivoToken = await archivos.guardarCopia(req.file.buffer, req.file.originalname);
    void repo.rutasArchivoEnUso().then(archivos.limpiarHuerfanos).catch(() => undefined);

    res.json({ nombreArchivoOriginal: req.file.originalname, archivoToken, ...resultado });
  }),
);

// --- Confirmar: persiste lo que el usuario ya vio y acepto en la previsualizacion. ---

const esquemaFilaValida = z.object({
  filaNumero: z.number().int().positive(),
  telefono: z.string().min(1),
  empresa: z.string().min(1),
  rubro: z.string().nullable(),
  datosExtra: z.record(z.string(), z.string()),
});

const esquemaFilaInvalida = z.object({
  filaNumero: z.number().int().positive(),
  motivo: z.enum(['sin_telefono', 'telefono_invalido', 'sin_empresa', 'duplicado']),
  datoReferencia: z.string(),
});

// Tope de sanidad generoso (el volumen esperado es 50-200 filas, seccion 3.2).
const esquemaConfirmacion = z.object({
  nombre: z.string().trim().min(1, 'El nombre de la lista no puede estar vacio').max(120),
  nombreArchivoOriginal: z.string().min(1),
  archivoToken: z.string().nullable().optional(),
  columnasExtra: z.array(z.string()),
  filasValidas: z.array(esquemaFilaValida).max(5000),
  filasInvalidas: z.array(esquemaFilaInvalida).max(5000),
});

rutasLeads.post(
  '/listas-leads',
  manejarAsync(async (req, res) => {
    const datos = esquemaConfirmacion.parse(req.body);
    if (datos.filasValidas.length === 0) {
      throw solicitudInvalida('No hay filas validas para guardar. Revisa el archivo e intenta de nuevo.');
    }
    const lista = await repo.crear(datos);

    // La copia es un extra: si no esta (token viejo o invalido), la lista se guarda igual.
    const token = datos.archivoToken;
    if (token && (await archivos.existe(token).catch(() => false))) {
      await repo.guardarArchivo(lista.id, token);
      lista.tieneArchivo = true;
    }
    res.status(201).json(lista);
  }),
);

rutasLeads.get(
  '/listas-leads',
  manejarAsync(async (_req, res) => {
    res.json(await repo.listar());
  }),
);

rutasLeads.get(
  '/listas-leads/:id/excluidos',
  manejarAsync(async (req, res) => {
    const lista = await listaDesdeParametro(req.params.id);
    res.json(await repo.obtenerExcluidos(lista.id));
  }),
);

/**
 * "Eliminar" una lista: si nunca se uso en una campana se borra de verdad;
 * si ya se uso, se archiva (borrarla romperia reportes e historial). No se
 * permite mientras una campana que la usa este programada, en curso o pausada.
 */
rutasLeads.delete(
  '/listas-leads/:id',
  manejarAsync(async (req, res) => {
    const lista = await listaDesdeParametro(req.params.id);
    const estados = await repo.estadosCampanasDeLista(lista.id);

    if (estados.some((e) => ['programada', 'en_curso', 'pausada'].includes(e))) {
      throw solicitudInvalida('Esta lista la usa una campaña activa (programada, en curso o pausada). Cancélala o espera a que termine.');
    }

    if (estados.length === 0) {
      const archivo = await repo.rutaArchivo(lista.id);
      await repo.borrarLista(lista.id);
      if (archivo) await archivos.borrar(archivo.ruta);
      res.json({ accion: 'eliminada' });
      return;
    }

    await repo.archivarLista(lista.id);
    res.json({ accion: 'archivada' });
  }),
);

// --- Archivo original y exportacion ---

rutasLeads.get(
  '/listas-leads/:id/archivo',
  manejarAsync(async (req, res) => {
    const lista = await listaDesdeParametro(req.params.id);
    const archivo = await repo.rutaArchivo(lista.id);
    if (!archivo || !(await archivos.existe(archivo.ruta))) {
      throw noEncontrado('Esta lista no tiene una copia del archivo original (se subió antes de que existiera esta opción).');
    }
    res.download(archivos.rutaAbsoluta(archivo.ruta), archivo.nombre);
  }),
);

rutasLeads.get(
  '/listas-leads/:id/exportar',
  manejarAsync(async (req, res) => {
    const lista = await listaDesdeParametro(req.params.id);
    const { leads } = await repo.listarLeadsDeLista(lista.id, { buscar: null, pagina: 1, tamano: 100_000 });

    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Leads');
    hoja.columns = [
      { header: 'Empresa', key: 'empresa', width: 30 },
      { header: 'Teléfono', key: 'telefono', width: 16 },
      { header: 'Rubro', key: 'rubro', width: 18 },
      { header: 'Etapa', key: 'etapa', width: 18 },
      { header: 'No contactar', key: 'bloqueado', width: 14 },
      { header: 'Último envío', key: 'ultimoEnvio', width: 20 },
      ...lista.columnasExtra.map((c) => ({ header: c, key: `extra_${c}`, width: 18 })),
    ];
    hoja.getRow(1).font = { bold: true };
    for (const lead of leads) {
      hoja.addRow({
        empresa: lead.empresa,
        telefono: `+${lead.telefono}`,
        rubro: lead.rubro ?? '',
        etapa: lead.etapaPipeline,
        bloqueado: lead.bloqueado ? 'Sí' : '',
        ultimoEnvio: lead.ultimoEnvioEn ? new Date(lead.ultimoEnvioEn).toLocaleString('es-PE') : '',
        ...Object.fromEntries(lista.columnasExtra.map((c) => [`extra_${c}`, lead.datosExtra[c] ?? ''])),
      });
    }

    const nombre = lista.nombre.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}.xlsx"`);
    await libro.xlsx.write(res);
    res.end();
  }),
);

// --- Leads de una lista: ver, buscar, agregar, editar, eliminar ---

const esquemaBusqueda = z.object({
  buscar: z.string().trim().max(100).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  tamano: z.coerce.number().int().min(1).max(200).default(50),
});

rutasLeads.get(
  '/listas-leads/:id/leads',
  manejarAsync(async (req, res) => {
    const lista = await listaDesdeParametro(req.params.id);
    const { buscar, pagina, tamano } = esquemaBusqueda.parse(req.query);
    res.json(await repo.listarLeadsDeLista(lista.id, { buscar: buscar || null, pagina, tamano }));
  }),
);

const esquemaLead = z.object({
  telefono: z.string().trim().min(1, 'Ingresa el teléfono'),
  empresa: z.string().trim().min(1, 'Ingresa la empresa').max(200),
  rubro: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional()
    .transform((v) => v || null),
});

function datosLeadValidados(cuerpo: unknown) {
  const datos = esquemaLead.parse(cuerpo);
  const telefono = normalizarParaWhatsapp(datos.telefono);
  if (!telefono) throw solicitudInvalida('El teléfono no es un celular válido');
  return { telefono, empresa: datos.empresa, rubro: datos.rubro };
}

rutasLeads.post(
  '/listas-leads/:id/leads',
  manejarAsync(async (req, res) => {
    const lista = await listaDesdeParametro(req.params.id);
    const datos = datosLeadValidados(req.body);
    const id = await repo.agregarLead(lista.id, datos);
    if (id === null) throw solicitudInvalida('Ese teléfono ya está en esta lista');
    res.status(201).json({ id });
  }),
);

async function leadDesdeParametro(valor: string | undefined) {
  const id = idDesdeParametro(valor);
  const info = await repo.obtenerListaDeLead(id);
  if (!info) throw noEncontrado('Lead no encontrado');
  return { id, ...info };
}

rutasLeads.patch(
  '/leads/:id',
  manejarAsync(async (req, res) => {
    const lead = await leadDesdeParametro(req.params.id);
    const datos = datosLeadValidados(req.body);
    const ok = await repo.actualizarLead(lead.id, lead.listaId, datos);
    if (!ok) throw solicitudInvalida('Ese teléfono ya lo tiene otro lead de esta lista');
    res.status(204).end();
  }),
);

rutasLeads.delete(
  '/leads/:id',
  manejarAsync(async (req, res) => {
    const lead = await leadDesdeParametro(req.params.id);
    if (lead.tieneHistorial) {
      throw solicitudInvalida(
        'Este lead ya recibió campañas: borrarlo eliminaría sus métricas. Si no quieres escribirle más, márcalo como "No contactar".',
      );
    }
    await repo.eliminarLead(lead.id, lead.listaId);
    res.status(204).end();
  }),
);

// Notas y cambios manuales de etapa (venta concretada / descartado) se
// exponen desde /conversaciones (routes/conversaciones.ts), no aqui: asi
// pueden emitir el evento SSE de esa conversacion despues de guardar.
