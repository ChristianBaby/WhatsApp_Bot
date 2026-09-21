import estilos from './Interruptor.module.css';

type Props = {
  activo: boolean;
  onCambio: (activo: boolean) => void;
  disabled?: boolean;
  etiqueta?: string;
};

/** Switch on/off, como el de "Auto-responder activado" de la maquetacion. */
export function Interruptor({ activo, onCambio, disabled, etiqueta }: Props) {
  return (
    <button
      className={estilos.pista}
      style={{ background: activo ? 'var(--acento)' : 'var(--apagado)' }}
      onClick={() => onCambio(!activo)}
      disabled={disabled}
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      type="button"
    >
      <span className={estilos.circulo} style={{ transform: activo ? 'translateX(18px)' : 'translateX(0)' }} />
    </button>
  );
}
