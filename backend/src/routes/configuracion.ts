import { Router } from 'express';
import { z } from 'zod';
import { manejarAsync } from '../middleware/errorHandler.js';
import { solicitudInvalida } from '../lib/errors.js';
import { emitir } from '../lib/sse.js';
import { normalizarParaWhatsapp } from '../lib/telefono.js';
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
  // Vacio = sin avisos; si se llena, tiene que ser un celular real (si no, los
  // avisos al dueño fallaban en silencio).
  telefono_propietario: z
    .string()
    .trim()
    .max(30)
    .refine((v) => v === '' || normalizarParaWhatsapp(v) !== null, 'No es un celular valido'),
  autorespuestas_activo: z.boolean(),
  mensaje_bienvenida: z.string().max(2000),
  base_conocimiento: z.string().max(8000),
  palabras_escalamiento: z.array(z.string().trim().min(1)).max(30),
  // Fase 1 (proteccion del numero)
  dias_sin_recontactar: z.number().int().min(0).max(365),
  limite_respuestas_bot_hora: z.number().int().min(1).max(30),
  limite_respuestas_bot_dia: z.number().int().min(1).max(200),
  mensaje_confirmacion_baja: z.string().trim().max(500),
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
