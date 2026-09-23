import { Boton } from './Boton';

type Props = {
  texto: string;
  disabled?: boolean;
};

/** Boton "Continuar con Google": arranca el flujo OAuth (seccion 8.5). Sirve tanto para entrar como para registrarse. */
export function BotonGoogle({ texto, disabled }: Props) {
  return (
    <Boton
      variante="secundario"
      ancho
      type="button"
      disabled={disabled}
      onClick={() => {
        window.location.href = '/api/auth/google';
      }}
    >
      <IconoGoogle />
      {texto}
    </Boton>
  );
}

/** Logo oficial de Google: son 4 colores fijos, no pasa por el sistema de tokens. */
function IconoGoogle() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.95 10.7a5.4 5.4 0 0 1 0-3.4V4.97H.9a9 9 0 0 0 0 8.06l3.05-2.33Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}
