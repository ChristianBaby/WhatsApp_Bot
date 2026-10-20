import { Router, type Request } from 'express';
import { z } from 'zod';
import { manejarAsync } from '../middleware/errorHandler.js';
import { noAutenticado, solicitudInvalida } from '../lib/errors.js';
import * as etiquetas from '../services/crm/etiquetas.js';
import * as ficha from '../services/crm/ficha.js';
import * as rapidas from '../services/crm/rapidas.js';
import * as recordatorios from '../services/crm/recordatorios.js';
import * as usuarios from '../services/crm/usuarios.js';

/** Etapa 4 — el chat como CRM: asesores, etiquetas, ficha, notas, respuestas rapidas y recordatorios. */
export const rutasCrm = Router();

function idDe(valor: string | undefined): number {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw solicitudInvalida('Id invalido');
  return id;
}

function autorDe(req: Request): ficha.Autor {
  if (!req.usuario) throw noAutenticado();
  return { id: req.usuario.id, email: req.usuario.email };
}

// ==================== Asesores ====================

rutasCrm.get(
  '/usuarios-panel',
  manejarAsync(async (req, res) => {
    res.json({ usuarios: await usuarios.listar(), yo: req.usuario?.id ?? null });
  }),
);

const esquemaAsignar = z.object({ usuarioId: z.string().min(1).max(200).nullable() });

rutasCrm.post(
  '/conversaciones/:id/asignar',
  manejarAsync(async (req, res) => {
    const { usuarioId } = esquemaAsignar.parse(req.body);
    res.json(await ficha.asignar(idDe(req.params.id), usuarioId));
  }),
);

// ==================== Etiquetas ====================

const esquemaEtiqueta = z.object({
  nombre: z.string().trim().min(1).max(40),
  color: z.number().int().min(0).max(etiquetas.COLORES - 1),
});

rutasCrm.get(
  '/etiquetas',
  manejarAsync(async (_req, res) => {
    res.json({ etiquetas: await etiquetas.listar() });
  }),
);

rutasCrm.post(
  '/etiquetas',
  manejarAsync(async (req, res) => {
    const { nombre, color } = esquemaEtiqueta.parse(req.body);
    res.status(201).json(await etiquetas.crear(nombre, color));
  }),
);

rutasCrm.patch(
  '/etiquetas/:id',
  manejarAsync(async (req, res) => {
    const { nombre, color } = esquemaEtiqueta.parse(req.body);
    res.json(await etiquetas.editar(idDe(req.params.id), nombre, color));
  }),
);

rutasCrm.delete(
  '/etiquetas/:id',
  manejarAsync(async (req, res) => {
    await etiquetas.eliminar(idDe(req.params.id));
    res.json({ ok: true });
  }),
);

const esquemaEtiquetaChat = z.object({ etiquetaId: z.number().int().positive(), puesta: z.boolean() });

rutasCrm.post(
  '/conversaciones/:id/etiquetas',
  manejarAsync(async (req, res) => {
    const { etiquetaId, puesta } = esquemaEtiquetaChat.parse(req.body);
    res.json(await etiquetas.ponerEnChat(idDe(req.params.id), etiquetaId, puesta));
  }),
);

// ==================== Ficha y notas ====================

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);

const esquemaFicha = z.object({
  nombre: textoOpcional(100),
  empresa: textoOpcional(150),
  correo: textoOpcional(150).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Correo inválido'),
});

rutasCrm.patch(
  '/conversaciones/:id/ficha',
  manejarAsync(async (req, res) => {
    res.json(await ficha.guardarFicha(idDe(req.params.id), esquemaFicha.parse(req.body)));
  }),
);

const esquemaConvertir = z.object({
  empresa: z.string().trim().min(1).max(150),
  rubro: textoOpcional(80).optional().default(null),
});

rutasCrm.post(
  '/conversaciones/:id/convertir-lead',
  manejarAsync(async (req, res) => {
    const { empresa, rubro } = esquemaConvertir.parse(req.body);
    res.json(await ficha.convertirEnLead(idDe(req.params.id), { empresa, rubro }));
  }),
);

rutasCrm.get(
  '/conversaciones/:id/notas-internas',
  manejarAsync(async (req, res) => {
    res.json({ notas: await ficha.listarNotas(idDe(req.params.id)) });
  }),
);

const esquemaNota = z.object({ texto: z.string().trim().min(1).max(4000) });

rutasCrm.post(
  '/conversaciones/:id/notas-internas',
  manejarAsync(async (req, res) => {
    const { texto } = esquemaNota.parse(req.body);
    res.status(201).json(await ficha.agregarNota(idDe(req.params.id), texto, autorDe(req)));
  }),
);

rutasCrm.delete(
  '/conversaciones/:id/notas-internas/:notaId',
  manejarAsync(async (req, res) => {
    await ficha.borrarNota(idDe(req.params.id), idDe(req.params.notaId), autorDe(req));
    res.json({ ok: true });
  }),
);

// ==================== Respuestas rapidas ====================

const esquemaRapida = z.object({
  atajo: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .refine((v) => rapidas.normalizarAtajo(v).length > 0, 'Atajo inválido'),
  texto: z.string().trim().min(1).max(4000),
});

rutasCrm.get(
  '/respuestas-rapidas',
  manejarAsync(async (_req, res) => {
    res.json({ respuestas: await rapidas.listar() });
  }),
);

rutasCrm.post(
  '/respuestas-rapidas',
  manejarAsync(async (req, res) => {
    const { atajo, texto } = esquemaRapida.parse(req.body);
    res.status(201).json(await rapidas.crear(atajo, texto));
  }),
);

rutasCrm.patch(
  '/respuestas-rapidas/:id',
  manejarAsync(async (req, res) => {
    const { atajo, texto } = esquemaRapida.parse(req.body);
    res.json(await rapidas.editar(idDe(req.params.id), atajo, texto));
  }),
);

rutasCrm.delete(
  '/respuestas-rapidas/:id',
  manejarAsync(async (req, res) => {
    await rapidas.eliminar(idDe(req.params.id));
    res.json({ ok: true });
  }),
);

// ==================== Recordatorios ====================

rutasCrm.get(
  '/conversaciones/:id/recordatorios',
  manejarAsync(async (req, res) => {
    res.json({ recordatorios: await recordatorios.listar(idDe(req.params.id)) });
  }),
);

const esquemaRecordatorio = z.object({
  texto: z.string().trim().min(1).max(500),
  venceEn: z.string().datetime({ offset: true }),
});

rutasCrm.post(
  '/conversaciones/:id/recordatorios',
  manejarAsync(async (req, res) => {
    const { texto, venceEn } = esquemaRecordatorio.parse(req.body);
    res.status(201).json(await recordatorios.crear(idDe(req.params.id), texto, new Date(venceEn), autorDe(req)));
  }),
);

const esquemaHecho = z.object({ hecho: z.boolean() });

rutasCrm.patch(
  '/conversaciones/:id/recordatorios/:recordatorioId',
  manejarAsync(async (req, res) => {
    const { hecho } = esquemaHecho.parse(req.body);
    res.json(await recordatorios.marcarHecho(idDe(req.params.id), idDe(req.params.recordatorioId), hecho));
  }),
);

rutasCrm.delete(
  '/conversaciones/:id/recordatorios/:recordatorioId',
  manejarAsync(async (req, res) => {
    await recordatorios.borrar(idDe(req.params.id), idDe(req.params.recordatorioId));
    res.json({ ok: true });
  }),
);
