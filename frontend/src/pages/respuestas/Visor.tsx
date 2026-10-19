import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatearFecha, formatearHora } from '../../lib/fecha';
import { urlMediaMensaje } from '../../lib/mediaChat';
import type { MensajeConversacion } from '../../lib/types';
import { TextoWhatsapp } from './TextoWhatsapp';
import estilos from './Visor.module.css';

type Props = {
  conversacionId: number;
  /** Fotos y videos del chat (los que ya estan cargados en pantalla), en orden. */
  items: MensajeConversacion[];
  inicialId: number;
  /** Quien mando cada foto o video (para "De: ..."). */
  nombreAutor: (m: MensajeConversacion) => string;
  onCerrar: () => void;
};

/** Fotos y videos a pantalla completa, pasando de uno a otro con las flechas (como en WhatsApp). */
export function Visor({ conversacionId, items, inicialId, nombreAutor, onCerrar }: Props) {
  const [indice, setIndice] = useState(() => Math.max(0, items.findIndex((m) => m.id === inicialId)));
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actual = items[indice];

  useEffect(() => {
    if (!actual) return;
    let vigente = true;
    setUrl(null);
    setError(null);
    urlMediaMensaje(conversacionId, actual.id).then(
      (u) => vigente && setUrl(u),
      (err: unknown) => vigente && setError(err instanceof Error ? err.message : 'No disponible'),
    );
    return () => {
      vigente = false;
    };
  }, [conversacionId, actual?.id]);

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar();
      if (e.key === 'ArrowLeft') setIndice((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndice((i) => Math.min(items.length - 1, i + 1));
    }
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [items.length, onCerrar]);

  if (!actual) return null;

  function descargar() {
    if (!url || !actual) return;
    const enlace = document.createElement('a');
    enlace.href = url;
    const extension = actual.tipo === 'video' ? 'mp4' : 'jpg';
    enlace.download = `whatsapp-${actual.id}.${extension}`;
    enlace.click();
  }

  const quien = nombreAutor(actual);

  return createPortal(
    <div className={estilos.fondo} onClick={onCerrar}>
      <div className={estilos.barra} onClick={(e) => e.stopPropagation()}>
        <div>
          <div className={estilos.quien}>{quien}</div>
          <div className={estilos.cuando}>
            {formatearFecha(actual.creadoEn)} {formatearHora(actual.creadoEn)} · {indice + 1} de {items.length}
          </div>
        </div>
        <div className={estilos.acciones}>
          <button onClick={descargar} disabled={!url} title="Descargar">
            ⬇
          </button>
          <button onClick={onCerrar} title="Cerrar (Esc)">
            ✕
          </button>
        </div>
      </div>

      <div className={estilos.centro} onClick={(e) => e.stopPropagation()}>
        <button
          className={estilos.flecha}
          onClick={() => setIndice((i) => i - 1)}
          disabled={indice === 0}
          title="Anterior (←)"
        >
          ‹
        </button>
        <div className={estilos.media}>
          {error ? (
            <span className={estilos.aviso}>⚠ {error}</span>
          ) : !url ? (
            <span className={estilos.aviso}>Cargando…</span>
          ) : actual.tipo === 'video' ? (
            <video key={url} src={url} controls autoPlay className={estilos.contenido} />
          ) : (
            <img src={url} alt="" className={estilos.contenido} />
          )}
        </div>
        <button
          className={estilos.flecha}
          onClick={() => setIndice((i) => i + 1)}
          disabled={indice === items.length - 1}
          title="Siguiente (→)"
        >
          ›
        </button>
      </div>

      {actual.media?.leyenda && (
        <div className={estilos.leyenda} onClick={(e) => e.stopPropagation()}>
          <TextoWhatsapp texto={actual.media.leyenda} />
        </div>
      )}
    </div>,
    document.body,
  );
}
