import { useState } from 'react';
import { Boton } from '../components/ui/Boton';
import { GATEWAY_URL, guardarSesion, type Usuario } from '../lib/authSession';
import estilos from './Login.module.css';

type RespuestaLoginOk = {
  success: true;
  data: {
    usuario: Record<string, unknown> & { id?: string; email?: string; rol?: { nombre?: string } | string };
    accessToken: string;
    refreshToken: string;
  };
};

type RespuestaLoginError = {
  success: false;
  message?: string;
  error?: string;
  attemptsLeft?: number;
  retryAfter?: number;
};

/** Arma el nombre a mostrar sin asumir si la cuenta vive en `usuarios` (empleado) o `usuarios_externos`. */
function nombreDeUsuario(u: Record<string, unknown>): string | undefined {
  const nombre = (u.nombre as string) || (u.nombres as string);
  const apellido = (u.apellido_paterno as string) || (u.apellidos as string);
  const completo = [nombre, apellido].filter(Boolean).join(' ');
  return completo || undefined;
}

export function Login() {
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [recordar, setRecordar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    if (!email.trim() || !contrasena) return;
    setEnviando(true);
    setError(null);

    try {
      const res = await fetch(`${GATEWAY_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: contrasena, rememberMe: recordar }),
      });
      const cuerpo = (await res.json()) as RespuestaLoginOk | RespuestaLoginError;

      if (!res.ok || !cuerpo.success) {
        const fallo = cuerpo as RespuestaLoginError;
        if (fallo.error === 'RATE_LIMIT_EXCEEDED') {
          setError('Demasiados intentos. Espera un momento e intenta de nuevo.');
        } else {
          setError(fallo.message || 'Correo o contraseña incorrectos');
        }
        setEnviando(false);
        return;
      }

      const { usuario, accessToken, refreshToken } = cuerpo.data;
      const rol = typeof usuario.rol === 'string' ? usuario.rol : usuario.rol?.nombre;
      const usuarioNormalizado: Usuario = {
        id: String(usuario.id ?? ''),
        email: usuario.email as string | undefined,
        nombre: nombreDeUsuario(usuario),
        rol,
      };

      guardarSesion({ accessToken, refreshToken, usuario: usuarioNormalizado }, recordar);
      window.location.href = '/';
    } catch {
      setError('No se pudo conectar con el servidor de acceso');
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
            <label className={estilos.etiqueta} htmlFor="email">
              Correo
            </label>
            <input
              id="email"
              type="email"
              className={estilos.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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

          <label className={estilos.recordar}>
            <input
              type="checkbox"
              checked={recordar}
              onChange={(e) => setRecordar(e.target.checked)}
              disabled={enviando}
            />
            Mantener sesión iniciada en este dispositivo
          </label>

          {error && <div className={estilos.error}>{error}</div>}

          <Boton ancho disabled={enviando || !email.trim() || !contrasena} type="submit">
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </Boton>
        </form>
      </div>
    </div>
  );
}
