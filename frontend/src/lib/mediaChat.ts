import { api } from './api';

/**
 * Fotos, audios y documentos de los chats ya bajados en esta pestaña. Se
 * guardan como object URLs para no volver a pedirlos al cambiar de chat y
 * volver; con un tope, para no acumular memoria en una sesion larga.
 */
const MAX_EN_MEMORIA = 120;
const cache = new Map<string, Promise<string>>();

export function urlMediaMensaje(conversacionId: number, mensajeId: number): Promise<string> {
  const clave = `${conversacionId}:${mensajeId}`;
  const existente = cache.get(clave);
  if (existente) {
    // Se vuelve a poner al final: es el usado mas recientemente.
    cache.delete(clave);
    cache.set(clave, existente);
    return existente;
  }

  const promesa = api
    .blob(`/conversaciones/${conversacionId}/mensajes/${mensajeId}/media`)
    .then((b) => URL.createObjectURL(b));
  // Si falla, no queda guardado el error: se puede reintentar.
  promesa.catch(() => cache.delete(clave));
  cache.set(clave, promesa);

  if (cache.size > MAX_EN_MEMORIA) {
    const [masViejo] = cache.keys();
    if (masViejo) {
      void cache.get(masViejo)?.then((url) => URL.revokeObjectURL(url)).catch(() => undefined);
      cache.delete(masViejo);
    }
  }
  return promesa;
}
