import { useEffect, useRef, useState } from 'react';
import { Icono } from '../../components/ui/Icono';
import estilos from './VarianteMensaje.module.css';

const EMOJIS = [
  '👋', '😊', '🙌', '👍', '🎉', '🔥', '⭐', '✅',
  '📍', '📅', '📞', '💬', '📢', '🎁', '💰', '🛒',
  '🏆', '❤️', '😁', '👀', '⏰', '📈', '✨', '🙏',
];

type Props = {
  valor: string;
  onCambio: (valor: string) => void;
  variablesDisponibles: string[];
  placeholder?: string;
  onQuitar?: () => void;
};

/**
 * Una variante de mensaje: textarea + barra de formato estilo WhatsApp
 * (*negrita*, _cursiva_, ~tachado~), selector de variables del lead
 * ({empresa}, {rubro}, columnas libres del Excel) y un picker de emojis.
 * No es un editor WYSIWYG: inserta la sintaxis real de WhatsApp como texto,
 * que es justamente lo que hay que mandar para que WhatsApp lo renderice.
 */
export function VarianteMensaje({ valor, onCambio, variablesDisponibles, placeholder, onQuitar }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const [emojiAbierto, setEmojiAbierto] = useState(false);

  useEffect(() => {
    if (!emojiAbierto) return;
    function alClickFuera(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setEmojiAbierto(false);
    }
    document.addEventListener('mousedown', alClickFuera);
    return () => document.removeEventListener('mousedown', alClickFuera);
  }, [emojiAbierto]);

  function moverCursor(inicio: number, fin: number) {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(inicio, fin);
    });
  }

  function envolverSeleccion(marcador: string) {
    const el = textareaRef.current;
    if (!el) return;
    const inicio = el.selectionStart;
    const fin = el.selectionEnd;
    const seleccionado = valor.slice(inicio, fin) || 'texto';
    const nuevo = `${valor.slice(0, inicio)}${marcador}${seleccionado}${marcador}${valor.slice(fin)}`;
    onCambio(nuevo);
    moverCursor(inicio + marcador.length, inicio + marcador.length + seleccionado.length);
  }

  function insertarEnCursor(texto: string) {
    const el = textareaRef.current;
    const inicio = el?.selectionStart ?? valor.length;
    const fin = el?.selectionEnd ?? valor.length;
    const nuevo = `${valor.slice(0, inicio)}${texto}${valor.slice(fin)}`;
    onCambio(nuevo);
    moverCursor(inicio + texto.length, inicio + texto.length);
  }

  return (
    <div className={estilos.contenedor}>
      <div className={estilos.barra}>
        <button type="button" className={estilos.botonFormato} title="Negrita" onClick={() => envolverSeleccion('*')}>
          <strong>B</strong>
        </button>
        <button type="button" className={estilos.botonFormato} title="Cursiva" onClick={() => envolverSeleccion('_')}>
          <em>I</em>
        </button>
        <button type="button" className={estilos.botonFormato} title="Tachado" onClick={() => envolverSeleccion('~')}>
          <span style={{ textDecoration: 'line-through' }}>S</span>
        </button>

        <div className={estilos.separador} />

        {variablesDisponibles.map((v) => (
          <button
            key={v}
            type="button"
            className={estilos.pildoraVariable}
            title={`Insertar {${v}}`}
            onClick={() => insertarEnCursor(`{${v}}`)}
          >
            {`{${v}}`}
          </button>
        ))}

        <div className={estilos.separadorFlexible} />

        <div className={estilos.emojiWrapper} ref={emojiRef}>
          <button
            type="button"
            className={estilos.botonFormato}
            title="Insertar emoji"
            onClick={() => setEmojiAbierto((v) => !v)}
          >
            😀
          </button>
          {emojiAbierto && (
            <div className={estilos.emojiPanel}>
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={estilos.emojiBoton}
                  onClick={() => {
                    insertarEnCursor(e);
                    setEmojiAbierto(false);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {onQuitar && (
          <button type="button" className={estilos.botonQuitar} onClick={onQuitar} aria-label="Quitar variante">
            <Icono nombre="cerrar" tamano={15} />
          </button>
        )}
      </div>

      <textarea
        ref={textareaRef}
        className={estilos.textarea}
        rows={5}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
