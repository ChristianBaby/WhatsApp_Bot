import { Router } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { manejarAsync } from '../middleware/errorHandler.js';
import { noEncontrado, solicitudInvalida } from '../lib/errors.js';
import * as repo from '../services/reportes/repositorio.js';
import * as publicacionesRepo from '../services/publicaciones/repositorio.js';

export const rutasReportes = Router();

const ETIQUETA_ESTADO_ENVIO: Record<string, string> = {
  enviado: '',
  sin_whatsapp: 'No tiene WhatsApp',
  fallido: '',
  pendiente: 'No llegó a procesarse',
};

const esquemaFiltros = z.object({
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  rubro: z.string().trim().min(1).optional(),
});

function leerFiltros(query: unknown) {
  const { desde, hasta, rubro } = esquemaFiltros.parse(query);
  return { desde: desde ?? null, hasta: hasta ?? null, rubro: rubro ?? null };
}

/** Escapa un valor para CSV: comillas dobles si trae coma, comilla o salto de linea. */
function celdaCsv(valor: string | number | null): string {
  const texto = valor === null ? '' : String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function filasACsv(encabezados: string[], filas: (string | number | null)[][]): string {
  const lineas = [encabezados.map(celdaCsv).join(',')];
  for (const fila of filas) lineas.push(fila.map(celdaCsv).join(','));
  return `﻿${lineas.join('\r\n')}`; // BOM: Excel abre bien los acentos
}

rutasReportes.get(
  '/reportes',
  manejarAsync(async (req, res) => {
    const filtros = leerFiltros(req.query);
    const [kpis, embudo, porRubro, autoResponder, campanas] = await Promise.all([
      repo.obtenerKpis(filtros),
      repo.obtenerEmbudo(filtros),
      repo.obtenerPorRubro(filtros),
      repo.obtenerResumenAutoResponder(filtros),
      repo.listarCampanas(filtros),
    ]);
    res.json({ kpis, embudo, porRubro, autoResponder, campanas });
  }),
);

rutasReportes.get(
  '/reportes/campanas/:id/log',
  manejarAsync(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw solicitudInvalida('Id invalido');

    const publicacion = await publicacionesRepo.obtener(id);
    if (!publicacion) throw noEncontrado('Publicacion no encontrada');

    const filas = await repo.obtenerLogCampana(id);
    const csv = filasACsv(
      ['Empresa', 'Telefono', 'Estado', 'Motivo', 'Enviado'],
      filas.map((f) => [
        f.empresa,
        `+${f.telefono}`,
        f.estado,
        f.motivoFallo ?? ETIQUETA_ESTADO_ENVIO[f.estado] ?? '',
        f.enviadoEn ? new Date(f.enviadoEn).toLocaleString('es-PE') : '',
      ]),
    );

    const nombreArchivo = publicacion.nombre.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="log_${nombreArchivo}.csv"`);
    res.send(csv);
  }),
);

rutasReportes.get(
  '/reportes/exportar',
  manejarAsync(async (req, res) => {
    const filtros = leerFiltros(req.query);
    const leads = await repo.exportarLeads(filtros);

    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Leads');
    hoja.columns = [
      { header: 'Empresa', key: 'empresa', width: 30 },
      { header: 'Teléfono', key: 'telefono', width: 16 },
      { header: 'Rubro', key: 'rubro', width: 18 },
      { header: 'Etapa', key: 'etapa', width: 18 },
      { header: 'Creado', key: 'creado', width: 20 },
    ];
    hoja.getRow(1).font = { bold: true };
    for (const lead of leads) {
      hoja.addRow({
        empresa: lead.empresa,
        telefono: `+${lead.telefono}`,
        rubro: lead.rubro ?? '',
        etapa: lead.etapaPipeline,
        creado: new Date(lead.creadoEn).toLocaleString('es-PE'),
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.xlsx"');
    await libro.xlsx.write(res);
    res.end();
  }),
);
