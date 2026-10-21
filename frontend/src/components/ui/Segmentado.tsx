import estilos from './Segmentado.module.css';

type Opcion<T extends string> = { valor: T; etiqueta: string; contador?: number };

type Props<T extends string> = {
  opciones: Opcion<T>[];
  valor: T;
  onCambio: (valor: T) => void;
  etiqueta?: string;
};

/** Control segmentado (pestañas compactas) para alternar vistas dentro de una página. */
export function Segmentado<T extends string>({ opciones, valor, onCambio, etiqueta }: Props<T>) {
  return (
    <div className={estilos.grupo} role="tablist" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="tab"
          aria-selected={o.valor === valor}
          className={`${estilos.opcion} ${o.valor === valor ? estilos.activa : ''}`}
          onClick={() => onCambio(o.valor)}
        >
          {o.etiqueta}
          {o.contador !== undefined && <span className={estilos.contador}>{o.contador}</span>}
        </button>
      ))}
    </div>
  );
}
