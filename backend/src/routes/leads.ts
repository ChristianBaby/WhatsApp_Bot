import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { manejarAsync } from '../middleware/errorHandler.js';
import { noEncontrado, solicitudInvalida } from '../lib/errors.js';
import { parsearArchivo } from '../services/leads/parseo.js';
import { validarArchivo } from '../services/leads/validacion.js';
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

// --- Previsualizar: parsea y valida, pero todavia no guarda nada. ---
rutasLeads.post(
  '/listas-leads/previsualizar',
  subida.single('archivo'),
  manejarAsync(async (req, res) => {
    if (!req.file) throw solicitudInvalida('Falta el archivo');

    const archivoParseado = await parsearArchivo(req.file.buffer, req.file.originalname);
    const resultado = validarArchivo(archivoParseado);

    res.json({ nombreArchivoOriginal: req.file.originalname, ...resultado });
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
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw solicitudInvalida('Id invalido');

    const lista = await repo.obtener(id);
    if (!lista) throw noEncontrado('Lista de leads no encontrada');

    res.json(await repo.obtenerExcluidos(id));
  }),
);
