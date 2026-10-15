import { useEffect, useRef, useState, type ReactNode } from 'react';
import { urlMediaMensaje } from '../../lib/mediaChat';
import type { MensajeConversacion } from '../../lib/types';
import estilos from './DetalleConversacion.module.css';

type Props = { conversacionId: number; mensaje: MensajeConversacion };

const PATRON_URL = /(https?:\/\/[^\s]+)/g;

/** Texto con los enlaces clicables (ubicaciones, links que manda el cliente). */
function TextoConEnlaces({ texto }: { texto: string }) {
  const partes = texto.split(PATRON_URL);
  return (
    <>
      {partes.map((parte, i) =>
        /^https?:\/\//.test(parte) ? (
          <a key={i} href={parte} target="_blank" rel="noreferrer" className={estilos.enlace}>
            {parte}
          </a>
        ) : (
          <span key={i}>{parte}</span>
        ),
      )}
    </>
  );
}

function duracion(segundos: number | null): string {
  if (!segundos) return '';
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return ` (${m}:${String(s).padStart(2, '0')})`;
}

function tamano(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type EstadoCarga = { estado: 'espera' } | { estado: 'cargando' } | { estado: 'listo'; url: string } | { estado: 'error'; detalle: string };

/** Baja el archivo del mensaje (una sola vez por pestaña, ver lib/mediaChat). */
function useArchivo(conversacionId: number, mensajeId: number) {
  const [carga, setCarga] = useState<EstadoCarga>({ estado: 'espera' });
  const vigente = useRef(true);
  useEffect(() => {
    vigente.current = true;
    return () => {
      vigente.current = false;
    };
  }, []);

  function cargar(): Promise<string | null> {
    setCarga({ estado: 'cargando' });
    return urlMediaMensaje(conversacionId, mensajeId).then(
      (url) => {
        if (vigente.current) setCarga({ estado: 'listo', url });
        return url;
      },
      (err: unknown) => {
        if (vigente.current) setCarga({ estado: 'error', detalle: err instanceof Error ? err.message : 'No disponible' });
        return null;
      },
    );
  }
  return { carga, cargar };
}

/** Foto o sticker: se baja recien cuando aparece en pantalla al desplazarse por el chat. */
function ImagenPerezosa({ conversacionId, mensaje, sticker }: Props & { sticker: boolean }) {
  const { carga, cargar } = useArchivo(conversacionId, mensaje.id);
  const cajaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const caja = cajaRef.current;
    if (!caja || carga.estado !== 'espera') return;
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        observador.disconnect();
        void cargar();
      }
    });
    observador.observe(caja);
    return () => observador.disconnect();
  }, [carga.estado]);

  return (
    <div ref={cajaRef} className={sticker ? estilos.cajaSticker : estilos.cajaImagen}>
      {carga.estado === 'listo' ? (
        <img
          src={carga.url}
          alt={sticker ? 'Sticker' : 'Imagen'}
          className={sticker ? estilos.sticker : estilos.imagen}
          onClick={() => !sticker && window.open(carga.url, '_blank')}
        />
      ) : (
        <span className={estilos.marcadorMedia}>
          {carga.estado === 'error' ? '📷 Imagen no disponible' : sticker ? '💟' : '📷 Cargando…'}
        </span>
      )}
    </div>
  );
}

/** Video o audio: pesan mas, se bajan solo si el usuario pulsa para reproducir. */
function Reproducible({ conversacionId, mensaje }: Props) {
  const { carga, cargar } = useArchivo(conversacionId, mensaje.id);
  const esVideo = mensaje.tipo === 'video';

  if (carga.estado === 'listo') {
    return esVideo ? (
      <video src={carga.url} controls autoPlay className={estilos.video} />
    ) : (
      <audio src={carga.url} controls autoPlay className={estilos.audio} />
    );
  }

  const etiqueta = esVideo ? '▶ Ver video' : mensaje.tipo === 'nota_voz' ? '▶ Escuchar nota de voz' : '▶ Escuchar audio';
  return (
    <button className={estilos.botonMedia} onClick={() => void cargar()} disabled={carga.estado === 'cargando'}>
      {carga.estado === 'cargando'
        ? 'Cargando…'
        : carga.estado === 'error'
          ? `⚠ ${carga.detalle}`
          : `${etiqueta}${duracion(mensaje.media?.segundos ?? null)}`}
    </button>
  );
}

/** Documento: se baja recien al pulsar "Descargar". */
function Documento({ conversacionId, mensaje }: Props) {
  const { carga, cargar } = useArchivo(conversacionId, mensaje.id);
  const nombre = mensaje.media?.nombre ?? 'Documento';

  async function descargar() {
    const url = carga.estado === 'listo' ? carga.url : await cargar();
    if (!url) return;
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
  }

  return (
    <div className={estilos.documento}>
      <span className={estilos.documentoIcono}>📄</span>
      <span className={estilos.documentoDatos}>
        <span className={estilos.documentoNombre}>{nombre}</span>
        <span className={estilos.documentoDetalle}>
          {carga.estado === 'error' ? `⚠ ${carga.detalle}` : tamano(mensaje.media?.tamano ?? null)}
        </span>
      </span>
      <button className={estilos.botonMedia} onClick={() => void descargar()} disabled={carga.estado === 'cargando'}>
        {carga.estado === 'cargando' ? '…' : 'Descargar'}
      </button>
    </div>
  );
}

/** Lo que va dentro de la burbuja segun el tipo de mensaje. */
export function ContenidoMensaje({ conversacionId, mensaje }: Props) {
  const leyenda = mensaje.media?.leyenda;
  const conLeyenda = (contenido: ReactNode) => (
    <>
      {contenido}
      {leyenda && (
        <div className={estilos.leyenda}>
          <TextoConEnlaces texto={leyenda} />
        </div>
      )}
    </>
  );

  // Mensajes guardados antes de que existieran los tipos, o adjuntos sin datos para bajarlos: solo texto.
  if (!mensaje.media || mensaje.tipo === 'texto' || mensaje.tipo === 'ubicacion' || mensaje.tipo === 'contacto') {
    return <TextoConEnlaces texto={mensaje.texto} />;
  }

  switch (mensaje.tipo) {
    case 'imagen':
      return conLeyenda(<ImagenPerezosa conversacionId={conversacionId} mensaje={mensaje} sticker={false} />);
    case 'sticker':
      return <ImagenPerezosa conversacionId={conversacionId} mensaje={mensaje} sticker />;
    case 'video':
      return conLeyenda(<Reproducible conversacionId={conversacionId} mensaje={mensaje} />);
    case 'audio':
      return <Reproducible conversacionId={conversacionId} mensaje={mensaje} />;
    case 'nota_voz': {
      // Si la nota de voz se transcribio (ver backend), el texto es "🎤 <lo que dijo>".
      const transcripcion = mensaje.texto.startsWith('🎤 ') && mensaje.texto !== '🎤 Audio de voz' ? mensaje.texto.slice(3) : null;
      return (
        <>
          <Reproducible conversacionId={conversacionId} mensaje={mensaje} />
          {transcripcion && <div className={estilos.leyenda}>“{transcripcion}”</div>}
        </>
      );
    }
    case 'documento':
      return conLeyenda(<Documento conversacionId={conversacionId} mensaje={mensaje} />);
    default:
      return <TextoConEnlaces texto={mensaje.texto} />;
  }
}
