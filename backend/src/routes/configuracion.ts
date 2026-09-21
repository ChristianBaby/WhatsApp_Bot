import { Router } from 'express';
import { z } from 'zod';
import { manejarAsync } from '../middleware/errorHandler.js';
import { solicitudInvalida } from '../lib/errors.js';
import { emitir } from '../lib/sse.js';
import * as repo from '../services/configuracion/repositorio.js';

export const rutasConfiguracion = Router();

const CANAL_SSE = 'configuracion';

/**
 * Solo las claves que ya tienen una pantalla real que las edita (Fase 5:
 * Auto-respuestas) se validan aca. El resto (ritmo, catalogo, Telegram,
 * SMTP...) se suma cuando la Fase 7 construya el resto de Configuracion —
 * la ruta ya es generica, no hace falta reescribirla despues.
 */
const ESQUEMAS_POR_CLAVE: Record<string, z.ZodTypeAny> = {
  telefono_propietario: z.string().max(30),
  autorespuestas_activo: z.boolean(),
  mensaje_bienvenida: z.string().max(2000),
  base_conocimiento: z.string().max(8000),
  palabras_escalamiento: z.array(z.string().trim().min(1)).max(30),
};

const esquemaCuerpo = z.record(z.string(), z.unknown());

rutasConfiguracion.get(
  '/configuracion',
  manejarAsync(async (_req, res) => {
    res.json(await repo.obtenerTodos());
  }),
);

rutasConfiguracion.patch(
  '/configuracion',
  manejarAsync(async (req, res) => {
    const cuerpo = esquemaCuerpo.parse(req.body);

    for (const clave of Object.keys(cuerpo)) {
      const esquema = ESQUEMAS_POR_CLAVE[clave];
      if (!esquema) throw solicitudInvalida(`Clave de configuracion desconocida o no editable: ${clave}`);

      const resultado = esquema.safeParse(cuerpo[clave]);
      if (!resultado.success) throw solicitudInvalida(`Valor invalido para "${clave}"`);

      await repo.actualizarValor(clave, resultado.data);
    }

    const actualizado = await repo.obtenerTodos();
    emitir(CANAL_SSE, 'configuracion:actualizada', actualizado);
    res.json(actualizado);
  }),
);
