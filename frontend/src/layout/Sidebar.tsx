import { NavLink } from 'react-router-dom';
import { Icono, type NombreIcono } from '../components/ui/Icono';
import { SECCIONES, type SeccionId } from '../lib/rutas';
import estilos from './Sidebar.module.css';

/**
 * Indicadores en vivo del sidebar. Los alimenta el estado global del panel
 * (SSE); mientras una fase no exista todavia, su indicador simplemente no
 * se muestra — nunca se inventan numeros.
 */
export type IndicadoresSidebar = {
  hayNumeroConectado: boolean;
  publicacionesEnCurso: number;
  respuestasNoLeidas: number;
  autoRespuestasActivas: boolean;
  textoPie: string;
};

const ICONOS: Record<SeccionId, NombreIcono> = {
  conexion: 'conexion',
  leads: 'leads',
  publicaciones: 'publicaciones',
  reportes: 'reportes',
  respuestas: 'respuestas',
  auto: 'auto',
  config: 'config',
};

type Props = {
  indicadores: IndicadoresSidebar;
  usuario: string | null;
  onCerrarSesion: () => void;
};

export function Sidebar({ indicadores, usuario, onCerrarSesion }: Props) {
  const {
    hayNumeroConectado,
    publicacionesEnCurso,
    respuestasNoLeidas,
    autoRespuestasActivas,
    textoPie,
  } = indicadores;

  return (
    <aside className={estilos.sidebar}>
      <div className={estilos.marca}>
        <img src="/logo.png" alt="Universoft Systems" className={estilos.logo} />
        <span className={estilos.subtitulo}>Bot de WhatsApp</span>
      </div>

      <nav className={estilos.nav}>
        {SECCIONES.map((seccion) => (
          <NavLink
            key={seccion.id}
            to={seccion.ruta}
            className={({ isActive }) => `${estilos.item} ${isActive ? estilos.activo : ''}`}
          >
            {({ isActive }) => (
              <>
                <Icono
                  nombre={ICONOS[seccion.id]}
                  color={isActive ? 'var(--acento)' : 'var(--texto-tenue)'}
                />
                <span className={estilos.etiqueta}>{seccion.etiqueta}</span>

                {seccion.id === 'conexion' && hayNumeroConectado && (
                  <span
                    className={estilos.punto}
                    style={{ background: 'var(--exito-punto)' }}
                    title="Hay al menos un numero conectado"
                  />
                )}

                {seccion.id === 'publicaciones' && (
                  <span
                    className={estilos.contador}
                    style={{
                      background: publicacionesEnCurso > 0 ? 'var(--exito-fondo)' : 'var(--fondo-neutro)',
                      color: publicacionesEnCurso > 0 ? 'var(--exito)' : 'var(--texto-tenue-2)',
                    }}
                    title="Publicaciones enviandose ahora"
                  >
                    {publicacionesEnCurso}
                  </span>
                )}

                {seccion.id === 'respuestas' && respuestasNoLeidas > 0 && (
                  <span className={estilos.noLeidos} title="Respuestas sin leer">
                    {respuestasNoLeidas}
                  </span>
                )}

                {seccion.id === 'auto' && (
                  <span
                    className={estilos.punto}
                    style={{
                      background: autoRespuestasActivas ? 'var(--exito-punto)' : 'var(--inactivo)',
                    }}
                    title={autoRespuestasActivas ? 'Auto-responder activado' : 'Auto-responder desactivado'}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className={estilos.pie}>
        <span
          className={estilos.piePunto}
          style={{ background: hayNumeroConectado ? 'var(--exito-punto)' : 'var(--alerta-punto)' }}
        />
        <span className={estilos.pieTexto}>{textoPie}</span>
      </div>

      <button className={estilos.filaUsuario} onClick={onCerrarSesion} title="Cerrar sesión">
        <span className={estilos.usuarioTexto}>{usuario}</span>
        <span className={estilos.cerrarSesionTexto}>Cerrar sesión</span>
      </button>
    </aside>
  );
}
