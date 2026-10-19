import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { formatearFecha, formatearHora } from '../../lib/fecha';
import type { MensajeConversacion } from '../../lib/types';
import estilos from './Organizar.module.css';

type Props = {
  conversacionId: number;
  nombreAutor: (m: MensajeConversacion) => string;
  /** Saltar al mensaje en el chat (aunque sea viejo y no este cargado). */
  onIr: (m: MensajeConversacion) => void;
  onCerrar: () => void;
};

/** El texto con lo buscado resaltado. */
function Resaltado({ texto, buscado }: { texto: string; buscado: string }) {
  const i = texto.toLowerCase().indexOf(buscado.toLowerCase());
  if (i < 0) return <>{texto}</>;
  // Se muestra desde un poco antes de lo encontrado, para que se vea aunque el mensaje sea largo.
  const desde = Math.max(0, i - 40);
  return (
    <>
      {desde > 0 && '…'}
      {texto.slice(desde, i)}
      <mark className={estilos.marca}>{texto.slice(i, i + buscado.length)}</mark>
      {texto.slice(i + buscado.length)}
    </>
  );
}

/** La lupa de WhatsApp: buscar mensajes dentro de este chat. */
export function BuscarEnChat({ conversacionId, nombreAutor, onIr, onCerrar }: Props) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<MensajeConversacion[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const entradaRef = useRef<HTMLInputElement>(null);
  const buscado = texto.trim();

  useEffect(() => entradaRef.current?.focus(), []);

  useEffect(() => {
    if (buscado.length < 2) {
      setResultados(null);
      return;
    }
    let vigente = true;
    const t = setTimeout(() => {
      setBuscando(true);
      api
        .get<{ mensajes: MensajeConversacion[] }>(`/conversaciones/${conversacionId}/buscar?q=${encodeURIComponent(buscado)}`)
        .then((r) => vigente && setResultados(r.mensajes))
        .catch(() => vigente && setResultados([]))
        .finally(() => vigente && setBuscando(false));
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [buscado, conversacionId]);

  return (
    <aside className={estilos.panelLateral}>
      <div className={estilos.panelCabecera}>
        <button type="button" className={estilos.botonIcono} title="Cerrar" onClick={onCerrar}>
          ✕
        </button>
        <span className={estilos.panelTitulo}>Buscar mensajes</span>
      </div>
      <div className={estilos.panelBuscador}>
        <input
          ref={entradaRef}
          type="search"
          className={estilos.entrada}
          placeholder="Buscar en este chat…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onCerrar()}
        />
      </div>
      <div className={estilos.panelCuerpo}>
        {buscado.length < 2 && <div className={estilos.aviso}>Escribe al menos 2 letras.</div>}
        {buscando && !resultados && <div className={estilos.aviso}>Buscando…</div>}
        {resultados?.length === 0 && <div className={estilos.aviso}>No hay mensajes con “{buscado}”.</div>}
        {resultados?.map((m) => (
          <button key={m.id} type="button" className={estilos.resultado} onClick={() => onIr(m)}>
            <span className={estilos.resultadoFecha}>
              {formatearFecha(m.creadoEn)} · {formatearHora(m.creadoEn)} · {nombreAutor(m)}
            </span>
            <span className={estilos.resultadoTexto}>
              <Resaltado texto={m.texto} buscado={buscado} />
            </span>
          </button>
        ))}
        {resultados && resultados.length >= 50 && (
          <div className={estilos.aviso}>Se muestran los 50 más recientes: escribe algo más preciso para encontrar otros.</div>
        )}
      </div>
    </aside>
  );
}
