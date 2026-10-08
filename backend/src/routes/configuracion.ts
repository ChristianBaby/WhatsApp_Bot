import { Router } from 'express';
import { z } from 'zod';
import { manejarAsync } from '../middleware/errorHandler.js';
import { solicitudInvalida } from '../lib/errors.js';
import { emitir } from '../lib/sse.js';
import { normalizarParaWhatsapp } from '../lib/telefono.js';
import * as repo from '../services/configuracion/repositorio.js';

export const rutasConfiguracion = Router();

const CANAL_SSE = 'configuracion';
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

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
  // Ritmo por defecto de las campanas (cada campana puede sobrescribirlo).
  pausa_min_segundos: z.number().int().min(10).max(3600),
  pausa_max_segundos: z.number().int().min(10).max(3600),
  tamano_lote: z.number().int().min(1).max(500),
  pausa_entre_lotes_minutos: z.number().int().min(0).max(1440),
  max_mensajes_por_ejecucion: z.number().int().min(1).max(5000),
  horario_inicio: z.string().regex(HORA, 'Formato HH:MM'),
  horario_fin: z.string().regex(HORA, 'Formato HH:MM'),
};

/** Reglas entre claves: se validan sobre el resultado final (lo guardado + lo nuevo). */
function validarCombinacion(cfg: Record<string, unknown>): void {
  if (Number(cfg.pausa_min_segundos) > Number(cfg.pausa_max_segundos)) {
    throw solicitudInvalida('La pausa mínima no puede ser mayor que la máxima');
  }
  if (String(cfg.horario_inicio) >= String(cfg.horario_fin)) {
    throw solicitudInvalida('La hora de inicio debe ser anterior a la hora de fin');
  }
  if (Number(cfg.limite_respuestas_bot_hora) > Number(cfg.limite_respuestas_bot_dia)) {
    throw solicitudInvalida('El límite por hora no puede ser mayor que el límite por día');
  }
}

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

    // Primero se valida TODO y recien despues se guarda: un valor invalido
    // no debe dejar la configuracion a medio guardar.
    const validos: Record<string, unknown> = {};
    for (const clave of Object.keys(cuerpo)) {
      const esquema = ESQUEMAS_POR_CLAVE[clave];
      if (!esquema) throw solicitudInvalida(`Clave de configuracion desconocida o no editable: ${clave}`);

      const resultado = esquema.safeParse(cuerpo[clave]);
      if (!resultado.success) {
        throw solicitudInvalida(`Valor invalido para "${clave}": ${resultado.error.issues[0]?.message ?? ''}`);
      }
      validos[clave] = resultado.data;
    }
    validarCombinacion({ ...(await repo.obtenerTodos()), ...validos });

    for (const [clave, valor] of Object.entries(validos)) await repo.actualizarValor(clave, valor);

    const actualizado = await repo.obtenerTodos();
    emitir(CANAL_SSE, 'configuracion:actualizada', actualizado);
    res.json(actualizado);
  }),
);
