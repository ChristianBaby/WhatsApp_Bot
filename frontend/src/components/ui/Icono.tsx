/**
 * Iconos del panel (trazo 24x24, estilo lineal). Todos heredan el color por
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
  | 'cerrar'
  | 'sol'
  | 'luna'
  | 'campana'
  | 'salir'
  | 'colapsar'
  | 'expandir'
  | 'chevronAbajo'
  | 'mas'
  | 'descargar'
  | 'ojo'
  | 'responder'
  | 'reloj'
  | 'baja'
  | 'checkDoble'
  | 'trofeo'
  | 'tendencia'
  | 'chispa'
  | 'telefono'
  | 'qr'
  | 'archivo'
  | 'embudo'
  | 'bandeja';

type Props = {
  nombre: NombreIcono;
  tamano?: number;
  color?: string;
  grosor?: number;
};

/** Trazos simples: un solo path (o varios separados por M) por icono. */
const TRAZOS: Partial<Record<NombreIcono, string>> = {
  conexion: 'M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01',
  leads:
    'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  publicaciones: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z',
  reportes: 'M3 3v18h18M8 17V10M13 17V6M18 17v-4',
  respuestas:
    'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z',
  subir: 'M12 16V4M12 4 7 9M12 4l5 5M5 20h14',
  cerrar: 'M18 6 6 18M6 6l12 12',
  luna: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z',
  campana: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  salir: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  colapsar: 'M11 17l-5-5 5-5M18 17l-5-5 5-5',
  expandir: 'M13 17l5-5-5-5M6 17l5-5-5-5',
  chevronAbajo: 'M6 9l6 6 6-6',
  mas: 'M12 5v14M5 12h14',
  descargar: 'M12 4v12M12 16l-5-5M12 16l5-5M5 20h14',
  responder: 'M9 17 4 12l5-5M20 18v-2a4 4 0 0 0-4-4H4',
  baja: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 11h6',
  checkDoble: 'M2 12.5 6.5 17 15 7.5M11.5 16l1 1L22 7.5',
  tendencia: 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
  telefono:
    'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3',
  archivo: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  embudo: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  bandeja:
    'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z',
};

export function Icono({ nombre, tamano = 18, color = 'currentColor', grosor = 1.8 }: Props) {
  const comunes = {
    stroke: color,
    strokeWidth: grosor,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  const trazo = TRAZOS[nombre];

  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      {trazo && <path d={trazo} {...comunes} />}

      {nombre === 'auto' && (
        <>
          <path d="M12 8V4H8" {...comunes} />
          <rect x="4" y="8" width="16" height="12" rx="3" {...comunes} />
          <path d="M2 14h2M20 14h2M9.5 13.5v1M14.5 13.5v1" {...comunes} />
        </>
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

      {nombre === 'check' && <path d="M20 6 9 17l-5-5" {...comunes} strokeWidth={2.2} />}

      {nombre === 'sol' && (
        <>
          <circle cx="12" cy="12" r="4" {...comunes} />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
            {...comunes}
          />
        </>
      )}

      {nombre === 'ojo' && (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" {...comunes} />
          <circle cx="12" cy="12" r="3" {...comunes} />
        </>
      )}

      {nombre === 'reloj' && (
        <>
          <circle cx="12" cy="12" r="9" {...comunes} />
          <path d="M12 7v5l3 2" {...comunes} />
        </>
      )}

      {nombre === 'trofeo' && (
        <path
          d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM17 5h2.5a1.5 1.5 0 0 1 0 3.5H17M7 5H4.5a1.5 1.5 0 0 0 0 3.5H7"
          {...comunes}
        />
      )}

      {nombre === 'chispa' && (
        <path
          d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"
          {...comunes}
        />
      )}
    </svg>
  );
}
