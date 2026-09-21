import { useState } from 'react';
import estilos from './EditorPalabras.module.css';

type Props = {
  palabras: string[];
  onCambio: (palabras: string[]) => void;
  disabled?: boolean;
};

/** Chips de "asesor ×", "hablar con alguien ×"... con un input para agregar una nueva. */
export function EditorPalabras({ palabras, onCambio, disabled }: Props) {
  const [agregando, setAgregando] = useState(false);
  const [borrador, setBorrador] = useState('');

  function quitar(i: number) {
    onCambio(palabras.filter((_, idx) => idx !== i));
  }

  function confirmarAgregar() {
    const valor = borrador.trim();
    if (valor && !palabras.some((p) => p.toLowerCase() === valor.toLowerCase())) {
      onCambio([...palabras, valor]);
    }
    setBorrador('');
    setAgregando(false);
  }

  return (
    <div className={estilos.lista}>
      {palabras.map((palabra, i) => (
        <span className={estilos.chip} key={`${palabra}-${i}`}>
          {palabra}
          <button
            className={estilos.quitar}
            onClick={() => quitar(i)}
            disabled={disabled}
            aria-label={`Quitar "${palabra}"`}
            type="button"
          >
            ×
          </button>
        </span>
      ))}

      {agregando ? (
        <input
          autoFocus
          className={estilos.inputNuevo}
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirmarAgregar();
            if (e.key === 'Escape') {
              setBorrador('');
              setAgregando(false);
            }
          }}
          onBlur={confirmarAgregar}
          placeholder="nueva palabra…"
        />
      ) : (
        <button className={estilos.agregar} onClick={() => setAgregando(true)} disabled={disabled} type="button">
          + Agregar palabra
        </button>
      )}
    </div>
  );
}
