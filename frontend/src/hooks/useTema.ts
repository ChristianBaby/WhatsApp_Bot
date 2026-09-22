import { useCallback, useEffect, useState } from 'react';

export type Tema = 'claro' | 'oscuro';

const CLAVE_TEMA = 'tema';
const CLAVE_MANUAL = 'tema_manual';

/** El valor que el script inline de index.html ya dejo puesto en <html> al cargar. */
function leerTemaActual(): Tema {
  return document.documentElement.getAttribute('data-tema') === 'oscuro' ? 'oscuro' : 'claro';
}

function aplicarTema(tema: Tema): void {
  document.documentElement.setAttribute('data-tema', tema);
}

/**
 * Tema claro/oscuro del panel. El primer valor ya lo resolvio el script
 * inline de index.html (sin parpadeo); este hook solo le da control al
 * usuario y persiste su eleccion. Mientras no haya elegido a mano, sigue
 * la preferencia del sistema en vivo si cambia mientras el panel esta abierto.
 */
export function useTema() {
  const [tema, setTema] = useState<Tema>(leerTemaActual);

  useEffect(() => {
    const mediaOscuro = window.matchMedia('(prefers-color-scheme: dark)');
    const alCambiarSistema = (evento: MediaQueryListEvent) => {
      if (localStorage.getItem(CLAVE_MANUAL) === 'true') return; // el usuario ya eligio, no lo pisamos
      const siguiente: Tema = evento.matches ? 'oscuro' : 'claro';
      aplicarTema(siguiente);
      setTema(siguiente);
    };
    mediaOscuro.addEventListener('change', alCambiarSistema);
    return () => mediaOscuro.removeEventListener('change', alCambiarSistema);
  }, []);

  const alternar = useCallback(() => {
    setTema((actual) => {
      const siguiente: Tema = actual === 'oscuro' ? 'claro' : 'oscuro';
      aplicarTema(siguiente);
      try {
        localStorage.setItem(CLAVE_TEMA, siguiente);
        localStorage.setItem(CLAVE_MANUAL, 'true');
      } catch {
        /* localStorage bloqueado: el tema sigue funcionando, solo no se recuerda. */
      }
      return siguiente;
    });
  }, []);

  return { tema, alternar };
}
