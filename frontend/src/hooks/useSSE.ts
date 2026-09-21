import { useEffect, useRef } from 'react';

type ManejadoresSSE = Record<string, (datos: unknown) => void>;

/**
 * Se suscribe al canal de eventos en vivo del backend (/api/eventos).
 * Reutilizable por cualquier pantalla: Conexion la usa para QR y estado de
 * numeros; Publicaciones, Respuestas, etc. la reusaran para su propio canal.
 *
 * Los manejadores se guardan en un ref para no tener que recrear la
 * conexion cada vez que el componente vuelve a renderizar.
 */
export function useSSE(canales: string[], manejadores: ManejadoresSSE): void {
  const manejadoresRef = useRef(manejadores);
  manejadoresRef.current = manejadores;

  const claveCanal = canales.join(',');

  useEffect(() => {
    if (!claveCanal) return;

    const fuente = new EventSource(`/api/eventos?canales=${claveCanal}`);
    const listeners: Array<[string, (e: MessageEvent) => void]> = [];

    for (const evento of Object.keys(manejadoresRef.current)) {
      const listener = (e: MessageEvent) => {
        const datos = e.data ? JSON.parse(e.data) : null;
        manejadoresRef.current[evento]?.(datos);
      };
      fuente.addEventListener(evento, listener);
      listeners.push([evento, listener]);
    }

    return () => {
      for (const [evento, listener] of listeners) fuente.removeEventListener(evento, listener);
      fuente.close();
    };
  }, [claveCanal]);
}
