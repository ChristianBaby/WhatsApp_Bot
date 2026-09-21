import { Type, type Schema } from '@google/genai';
import { generarJSON } from './gemini.js';

/** Sugerencias del mini-CRM (seccion 3.9). Nunca se aplica sola: el usuario confirma o corrige. */
export type SugerenciaEtapa = 'interesado' | 'no_interesado' | 'duda_precio';

const VALORES: readonly string[] = ['interesado', 'no_interesado', 'duda_precio', 'ninguna'];

const ESQUEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    sugerencia: {
      type: Type.STRING,
      enum: [...VALORES],
      description: 'Clasificacion de la respuesta del lead segun su intencion',
    },
  },
  required: ['sugerencia'],
};

/**
 * Clasifica la respuesta de un lead para sugerir su etapa en el pipeline.
 * Devuelve null si la IA no esta disponible o el mensaje no permite
 * clasificar con confianza (saludo neutro, mensaje ambiguo, etc.).
 */
export async function clasificarRespuesta(texto: string): Promise<SugerenciaEtapa | null> {
  const prompt = `Sos un asistente que clasifica respuestas de leads (clientes potenciales) que contestaron una campaña de WhatsApp de un negocio.

Mensaje del lead: "${texto}"

Clasificá la intención de este mensaje en una sola categoría:
- "interesado": muestra interés claro (pide info, pide que lo llamen, dice que sí, pregunta cómo seguir, etc.)
- "no_interesado": rechaza, dice que no le interesa, pide que no le escriban más.
- "duda_precio": pregunta específicamente por el precio o costo.
- "ninguna": el mensaje es neutro, ambiguo, un simple saludo/agradecimiento, o no permite clasificar con confianza.

Responde solo con la clasificación.`;

  const resultado = await generarJSON<{ sugerencia: string }>(prompt, ESQUEMA);
  const sugerencia = resultado?.sugerencia;
  if (sugerencia === 'interesado' || sugerencia === 'no_interesado' || sugerencia === 'duda_precio') {
    return sugerencia;
  }
  return null;
}
