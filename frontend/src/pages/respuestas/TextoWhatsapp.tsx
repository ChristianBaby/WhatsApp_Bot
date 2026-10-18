import type { ReactNode } from 'react';
import estilos from './DetalleConversacion.module.css';

/**
 * Texto de un mensaje con el formato de WhatsApp:
 *   *negrita*  _cursiva_  ~tachado~  `codigo`  ```bloque de codigo```
 *   > cita (al inicio de la linea)
 * y los enlaces clicables. Como en WhatsApp, un marcador solo cuenta si
 * esta pegado al texto y no en medio de una palabra (2*3*4 no es negrita).
 */

const PATRON_URL = /(https?:\/\/[^\s]+)/g;
const BLOQUE_CODIGO = /```([\s\S]+?)```/g;

// Un grupo por formato; el borde de palabra se controla con lookbehind/lookahead.
const FORMATO =
  /`([^`\n]+)`|(?<![\p{L}\p{N}_*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\p{L}\p{N}_*])|(?<![\p{L}\p{N}_])_(?=\S)([^_\n]+?)(?<=\S)_(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_~])~(?=\S)([^~\n]+?)(?<=\S)~(?![\p{L}\p{N}_~])/gu;

function conFormato(texto: string, clave: string): ReactNode[] {
  const partes: ReactNode[] = [];
  let desde = 0;
  let n = 0;
  for (const m of texto.matchAll(FORMATO)) {
    const inicio = m.index ?? 0;
    if (inicio > desde) partes.push(texto.slice(desde, inicio));
    const k = `${clave}-${n++}`;
    const [, codigo, negrita, cursiva, tachado] = m;
    if (codigo !== undefined) partes.push(<code key={k} className={estilos.codigo}>{codigo}</code>);
    else if (negrita !== undefined) partes.push(<strong key={k}>{conFormato(negrita, k)}</strong>);
    else if (cursiva !== undefined) partes.push(<em key={k}>{conFormato(cursiva, k)}</em>);
    else if (tachado !== undefined) partes.push(<s key={k}>{conFormato(tachado, k)}</s>);
    desde = inicio + m[0].length;
  }
  if (desde < texto.length) partes.push(texto.slice(desde));
  return partes;
}

function conEnlaces(texto: string, clave: string): ReactNode[] {
  return texto.split(PATRON_URL).flatMap((parte, i): ReactNode[] =>
    /^https?:\/\//.test(parte)
      ? [
          <a key={`${clave}-u${i}`} href={parte} target="_blank" rel="noreferrer" className={estilos.enlace}>
            {parte}
          </a>,
        ]
      : conFormato(parte, `${clave}-t${i}`),
  );
}

/** Lineas que empiezan con "> " se agrupan en una cita. */
function conCitas(texto: string, clave: string): ReactNode[] {
  const lineas = texto.split('\n');
  const resultado: ReactNode[] = [];
  let i = 0;
  while (i < lineas.length) {
    if (lineas[i]!.startsWith('> ')) {
      const citadas: string[] = [];
      while (i < lineas.length && lineas[i]!.startsWith('> ')) citadas.push(lineas[i++]!.slice(2));
      resultado.push(
        <div key={`${clave}-c${i}`} className={estilos.citaTexto}>
          {conEnlaces(citadas.join('\n'), `${clave}-c${i}`)}
        </div>,
      );
      continue;
    }
    const sueltas: string[] = [];
    while (i < lineas.length && !lineas[i]!.startsWith('> ')) sueltas.push(lineas[i++]!);
    resultado.push(...conEnlaces(sueltas.join('\n'), `${clave}-l${i}`));
  }
  return resultado;
}

export function TextoWhatsapp({ texto }: { texto: string }) {
  const partes: ReactNode[] = [];
  let desde = 0;
  let n = 0;
  for (const m of texto.matchAll(BLOQUE_CODIGO)) {
    const inicio = m.index ?? 0;
    if (inicio > desde) partes.push(...conCitas(texto.slice(desde, inicio), `b${n}`));
    partes.push(
      <pre key={`pre${n}`} className={estilos.bloqueCodigo}>
        {m[1]}
      </pre>,
    );
    n++;
    desde = inicio + m[0].length;
  }
  if (desde < texto.length) partes.push(...conCitas(texto.slice(desde), `b${n}`));
  return <>{partes}</>;
}

const SOLO_EMOJIS = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\s)+$/u;
const MAX_EMOJIS_GRANDES = 3;

/** Como en WhatsApp: un mensaje de 1 a 3 emojis solos se ve en grande. */
export function esEmojiGrande(texto: string): boolean {
  const limpio = texto.trim();
  if (!limpio || !SOLO_EMOJIS.test(limpio) || /^[\d#*\s]+$/.test(limpio)) return false;
  const segmentador = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const cantidad = [...segmentador.segment(limpio.replace(/\s/g, ''))].length;
  return cantidad <= MAX_EMOJIS_GRANDES;
}
