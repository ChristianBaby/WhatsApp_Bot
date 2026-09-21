/**
 * Iconos del panel. Los trazos son los mismos de la maquetacion, extraidos
 * tal cual para que el peso visual no cambie. Todos heredan el color por
 * `color`, asi el llamador solo decide tamano y tono.
 */

export type NombreIcono =
  | 'conexion'
  | 'leads'
  | 'publicaciones'
  | 'reportes'
  | 'respuestas'
  | 'auto'
  | 'config'
  | 'subir'
  | 'check'
  | 'cerrar';

type Props = {
  nombre: NombreIcono;
  tamano?: number;
  color?: string;
  grosor?: number;
};

export function Icono({ nombre, tamano = 18, color = 'currentColor', grosor = 1.8 }: Props) {
  const comunes = {
    stroke: color,
    strokeWidth: grosor,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      {nombre === 'conexion' && (
        <path d="M9 12h6M9 9h.01M15 9h.01M4 6h16v9a2 2 0 0 1-2 2H8l-4 4V6Z" {...comunes} />
      )}

      {nombre === 'leads' && (
        <path
          d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
          {...comunes}
        />
      )}

      {nombre === 'publicaciones' && <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" {...comunes} />}

      {nombre === 'reportes' && <path d="M3 3v18h18M8 17V10M13 17V6M18 17v-4" {...comunes} />}

      {(nombre === 'respuestas' || nombre === 'auto') && (
        <path
          d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
          {...comunes}
          strokeWidth={nombre === 'auto' ? 1.7 : grosor}
        />
      )}

      {/* El rayo distingue "Auto-respuestas" del icono de chat normal. */}
      {nombre === 'auto' && (
        <path d="M13.4 7.8 9.6 12.6h2.8L11.6 16.4l3.9-4.9h-2.8L13.4 7.8Z" fill={color} stroke="none" />
      )}

      {nombre === 'config' && (
        <>
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" {...comunes} />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
            {...comunes}
            strokeWidth={1.6}
          />
        </>
      )}

      {nombre === 'subir' && <path d="M12 16V4M12 4 7 9M12 4l5 5M5 20h14" {...comunes} />}

      {nombre === 'check' && <path d="M20 6 9 17l-5-5" {...comunes} strokeWidth={2.2} />}

      {nombre === 'cerrar' && <path d="M18 6 6 18M6 6l12 12" {...comunes} />}
    </svg>
  );
}
