import { useEffect, useState } from 'react';
import { api } from './api';

/** Rubro al que apunta una lista de leads y sus documentos de conocimiento. */
export type Nicho = { id: number; nombre: string };

export function useNichos(): Nicho[] {
  const [nichos, setNichos] = useState<Nicho[]>([]);
  useEffect(() => {
    void api
      .get<Nicho[]>('/nichos')
      .then(setNichos)
      .catch(() => setNichos([]));
  }, []);
  return nichos;
}

type PropsSelector = {
  nichos: Nicho[];
  valor: number | null;
  onCambio: (nichoId: number | null) => void;
  /** Texto de la opcion "sin nicho" (ej. "General (todos los nichos)"). */
  etiquetaNinguno: string;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function SelectorNicho({ nichos, valor, onCambio, etiquetaNinguno, disabled, className, id }: PropsSelector) {
  return (
    <select
      id={id}
      className={className}
      value={valor ?? ''}
      disabled={disabled}
      onChange={(e) => onCambio(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">{etiquetaNinguno}</option>
      {nichos.map((n) => (
        <option key={n.id} value={n.id}>
          {n.nombre}
        </option>
      ))}
    </select>
  );
}
