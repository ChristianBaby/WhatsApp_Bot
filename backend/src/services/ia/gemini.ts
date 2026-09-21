import { GoogleGenAI, type Schema } from '@google/genai';
import { env } from '../../config/env.js';
import { crearLogger } from '../../lib/logger.js';

const log = crearLogger('ia');

/**
 * Cliente unico de Gemini (seccion 3.9/3.10). Se usa SOLO de forma
 * reactiva — al llegar una respuesta de un lead — nunca en los envios
 * masivos de campanas, que siguen siendo con placeholders simples.
 *
 * Si no hay API key configurada (.env), el cliente queda null y toda
 * llamada devuelve null: el resto del sistema sigue funcionando sin IA
 * (sin sugerencia de clasificacion, sin auto-responder), no se cae nada.
 */
const cliente = env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }) : null;

if (!cliente) {
  log.warn('GEMINI_API_KEY no esta configurada: la clasificacion y el auto-responder quedan desactivados');
}

/**
 * Pide una respuesta estructurada (JSON contra un schema) y la parsea.
 * Cualquier fallo (sin API key, red, limite de cuota, JSON invalido)
 * devuelve null en vez de lanzar — quien llama decide el "modo seguro"
 * (no sugerir nada / escalar a un asesor humano).
 */
export async function generarJSON<T>(prompt: string, schema: Schema): Promise<T | null> {
  if (!cliente) return null;

  try {
    const respuesta = await cliente.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature: 0.2, // respuestas consistentes, no creativas
      },
    });

    const texto = respuesta.text;
    if (!texto) return null;
    return JSON.parse(texto) as T;
  } catch (err) {
    log.warn({ err }, 'Fallo la llamada a Gemini');
    return null;
  }
}
