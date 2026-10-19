import { api } from './api';

/**
 * Fotos de perfil de los chats, ya bajadas en esta pestaña (object URLs).
 * null = el contacto no tiene foto o la oculta: se muestran las iniciales.
 * El backend las guarda un dia, asi que en una sesion basta pedirlas una vez.
 */
const cache = new Map<number, Promise<string | null>>();

export function urlFotoChat(conversacionId: number): Promise<string | null> {
  const existente = cache.get(conversacionId);
  if (existente) return existente;
  const promesa = api
    .blob(`/conversaciones/${conversacionId}/foto`)
    .then((b) => (b.size > 0 ? URL.createObjectURL(b) : null))
    // Un fallo (sin conexion, numero caido) no se guarda: se reintenta la proxima vez.
    .catch(() => {
      cache.delete(conversacionId);
      return null;
    });
  cache.set(conversacionId, promesa);
  return promesa;
}
