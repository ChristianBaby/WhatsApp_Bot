import { NavLink } from 'react-router-dom';
import { Icono, type NombreIcono } from '../components/ui/Icono';
import { GRUPOS, SECCIONES, type SeccionId } from '../lib/rutas';
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
  compacto: boolean;
  onAlternarCompacto: () => void;
};

export function Sidebar({ indicadores, compacto, onAlternarCompacto }: Props) {
  const { hayNumeroConectado, publicacionesEnCurso, respuestasNoLeidas, autoRespuestasActivas, textoPie } = indicadores;

  /** El indicador a la derecha de cada item (o en la esquina del icono, si esta compacto). */
  function indicador(id: SeccionId) {
    if (id === 'respuestas' && respuestasNoLeidas > 0) {
      return (
        <span className={`${estilos.contador} ${estilos.contadorAlerta}`} title="Chats sin leer">
          {respuestasNoLeidas > 99 ? '99+' : respuestasNoLeidas}
        </span>
      );
    }
    if (id === 'publicaciones' && publicacionesEnCurso > 0) {
      return (
        <span className={`${estilos.contador} ${estilos.contadorVivo}`} title="Publicaciones enviándose ahora">
          {publicacionesEnCurso}
        </span>
      );
    }
    if (id === 'conexion') {
      return (
        <span
          className={estilos.punto}
          style={{ background: hayNumeroConectado ? 'var(--exito-punto)' : 'var(--alerta-punto)' }}
          title={hayNumeroConectado ? 'Hay al menos un número conectado' : 'Ningún número conectado'}
        />
      );
    }
    if (id === 'auto') {
      return (
        <span
          className={estilos.punto}
          style={{ background: autoRespuestasActivas ? 'var(--exito-punto)' : 'var(--sidebar-texto-tenue)' }}
          title={autoRespuestasActivas ? 'Auto-responder activado' : 'Auto-responder desactivado'}
        />
      );
    }
    return null;
  }

  return (
    <aside className={`${estilos.sidebar} ${compacto ? estilos.compacto : ''}`}>
      <div className={estilos.marca}>
        <span className={estilos.logoCaja}>
          <img src="/logo-simbolo.png" alt="" className={estilos.logo} />
        </span>
        <span className={estilos.marcaTexto}>
          <span className={estilos.marcaNombre}>Universoft</span>
          <span className={estilos.marcaProducto}>CRM · WhatsApp</span>
        </span>
      </div>

      <nav className={`${estilos.nav} scroll`} aria-label="Secciones">
        {GRUPOS.map((grupo) => (
          <div className={estilos.grupo} key={grupo}>
            <div className={estilos.grupoTitulo}>{grupo}</div>
            {SECCIONES.filter((s) => s.grupo === grupo).map((seccion) => (
              <NavLink
                key={seccion.id}
                to={seccion.ruta}
                title={compacto ? seccion.etiqueta : undefined}
                className={({ isActive }) => `${estilos.item} ${isActive ? estilos.activo : ''}`}
              >
                <span className={estilos.iconoCaja}>
                  <Icono nombre={ICONOS[seccion.id]} tamano={19} />
                </span>
                <span className={estilos.etiqueta}>{seccion.etiqueta}</span>
                {indicador(seccion.id)}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className={estilos.pie}>
        <div className={estilos.estado} title={compacto ? textoPie : undefined}>
          <span className={estilos.estadoIcono}>
            <Icono nombre="telefono" tamano={15} />
            <span
              className={estilos.estadoPunto}
              style={{ background: hayNumeroConectado ? 'var(--exito-punto)' : 'var(--alerta-punto)' }}
            />
          </span>
          <span className={estilos.estadoTexto}>
            <span className={estilos.estadoTitulo}>{textoPie}</span>
            <span className={estilos.estadoDetalle}>
              {hayNumeroConectado ? 'Listo para enviar y recibir' : 'Vincula un número en Conexión'}
            </span>
          </span>
        </div>

        <button
          type="button"
          className={estilos.botonCompacto}
          onClick={onAlternarCompacto}
          aria-label={compacto ? 'Expandir menú' : 'Contraer menú'}
          title={compacto ? 'Expandir menú' : 'Contraer menú'}
        >
          <Icono nombre={compacto ? 'expandir' : 'colapsar'} tamano={16} />
          <span className={estilos.etiqueta}>Contraer menú</span>
        </button>
      </div>
    </aside>
  );
}
