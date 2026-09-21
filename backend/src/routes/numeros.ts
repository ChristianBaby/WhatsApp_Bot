import { Router } from 'express';
import { z } from 'zod';
import { manejarAsync } from '../middleware/errorHandler.js';
import { solicitudInvalida } from '../lib/errors.js';
import * as gestor from '../services/whatsapp/gestor.js';

export const rutasNumeros = Router();

const esquemaEtiqueta = z.object({
  etiqueta: z.string().trim().min(1, 'La etiqueta no puede estar vacia').max(40),
});

function idDesdeParametro(valor: string | undefined): number {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw solicitudInvalida('Id invalido');
  return id;
}

rutasNumeros.get(
  '/numeros',
  manejarAsync(async (_req, res) => {
    res.json(await gestor.listar());
  }),
);

rutasNumeros.post(
  '/numeros',
  manejarAsync(async (req, res) => {
    const { etiqueta } = esquemaEtiqueta.parse(req.body);
    const numero = await gestor.crearNumero(etiqueta);
    res.status(201).json(numero);
  }),
);

rutasNumeros.patch(
  '/numeros/:id',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    const { etiqueta } = esquemaEtiqueta.parse(req.body);
    res.json(await gestor.renombrar(id, etiqueta));
  }),
);

rutasNumeros.post(
  '/numeros/:id/reconectar',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    res.json(await gestor.reconectar(id));
  }),
);

rutasNumeros.post(
  '/numeros/:id/cerrar-sesion',
  manejarAsync(async (req, res) => {
    const id = idDesdeParametro(req.params.id);
    res.json(await gestor.cerrarSesionUsuario(id));
  }),
);
