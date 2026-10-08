import { Router } from 'express';
import { z } from 'zod';
import { manejarAsync } from '../middleware/errorHandler.js';
import { noEncontrado, solicitudInvalida } from '../lib/errors.js';
import { normalizarParaWhatsapp } from '../lib/telefono.js';
import * as contactos from '../services/contactos/contactos.js';

/** Lista de "no contactar": las bajas automaticas y los bloqueos manuales. */
export const rutasContactos = Router();

rutasContactos.get(
  '/contactos-bloqueados',
  manejarAsync(async (_req, res) => {
    res.json(await contactos.listarBloqueados());
  }),
);

const esquemaBloqueo = z.object({
  telefono: z.string().trim().min(1, 'Ingresa el teléfono'),
  nota: z.string().trim().max(300).optional(),
});

rutasContactos.post(
  '/contactos-bloqueados',
  manejarAsync(async (req, res) => {
    const { telefono: crudo, nota } = esquemaBloqueo.parse(req.body);
    const telefono = normalizarParaWhatsapp(crudo);
    if (!telefono) throw solicitudInvalida('El teléfono no es un celular válido');

    const nuevo = await contactos.bloquear(telefono, 'manual', nota || null);
    if (!nuevo) throw solicitudInvalida('Ese teléfono ya está en la lista de no contactar');
    const excluidos = await contactos.excluirDeCampanasPendientes(telefono, 'Bloqueado manualmente');
    res.status(201).json({ telefono, excluidosDeCampanas: excluidos });
  }),
);

rutasContactos.delete(
  '/contactos-bloqueados/:telefono',
  manejarAsync(async (req, res) => {
    const telefono = String(req.params.telefono ?? '').replace(/\D/g, '');
    if (!(await contactos.desbloquear(telefono))) throw noEncontrado('Ese teléfono no está en la lista de no contactar');
    res.status(204).end();
  }),
);
