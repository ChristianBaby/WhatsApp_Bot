import { useState } from 'react';
import { Boton } from '../components/ui/Boton';
import { api, ErrorApi } from '../lib/api';
import estilos from './Login.module.css';

export function Login() {
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    if (!usuario.trim() || !contrasena) return;
    setEnviando(true);
    setError(null);
    try {
      await api.post('/auth/login', { usuario: usuario.trim(), contrasena });
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo iniciar sesión');
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
            <label className={estilos.etiqueta} htmlFor="usuario">
              Usuario
            </label>
            <input
              id="usuario"
              className={estilos.input}
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoFocus
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

          <Boton ancho disabled={enviando || !usuario.trim() || !contrasena} type="submit">
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </Boton>
        </form>
      </div>
    </div>
  );
}
