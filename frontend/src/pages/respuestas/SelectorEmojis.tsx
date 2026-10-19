import { useEffect, useRef, useState } from 'react';
import { CATEGORIAS_EMOJI, emojisRecientes, recordarEmoji } from './emojis';
import estilos from './Chat.module.css';

type Props = {
  onElegir: (emoji: string) => void;
  onCerrar: () => void;
  /** Donde se abre respecto de su contenedor (el boton que lo abrio). */
  posicion?: 'arriba' | 'abajo';
};

/** Selector de emojis como el de WhatsApp: recientes y categorias. Cierra con Escape o clic afuera. */
export function SelectorEmojis({ onElegir, onCerrar, posicion = 'arriba' }: Props) {
  const recientes = emojisRecientes();
  const [categoria, setCategoria] = useState(recientes.length ? 'recientes' : CATEGORIAS_EMOJI[0]!.id);
  const cajaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    const alClic = (e: MouseEvent) => {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) onCerrar();
    };
    document.addEventListener('keydown', alTecla);
    // En el siguiente ciclo: el mismo clic que lo abrio no debe cerrarlo.
    const t = setTimeout(() => document.addEventListener('mousedown', alClic));
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', alTecla);
      document.removeEventListener('mousedown', alClic);
    };
  }, [onCerrar]);

  const pestanas = [
    ...(recientes.length ? [{ id: 'recientes', icono: '🕘', nombre: 'Recientes', emojis: recientes }] : []),
    ...CATEGORIAS_EMOJI,
  ];
  const actual = pestanas.find((p) => p.id === categoria) ?? pestanas[0]!;

  function elegir(emoji: string) {
    recordarEmoji(emoji);
    onElegir(emoji);
  }

  return (
    <div ref={cajaRef} className={`${estilos.selectorEmojis} ${posicion === 'abajo' ? estilos.selectorAbajo : ''}`}>
      <div className={estilos.pestanasEmoji}>
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.nombre}
            className={`${estilos.pestanaEmoji} ${p.id === actual.id ? estilos.pestanaActiva : ''}`}
            onClick={() => setCategoria(p.id)}
          >
            {p.icono}
          </button>
        ))}
      </div>
      <div className={estilos.tituloCategoria}>{actual.nombre}</div>
      <div className={estilos.rejillaEmojis}>
        {actual.emojis.map((emoji) => (
          <button key={emoji} type="button" className={estilos.emoji} onClick={() => elegir(emoji)}>
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
