import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Boton } from '../components/ui/Boton';
import { BotonGoogle } from '../components/ui/BotonGoogle';
import { api, ErrorApi } from '../lib/api';
import estilos from './Login.module.css';

export function Registro() {
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleDisponible, setGoogleDisponible] = useState(false);

  useEffect(() => {
    api
      .get<{ googleDisponible: boolean }>('/auth/config')
      .then((cfg) => setGoogleDisponible(cfg.googleDisponible))
      .catch(() => setGoogleDisponible(false));
  }, []);

  const completo = nombre.trim() && apellido.trim() && email.trim() && contrasena.length >= 8;

  async function enviar() {
    if (!completo) return;
    setEnviando(true);
    setError(null);
    try {
      await api.post('/auth/registro', {
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.trim(),
        contrasena,
      });
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo crear la cuenta');
      setEnviando(false);
    }
  }

  return (
    <div className={estilos.pantalla}>
      <div className={estilos.tarjeta}>
        <div className={estilos.logo}>
          <img src="/logo.png" alt="Universoft Systems" className={estilos.logoImg} />
          <span className={estilos.subtitulo}>Bot de WhatsApp</span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          <div className={estilos.campo}>
            <label className={estilos.etiqueta} htmlFor="nombre">
              Nombre
            </label>
            <input
              id="nombre"
              className={estilos.input}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
              disabled={enviando}
            />
          </div>

          <div className={estilos.campo}>
            <label className={estilos.etiqueta} htmlFor="apellido">
              Apellido
            </label>
            <input
              id="apellido"
              className={estilos.input}
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              disabled={enviando}
            />
          </div>

          <div className={estilos.campo}>
            <label className={estilos.etiqueta} htmlFor="email">
              Correo
            </label>
            <input
              id="email"
              type="email"
              className={estilos.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={enviando}
            />
          </div>

          <div className={estilos.campo}>
            <label className={estilos.etiqueta} htmlFor="contrasena">
              Contraseña
            </label>
            <input
              id="contrasena"
              type="password"
              className={estilos.input}
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              disabled={enviando}
            />
          </div>

          {error && <div className={estilos.error}>{error}</div>}

          <Boton ancho disabled={enviando || !completo} type="submit">
            {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
          </Boton>
        </form>

        {googleDisponible && (
          <>
            <div className={estilos.separador}>
              <span>o</span>
            </div>
            <BotonGoogle texto="Continuar con Google" disabled={enviando} />
          </>
        )}

        <p className={estilos.pieEnlace}>
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
}
