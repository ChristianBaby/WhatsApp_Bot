import { env } from '../../config/env.js';

const URL_AUTORIZACION = 'https://accounts.google.com/o/oauth2/v2/auth';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
// Verifica firma, emisor y vigencia del id_token del lado de Google, asi
// no hace falta traer una libreria de JWT/JWKS solo para esto.
const URL_TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';

export function construirUrlAutorizacion(state: string): string {
  const parametros = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.googleRedirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `${URL_AUTORIZACION}?${parametros.toString()}`;
}

export type PerfilGoogle = { googleId: string; email: string; nombre: string; apellido: string };

/**
 * Cambia el "code" de la redireccion de Google por la identidad de la
 * cuenta. Lanza si el intercambio falla o si el correo no esta verificado
 * (una cuenta de Google sin verificar no es una identidad confiable).
 */
export async function obtenerPerfilGoogle(code: string): Promise<PerfilGoogle> {
  const resToken = await fetch(URL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.googleRedirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!resToken.ok) throw new Error(`Google rechazo el intercambio de codigo (${resToken.status})`);
  const { id_token: idToken } = (await resToken.json()) as { id_token?: string };
  if (!idToken) throw new Error('Google no devolvio id_token');

  const resInfo = await fetch(`${URL_TOKENINFO}?id_token=${encodeURIComponent(idToken)}`);
  if (!resInfo.ok) throw new Error('No se pudo verificar el id_token con Google');
  const claims = (await resInfo.json()) as {
    aud?: string;
    sub?: string;
    email?: string;
    email_verified?: string;
    given_name?: string;
    family_name?: string;
    name?: string;
  };

  if (claims.aud !== env.GOOGLE_CLIENT_ID) throw new Error('El id_token no es para esta aplicacion');
  if (!claims.sub || !claims.email) throw new Error('El id_token no trae sub/email');
  if (claims.email_verified !== 'true') throw new Error('El correo de Google no esta verificado');

  // Si el perfil de Google no trae nombre/apellido por separado (poco
  // comun, pero pasa), se reparte "name" como mejor esfuerzo.
  const [nombreDeName, ...restoDeName] = (claims.name ?? '').trim().split(/\s+/).filter(Boolean);
  const nombre = claims.given_name?.trim() || nombreDeName || '';
  const apellido = claims.family_name?.trim() || restoDeName.join(' ') || '';

  return { googleId: claims.sub, email: claims.email, nombre, apellido };
}
