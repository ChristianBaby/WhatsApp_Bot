import { Type, type Schema } from '@google/genai';
import { generarJSON } from './gemini.js';

/**
 * Decide como debe reaccionar el auto-responder a un mensaje de un lead
 * (seccion 3.10). Es una funcion "pura" respecto a efectos: no toca la
 * base de datos ni envia nada por WhatsApp — solo decide QUE tocaria
 * hacer. Quien llama (services/conversaciones/mensajeEntrante.ts) se
 * encarga de ejecutar la decision y de registrar el resultado.
 */

export type DecisionAutoResponder =
  | { tipo: 'silencio' }
  | { tipo: 'escalar'; motivo: 'palabra_clave'; palabra: string }
  | { tipo: 'escalar'; motivo: 'baja_confianza' }
  | { tipo: 'bienvenida'; texto: string }
  | { tipo: 'responder'; texto: string };

type ContextoAutoResponder = {
  texto: string;
  esPrimerMensaje: boolean;
  baseConocimiento: string;
  mensajeBienvenida: string;
  palabrasEscalamiento: string[];
};

const ESQUEMA_RESPUESTA: Schema = {
  type: Type.OBJECT,
  properties: {
    puedeResponder: {
      type: Type.BOOLEAN,
      description: 'true solo si la base de conocimiento tiene informacion suficiente para responder con confianza',
    },
    respuesta: {
      type: Type.STRING,
      description: 'La respuesta al lead, breve y en tono amigable. Cadena vacia si puedeResponder es false.',
    },
  },
  required: ['puedeResponder', 'respuesta'],
};

async function responderConBaseConocimiento(pregunta: string, baseConocimiento: string): Promise<string | null> {
  if (!baseConocimiento.trim()) return null; // sin base de conocimiento no hay de donde responder

  const prompt = `Sos el asistente de atención al cliente de un negocio, respondiendo por WhatsApp. Usá ÚNICAMENTE la siguiente información del negocio — nunca inventes datos que no estén acá.

Información del negocio:
"""
${baseConocimiento}
"""

Mensaje del cliente: "${pregunta}"

Si la información de arriba te permite responder con confianza, respondé breve, natural y amigable (máximo 3 líneas), como una persona real del negocio escribiendo por WhatsApp — no como un bot. Si la pregunta pide algo que no está en esa información, o requiere el criterio de una persona (precio exacto de un proyecto particular, negociación, un caso especial), marcá puedeResponder como false y dejá respuesta vacía.`;

  const resultado = await generarJSON<{ puedeResponder: boolean; respuesta: string }>(prompt, ESQUEMA_RESPUESTA);
  if (!resultado?.puedeResponder || !resultado.respuesta.trim()) return null;
  return resultado.respuesta.trim();
}

export async function decidirRespuestaAutomatica(ctx: ContextoAutoResponder): Promise<DecisionAutoResponder> {
  const textoNormalizado = ctx.texto.toLowerCase();
  const palabraEncontrada = ctx.palabrasEscalamiento.find((p) => {
    const palabra = p.trim().toLowerCase();
    return palabra && textoNormalizado.includes(palabra);
  });
  if (palabraEncontrada) return { tipo: 'escalar', motivo: 'palabra_clave', palabra: palabraEncontrada.trim() };

  if (ctx.esPrimerMensaje) {
    const bienvenida = ctx.mensajeBienvenida.trim();
    // Sin bienvenida configurada, mejor no mandar nada generico que quede raro.
    return bienvenida ? { tipo: 'bienvenida', texto: bienvenida } : { tipo: 'silencio' };
  }

  const respuesta = await responderConBaseConocimiento(ctx.texto, ctx.baseConocimiento);
  return respuesta ? { tipo: 'responder', texto: respuesta } : { tipo: 'escalar', motivo: 'baja_confianza' };
}
