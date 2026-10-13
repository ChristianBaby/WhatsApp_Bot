import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { manejarAsync } from '../middleware/errorHandler.js';
import { solicitudInvalida } from '../lib/errors.js';
import { normalizarParaWhatsapp } from '../lib/telefono.js';
import * as conocimiento from '../services/ia/conocimiento.js';
import { armarContexto } from '../services/ia/contexto.js';
import { decidirRespuestaAutomatica } from '../services/ia/autoResponder.js';
import { iaDisponible } from '../services/ia/gemini.js';
import * as nichos from '../services/ia/nichos.js';

/** Base de conocimiento de la IA (documentos .md) y "Probar la IA". */
export const rutasConocimiento = Router();

const TAMANO_MAX_DOCUMENTO = 500 * 1024; // 500 KB de texto: un manual entero
const EXTENSIONES = ['md', 'markdown', 'txt'];

const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAX_DOCUMENTO, files: 20 },
  fileFilter: (_req, archivo, cb) => {
    const extension = archivo.originalname.toLowerCase().split('.').pop() ?? '';
    if (EXTENSIONES.includes(extension)) return cb(null, true);
    cb(solicitudInvalida('Solo se aceptan documentos de texto: .md, .markdown o .txt'));
  },
});

function idDesdeParametro(valor: string | undefined): number {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw solicitudInvalida('Id invalido');
  return id;
}

/** null = General. Un id que no existe es un error (no se guarda en silencio como General). */
const esquemaNichoId = z.number().int().positive().nullable();

async function validarNicho(nichoId: number | null | undefined): Promise<void> {
  if (nichoId && !(await nichos.existe(nichoId))) throw solicitudInvalida('El nicho elegido no existe');
}

// --- Nichos ---

rutasConocimiento.get(
  '/nichos',
  manejarAsync(async (_req, res) => {
    res.json(await nichos.listar());
  }),
);

rutasConocimiento.post(
  '/nichos',
  manejarAsync(async (req, res) => {
    const { nombre } = z.object({ nombre: z.string().trim().min(2, 'Escribe el nombre del nicho').max(80) }).parse(req.body);
    const creado = await nichos.crear(nombre);
    if (!creado) throw solicitudInvalida('Ya existe un nicho con ese nombre');
    res.status(201).json(creado);
  }),
);

rutasConocimiento.get(
  '/conocimiento',
  manejarAsync(async (_req, res) => {
    res.json({ iaDisponible: iaDisponible(), documentos: await conocimiento.listar() });
  }),
);

rutasConocimiento.post(
  '/conocimiento/archivos',
  subida.array('archivos', 20),
  manejarAsync(async (req, res) => {
    const archivos = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (archivos.length === 0) throw solicitudInvalida('Elige al menos un archivo .md');
    // En multipart llega como texto: '' o ausente = General.
    const crudo = typeof req.body?.nichoId === 'string' ? req.body.nichoId.trim() : '';
    const nichoId = crudo ? esquemaNichoId.parse(Number(crudo)) : null;
    await validarNicho(nichoId);

    const creados = [];
    for (const archivo of archivos) {
      const contenido = archivo.buffer.toString('utf8').replace(/^﻿/, '').trim();
      if (!contenido) throw solicitudInvalida(`"${archivo.originalname}" está vacío`);
      creados.push(await conocimiento.crear(archivo.originalname, contenido, nichoId));
    }
    res.status(201).json(creados);
  }),
);

const esquemaDocumento = z.object({
  nombre: z.string().trim().min(1, 'Ponle un nombre').max(150),
  contenido: z.string().trim().min(1, 'El documento está vacío').max(TAMANO_MAX_DOCUMENTO),
});

rutasConocimiento.post(
  '/conocimiento',
  manejarAsync(async (req, res) => {
    const { nombre, contenido, nichoId } = esquemaDocumento.extend({ nichoId: esquemaNichoId.default(null) }).parse(req.body);
    await validarNicho(nichoId);
    res.status(201).json(await conocimiento.crear(nombre, contenido, nichoId));
  }),
);

rutasConocimiento.patch(
  '/conocimiento/:id',
  manejarAsync(async (req, res) => {
    const cambios = esquemaDocumento
      .partial()
      .extend({ activo: z.boolean().optional(), nichoId: esquemaNichoId.optional() })
      .parse(req.body);
    await validarNicho(cambios.nichoId);
    res.json(await conocimiento.actualizar(idDesdeParametro(req.params.id), cambios));
  }),
);

rutasConocimiento.delete(
  '/conocimiento/:id',
  manejarAsync(async (req, res) => {
    await conocimiento.eliminar(idDesdeParametro(req.params.id));
    res.status(204).end();
  }),
);

// --- Probar la IA: misma logica y mismo contexto que el bot real, sin enviar nada ---

const esquemaPrueba = z.object({
  mensaje: z.string().trim().min(1, 'Escribe un mensaje de prueba').max(2000),
  /** Opcional: simula ser este lead (usa sus datos y la campaña que recibió). */
  telefono: z.string().trim().max(30).optional(),
  historial: z
    .array(z.object({ autor: z.enum(['lead', 'yo', 'bot']), texto: z.string().max(2000) }))
    .max(30)
    .default([]),
  /** Opcional: probar con los documentos de un nicho (null = solo generales). Si no viene, sale del lead. */
  nichoId: esquemaNichoId.optional(),
});

rutasConocimiento.post(
  '/ia/probar',
  manejarAsync(async (req, res) => {
    const datos = esquemaPrueba.parse(req.body);
    const telefono = datos.telefono ? normalizarParaWhatsapp(datos.telefono) : null;
    if (datos.telefono && !telefono) throw solicitudInvalida('El teléfono no es un celular válido');

    await validarNicho(datos.nichoId);
    const { contexto, fuentes, nichoId } = await armarContexto({
      telefono,
      mensajesNuevos: [datos.mensaje],
      historial: datos.historial,
      esPrimerMensaje: datos.historial.length === 0,
      nichoId: datos.nichoId,
    });
    const decision = await decidirRespuestaAutomatica(contexto);

    res.json({
      iaDisponible: iaDisponible(),
      decision,
      fuentes,
      lead: contexto.lead?.empresa ?? null,
      nichoId,
      mensajeCampana: contexto.mensajeCampana,
    });
  }),
);
