import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { GATEWAY_URL } from '../lib/authSession';

type ManejadoresSSE = Record<string, (datos: unknown) => void>;

/**
 * Se suscribe al canal de eventos en vivo del backend (/api/eventos).
 * Reutilizable por cualquier pantalla: Conexion la usa para QR y estado de
 * numeros; Publicaciones, Respuestas, etc. la reusaran para su propio canal.
 *
 * EventSource no puede mandar Authorization, asi que cada conexion (y cada
 * reconexion) pide primero un ticket de un solo uso vía el Gateway (con el
 * Bearer normal) y lo manda como query param — por eso la reconexion la
 * manejamos a mano en vez de dejarsela al reintento nativo de EventSource,
 * que reusaria un ticket ya consumido.
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

    let cerrado = false;
    let fuente: EventSource | null = null;
    let reintentoId: ReturnType<typeof setTimeout> | undefined;

    async function conectar() {
      if (cerrado) return;
      try {
        const { ticket } = await api.post<{ ticket: string }>('/sse-ticket');
        if (cerrado) return;

        fuente = new EventSource(
          `${GATEWAY_URL}/api/whatsapp/eventos?ticket=${encodeURIComponent(ticket)}&canales=${encodeURIComponent(claveCanal)}`,
        );

        for (const evento of Object.keys(manejadoresRef.current)) {
          fuente.addEventListener(evento, (e) => {
            const datos = e.data ? JSON.parse(e.data) : null;
            manejadoresRef.current[evento]?.(datos);
          });
        }

        fuente.onerror = () => {
          fuente?.close();
          fuente = null;
          if (!cerrado) reintentoId = setTimeout(() => void conectar(), 3000);
        };
      } catch {
        if (!cerrado) reintentoId = setTimeout(() => void conectar(), 3000);
      }
    }

    void conectar();

    return () => {
      cerrado = true;
      if (reintentoId) clearTimeout(reintentoId);
      fuente?.close();
    };
  }, [claveCanal]);
}
