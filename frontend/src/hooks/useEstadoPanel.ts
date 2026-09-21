import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSSE } from './useSSE';
import type { IndicadoresSidebar } from '../layout/Sidebar';

type ResumenPanel = {
  hayNumeroConectado: boolean;
  publicacionesEnCurso: number;
  respuestasNoLeidas: number;
  autoRespuestasActivas: boolean;
};

const INICIAL: ResumenPanel = {
  hayNumeroConectado: false,
  publicacionesEnCurso: 0,
  respuestasNoLeidas: 0,
  autoRespuestasActivas: false,
};

/** Estado transversal que alimenta los indicadores del sidebar. */
export function useEstadoPanel(): IndicadoresSidebar {
  const [resumen, setResumen] = useState<ResumenPanel>(INICIAL);

  const cargar = () => {
    api
      .get<ResumenPanel>('/resumen')
      .then(setResumen)
      .catch(() => {
        /* Si /api aun no responde (ej. arrancando), se queda en el valor inicial. */
      });
  };

  useEffect(() => {
    cargar();
  }, []);

  // Los numeros cambian de estado en vivo (QR escaneado, sesion caida...).
  // En vez de duplicar esa logica aqui, simplemente volvemos a pedir el
  // resumen cuando algo cambia — un solo lugar calcula "hay conectado".
  useSSE(['numeros'], {
    'numero:actualizado': cargar,
  });

  return {
    ...resumen,
    textoPie: resumen.hayNumeroConectado ? 'WhatsApp conectado' : 'WhatsApp desconectado',
  };
}
