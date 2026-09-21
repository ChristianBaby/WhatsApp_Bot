import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { IndicadoresSidebar } from '../layout/Sidebar';

/**
 * Estado transversal que alimenta los indicadores del sidebar.
 *
 * Arranca en cero y se va llenando a medida que las fases conectan sus
 * endpoints. Preferimos mostrar cero real antes que un numero inventado:
 * un badge que miente es peor que un badge vacio.
 */

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

export function useEstadoPanel(): IndicadoresSidebar {
  const [resumen, setResumen] = useState<ResumenPanel>(INICIAL);

  useEffect(() => {
    let vigente = true;

    // TODO(Fase 1): reemplazar este sondeo por el canal SSE /api/eventos,
    // que ya avisa de cambios de estado sin tener que preguntar.
    const cargar = () =>
      api
        .get<ResumenPanel>('/resumen')
        .then((datos) => {
          if (vigente) setResumen(datos);
        })
        .catch(() => {
          /* El endpoint llega en la Fase 1; hasta entonces, cero. */
        });

    void cargar();
    const intervalo = setInterval(cargar, 15_000);

    return () => {
      vigente = false;
      clearInterval(intervalo);
    };
  }, []);

  return {
    ...resumen,
    textoPie: resumen.hayNumeroConectado ? 'WhatsApp conectado' : 'WhatsApp desconectado',
  };
}
