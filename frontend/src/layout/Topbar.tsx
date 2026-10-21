import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icono } from '../components/ui/Icono';
import { useTema } from '../hooks/useTema';
import { seccionDeRuta } from '../lib/rutas';
import type { Usuario } from '../hooks/useAuth';
import type { IndicadoresSidebar } from './Sidebar';
import estilos from './Topbar.module.css';

type Props = {
  indicadores: IndicadoresSidebar;
  usuario: Usuario | null;
  onCerrarSesion: () => void;
};

/** "Christian Pumaccahua" -> "CP"; un correo -> su primera letra. */
function iniciales(texto: string): string {
  const partes = texto
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean);
  const [a = '?', b = ''] = partes;
  const letras = b ? a.charAt(0) + b.charAt(0) : a.slice(0, 2);
  return letras.toUpperCase();
}

/** "cHRISTIAN pumaccahua" -> "Christian Pumaccahua" (los nombres llegan como se escribieron al registrarse). */
function capitalizar(texto: string): string {
  return texto
    .toLowerCase()
    .split(' ')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

/**
 * Barra superior: en que seccion estas, estado del canal, accesos rapidos
 * (chats sin leer, tema) y el menu de la cuenta.
 */
export function Topbar({ indicadores, usuario, onCerrarSesion }: Props) {
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const { tema, alternar } = useTema();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const seccion = seccionDeRuta(pathname);
  const nombre = usuario?.nombre ? capitalizar(usuario.nombre) : usuario?.email || 'Mi cuenta';
  const { hayNumeroConectado, respuestasNoLeidas } = indicadores;

  useEffect(() => {
    if (!menuAbierto) return;
    const alClic = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAbierto(false);
    };
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuAbierto(false);
    };
    document.addEventListener('mousedown', alClic);
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('mousedown', alClic);
      document.removeEventListener('keydown', alTecla);
    };
  }, [menuAbierto]);

  return (
    <header className={estilos.barra}>
      <div className={estilos.migas}>
        <span className={estilos.migaRaiz}>Universoft CRM</span>
        {seccion && (
          <>
            <span className={estilos.separador}>/</span>
            <span className={estilos.migaActual}>{seccion.etiqueta}</span>
          </>
        )}
      </div>

      <div className={estilos.derecha}>
        <button
          type="button"
          className={`${estilos.estado} ${hayNumeroConectado ? estilos.estadoOk : estilos.estadoAviso}`}
          onClick={() => navegar('/conexion')}
          title="Ver la conexión de WhatsApp"
        >
          <span className={estilos.estadoPunto} />
          {hayNumeroConectado ? 'WhatsApp en línea' : 'WhatsApp sin conexión'}
        </button>

        <button
          type="button"
          className={estilos.botonIcono}
          onClick={() => navegar('/respuestas')}
          title={respuestasNoLeidas > 0 ? `${respuestasNoLeidas} chats sin leer` : 'Sin chats pendientes'}
          aria-label="Chats sin leer"
        >
          <Icono nombre="campana" tamano={18} />
          {respuestasNoLeidas > 0 && (
            <span className={estilos.burbuja}>{respuestasNoLeidas > 99 ? '99+' : respuestasNoLeidas}</span>
          )}
        </button>

        <button
          type="button"
          className={estilos.botonIcono}
          onClick={alternar}
          title={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          aria-label={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          <Icono nombre={tema === 'oscuro' ? 'sol' : 'luna'} tamano={18} />
        </button>

        <span className={estilos.divisor} />

        <div className={estilos.cuenta} ref={menuRef}>
          <button
            type="button"
            className={estilos.botonCuenta}
            onClick={() => setMenuAbierto((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuAbierto}
          >
            <span className={estilos.avatar}>{iniciales(nombre)}</span>
            <span className={estilos.cuentaTexto}>
              <span className={estilos.cuentaNombre}>{nombre}</span>
              {usuario?.rol && <span className={estilos.cuentaRol}>{usuario.rol}</span>}
            </span>
            <Icono nombre="chevronAbajo" tamano={15} color="var(--texto-tenue)" />
          </button>

          {menuAbierto && (
            <div className={estilos.menu} role="menu">
              <div className={estilos.menuCabecera}>
                <span className={`${estilos.avatar} ${estilos.avatarGrande}`}>{iniciales(nombre)}</span>
                <span className={estilos.menuDatos}>
                  <span className={estilos.cuentaNombre}>{nombre}</span>
                  {usuario?.email && <span className={estilos.menuCorreo}>{usuario.email}</span>}
                </span>
              </div>
              <button
                type="button"
                role="menuitem"
                className={estilos.menuItem}
                onClick={() => {
                  setMenuAbierto(false);
                  navegar('/configuracion');
                }}
              >
                <Icono nombre="config" tamano={16} />
                Configuración
              </button>
              <button
                type="button"
                role="menuitem"
                className={`${estilos.menuItem} ${estilos.menuPeligro}`}
                onClick={onCerrarSesion}
              >
                <Icono nombre="salir" tamano={16} />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
