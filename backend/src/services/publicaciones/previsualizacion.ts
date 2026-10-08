import * as leadsRepo from '../leads/repositorio.js';
import * as configRepo from '../configuracion/repositorio.js';
import { resumirExclusiones } from './repositorio.js';
import { DATOS_PLACEHOLDER_MUESTRA, datosPlaceholderDeLead, elegirVariante, sustituirPlaceholders } from './plantilla.js';

/**
 * Todo lo que necesita el modo de prueba (seccion 3.5): simular una
 * campana completa sin enviar nada real (dry-run), o armar el texto exacto
 * para un envio de prueba a un solo numero. Nunca toca Baileys ni la cola.
 */

export type MuestraDryRun = {
  empresa: string;
  telefono: string;
  numeroIdAsignado: number;
  mensaje: string;
};

export type ResultadoDryRun = {
  /** Los que REALMENTE recibirian el mensaje (ya sin los excluidos). */
  totalDestinatarios: number;
  /** Motivo -> cantidad (baja, cliente, con asesor, contactado hace poco, repetido). */
  excluidosPorMotivo: Record<string, number>;
  duracionEstimadaMinutos: number;
  muestras: MuestraDryRun[];
};

const MUESTRAS_MAX = 8;

type ParametrosRitmo = {
  pausaMinSegundos: number | null;
  pausaMaxSegundos: number | null;
  tamanoLote: number | null;
  pausaEntreLotesMinutos: number | null;
};

async function resolverRitmo(overrides: ParametrosRitmo) {
  const defaults = await configRepo.obtenerTodos();
  return {
    pausaMin: overrides.pausaMinSegundos ?? Number(defaults.pausa_min_segundos ?? 45),
    pausaMax: overrides.pausaMaxSegundos ?? Number(defaults.pausa_max_segundos ?? 150),
    tamanoLote: overrides.tamanoLote ?? Number(defaults.tamano_lote ?? 25),
    pausaLoteMin: overrides.pausaEntreLotesMinutos ?? Number(defaults.pausa_entre_lotes_minutos ?? 20),
  };
}

export async function simularDryRun(
  datos: {
    listaId: number;
    variantesMensaje: string[];
    catalogoUrl: string | null;
    numeroIds: number[];
  } & ParametrosRitmo,
): Promise<ResultadoDryRun> {
  // Mismas exclusiones que la campana real: si no, la simulacion prometia
  // enviar (y tardar) mas de lo que despues hacia.
  const dias = Number((await configRepo.obtenerValor<number>('dias_sin_recontactar')) ?? 30);
  const { enviables, excluidosPorMotivo } = await resumirExclusiones(datos.listaId, dias);
  const idsEnviables = new Set(enviables);
  const leads = (await leadsRepo.listarPorLista(datos.listaId)).filter((l) => idsEnviables.has(l.id));
  const ritmo = await resolverRitmo(datos);

  const total = leads.length;
  const pausaPromedioSeg = (ritmo.pausaMin + ritmo.pausaMax) / 2;
  const segundosEnvios = total * pausaPromedioSeg;
  const lotesCompletos = ritmo.tamanoLote > 0 ? Math.floor(total / ritmo.tamanoLote) : 0;
  const segundosLotes = lotesCompletos * ritmo.pausaLoteMin * 60;
  const duracionEstimadaMinutos = Math.round((segundosEnvios + segundosLotes) / 60);

  const muestras: MuestraDryRun[] = leads.slice(0, MUESTRAS_MAX).map((lead, i) => {
    const variante = elegirVariante(datos.variantesMensaje);
    let mensaje = sustituirPlaceholders(variante, datosPlaceholderDeLead(lead));
    if (datos.catalogoUrl) mensaje += `\n\n${datos.catalogoUrl}`;
    return {
      empresa: lead.empresa,
      telefono: lead.telefono,
      numeroIdAsignado: datos.numeroIds[i % datos.numeroIds.length]!,
      mensaje,
    };
  });

  return { totalDestinatarios: total, excluidosPorMotivo, duracionEstimadaMinutos, muestras };
}

/** Arma el texto final para "enviar prueba a un numero", usando un lead real como muestra si hay uno disponible. */
export async function construirMensajePrueba(datos: {
  listaId: number | null;
  variantesMensaje: string[];
  catalogoUrl: string | null;
}): Promise<string> {
  let datosLead: Record<string, string> = DATOS_PLACEHOLDER_MUESTRA;

  if (datos.listaId) {
    const leads = await leadsRepo.listarPorLista(datos.listaId);
    const muestra = leads[Math.floor(Math.random() * leads.length)];
    if (muestra) datosLead = datosPlaceholderDeLead(muestra);
  }

  const variante = elegirVariante(datos.variantesMensaje);
  let mensaje = sustituirPlaceholders(variante, datosLead);
  if (datos.catalogoUrl) mensaje += `\n\n${datos.catalogoUrl}`;
  return mensaje;
}
