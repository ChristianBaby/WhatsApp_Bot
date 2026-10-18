import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { urlMediaMensaje } from '../../lib/mediaChat';
import type { ExtraMensaje, MensajeConversacion } from '../../lib/types';
import { TextoWhatsapp, esEmojiGrande } from './TextoWhatsapp';
import estilos from './DetalleConversacion.module.css';

type Props = {
  conversacionId: number;
  mensaje: MensajeConversacion;
  /** Abre la foto o el video a pantalla completa. */
  onAbrirVisor?: (mensajeId: number) => void;
};

function duracion(segundos: number | null | undefined): string {
  if (!segundos) return '';
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function tamano(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type EstadoCarga = { estado: 'espera' } | { estado: 'cargando' } | { estado: 'listo'; url: string } | { estado: 'error'; detalle: string };

/** Baja el archivo del mensaje (una sola vez por pestaña, ver lib/mediaChat). */
export function useArchivo(conversacionId: number, mensajeId: number) {
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

/** Ejecuta `alVer` la primera vez que el elemento aparece en pantalla. */
function useAlAparecer(alVer: () => void, activo: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const caja = ref.current;
    if (!caja || !activo) return;
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        observador.disconnect();
        alVer();
      }
    });
    observador.observe(caja);
    return () => observador.disconnect();
  }, [activo]);
  return ref;
}

const ANCHO_MAX = 260;
const ALTO_MAX = 320;
const ANCHO_MIN = 120;

/** El tamaño en pantalla de una foto/video, respetando su forma (se reserva antes de que baje). */
function medidas(ancho: number | null | undefined, alto: number | null | undefined): CSSProperties {
  if (!ancho || !alto) return { width: 240, height: 180 };
  const escala = Math.min(ANCHO_MAX / ancho, ALTO_MAX / alto, 1);
  return { width: Math.max(ANCHO_MIN, Math.round(ancho * escala)), height: Math.max(80, Math.round(alto * escala)) };
}

/** Fondo borroso con la miniatura que manda WhatsApp, mientras baja el archivo real. */
function fondoMiniatura(miniatura: string | null | undefined): CSSProperties {
  return miniatura ? { backgroundImage: `url(${miniatura})` } : {};
}

/** Foto: se baja recien cuando aparece en pantalla al desplazarse por el chat. */
function Imagen({ conversacionId, mensaje, onAbrirVisor }: Props) {
  const { carga, cargar } = useArchivo(conversacionId, mensaje.id);
  const ref = useAlAparecer(() => void cargar(), carga.estado === 'espera');
  const media = mensaje.media;

  return (
    <div
      ref={ref}
      className={estilos.cajaImagen}
      style={medidas(media?.ancho, media?.alto)}
      onClick={() => carga.estado === 'listo' && onAbrirVisor?.(mensaje.id)}
    >
      {carga.estado !== 'listo' && <div className={estilos.miniatura} style={fondoMiniatura(media?.miniatura)} />}
      {carga.estado === 'listo' ? (
        <img src={carga.url} alt="Imagen" className={estilos.imagen} />
      ) : (
        <span className={estilos.marcadorMedia}>
          {carga.estado === 'error' ? `⚠ ${carga.detalle}` : media?.miniatura ? '' : '📷 Cargando…'}
        </span>
      )}
    </div>
  );
}

function Sticker({ conversacionId, mensaje }: Props) {
  const { carga, cargar } = useArchivo(conversacionId, mensaje.id);
  const ref = useAlAparecer(() => void cargar(), carga.estado === 'espera');
  return (
    <div ref={ref} className={estilos.cajaSticker}>
      {carga.estado === 'listo' ? (
        <img src={carga.url} alt="Sticker" className={estilos.sticker} />
      ) : (
        <span className={estilos.marcadorMedia}>{carga.estado === 'error' ? '💟 Sticker no disponible' : '💟'}</span>
      )}
    </div>
  );
}

/** GIF: se reproduce solo, en bucle y sin sonido, cuando aparece en pantalla. */
function Gif({ conversacionId, mensaje }: Props) {
  const { carga, cargar } = useArchivo(conversacionId, mensaje.id);
  const ref = useAlAparecer(() => void cargar(), carga.estado === 'espera');
  const media = mensaje.media;
  return (
    <div ref={ref} className={estilos.cajaImagen} style={medidas(media?.ancho, media?.alto)}>
      {carga.estado === 'listo' ? (
        <video src={carga.url} autoPlay loop muted playsInline className={estilos.imagen} />
      ) : (
        <>
          <div className={estilos.miniatura} style={fondoMiniatura(media?.miniatura)} />
          <span className={estilos.etiquetaGif}>{carga.estado === 'error' ? '⚠' : 'GIF'}</span>
        </>
      )}
    </div>
  );
}

/** Nota de video (redonda): se reproduce en el mismo chat al pulsarla. */
function VideoCircular({ conversacionId, mensaje }: Props) {
  const { carga, cargar } = useArchivo(conversacionId, mensaje.id);
  return (
    <div className={estilos.videoCircular} onClick={() => carga.estado === 'espera' && void cargar()}>
      {carga.estado === 'listo' ? (
        <video src={carga.url} autoPlay controls={false} onClick={(e) => void togglePlay(e.currentTarget)} />
      ) : (
        <>
          <div className={estilos.miniatura} style={fondoMiniatura(mensaje.media?.miniatura)} />
          <span className={estilos.botonPlay}>{carga.estado === 'cargando' ? '…' : carga.estado === 'error' ? '⚠' : '▶'}</span>
        </>
      )}
    </div>
  );
}

function togglePlay(video: HTMLVideoElement): Promise<void> | void {
  return video.paused ? video.play() : video.pause();
}

/** Video: muestra la miniatura con ▶; al pulsarlo se abre a pantalla completa. */
function Video(props: Props) {
  const media = props.mensaje.media;
  if (media?.gif) return <Gif {...props} />;
  if (media?.circular) return <VideoCircular {...props} />;
  return (
    <div
      className={estilos.cajaImagen}
      style={medidas(media?.ancho, media?.alto)}
      onClick={() => props.onAbrirVisor?.(props.mensaje.id)}
    >
      <div className={estilos.miniatura} style={fondoMiniatura(media?.miniatura)} />
      <span className={estilos.botonPlay}>▶</span>
      {media?.segundos ? <span className={estilos.duracionVideo}>🎥 {duracion(media.segundos)}</span> : null}
    </div>
  );
}

const VELOCIDADES = [1, 1.5, 2];

/** Audio y nota de voz: se bajan al pulsar ▶; con velocidad 1x / 1.5x / 2x como en WhatsApp. */
function Audio({ conversacionId, mensaje }: Props) {
  const { carga, cargar } = useArchivo(conversacionId, mensaje.id);
  const [velocidad, setVelocidad] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const esNota = mensaje.tipo === 'nota_voz';

  function cambiarVelocidad() {
    const siguiente = VELOCIDADES[(VELOCIDADES.indexOf(velocidad) + 1) % VELOCIDADES.length]!;
    setVelocidad(siguiente);
    if (audioRef.current) audioRef.current.playbackRate = siguiente;
  }

  if (carga.estado === 'listo') {
    return (
      <div className={estilos.filaAudio}>
        <audio
          ref={audioRef}
          src={carga.url}
          controls
          autoPlay
          className={estilos.audio}
          onPlay={(e) => (e.currentTarget.playbackRate = velocidad)}
        />
        <button className={estilos.botonVelocidad} onClick={cambiarVelocidad} title="Velocidad de reproducción">
          {velocidad}x
        </button>
      </div>
    );
  }

  return (
    <button className={estilos.botonMedia} onClick={() => void cargar()} disabled={carga.estado === 'cargando'}>
      {carga.estado === 'cargando'
        ? 'Cargando…'
        : carga.estado === 'error'
          ? `⚠ ${carga.detalle}`
          : `▶ ${esNota ? '🎤 Nota de voz' : '🎵 Audio'} ${duracion(mensaje.media?.segundos)}`}
    </button>
  );
}

/** Documento: "Abrir" (PDF en otra pestaña) o "Descargar"; se baja recien al pulsar. */
function Documento({ conversacionId, mensaje }: Props) {
  const { carga, cargar } = useArchivo(conversacionId, mensaje.id);
  const nombre = mensaje.media?.nombre ?? 'Documento';
  const esPdf = mensaje.media?.mime === 'application/pdf' || /\.pdf$/i.test(nombre);
  const extension = /\.([a-z0-9]{1,5})$/i.exec(nombre)?.[1]?.toUpperCase();

  async function url(): Promise<string | null> {
    return carga.estado === 'listo' ? carga.url : cargar();
  }

  async function descargar() {
    const destino = await url();
    if (!destino) return;
    const enlace = document.createElement('a');
    enlace.href = destino;
    enlace.download = nombre;
    enlace.click();
  }

  async function abrir() {
    // La pestaña se abre ya (si se abre despues de esperar, el navegador la bloquea).
    const pestana = window.open('', '_blank');
    const destino = await url();
    if (destino && pestana) pestana.location.href = destino;
    else pestana?.close();
  }

  return (
    <div className={estilos.documento}>
      <span className={estilos.documentoIcono}>📄</span>
      <span className={estilos.documentoDatos}>
        <span className={estilos.documentoNombre}>{nombre}</span>
        <span className={estilos.documentoDetalle}>
          {carga.estado === 'error'
            ? `⚠ ${carga.detalle}`
            : [extension, tamano(mensaje.media?.tamano ?? null)].filter(Boolean).join(' · ')}
        </span>
      </span>
      {esPdf && (
        <button className={estilos.botonMedia} onClick={() => void abrir()} disabled={carga.estado === 'cargando'}>
          Abrir
        </button>
      )}
      <button className={estilos.botonMedia} onClick={() => void descargar()} disabled={carga.estado === 'cargando'}>
        {carga.estado === 'cargando' ? '…' : 'Descargar'}
      </button>
    </div>
  );
}

function Ubicacion({ ubicacion }: { ubicacion: NonNullable<ExtraMensaje['ubicacion']> }) {
  const enlace = `https://www.google.com/maps?q=${ubicacion.lat},${ubicacion.lng}`;
  return (
    <a href={enlace} target="_blank" rel="noreferrer" className={estilos.ubicacion}>
      <div className={estilos.mapa} style={fondoMiniatura(ubicacion.miniatura)}>
        {!ubicacion.miniatura && <span>📍</span>}
      </div>
      <div className={estilos.ubicacionDatos}>
        {ubicacion.enVivo && <div className={estilos.ubicacionVivo}>🔴 Ubicación en tiempo real (síguela en el teléfono)</div>}
        {ubicacion.nombre && <div className={estilos.ubicacionNombre}>{ubicacion.nombre}</div>}
        {ubicacion.direccion && <div className={estilos.documentoDetalle}>{ubicacion.direccion}</div>}
        <div className={estilos.ubicacionAbrir}>Abrir en Google Maps ↗</div>
      </div>
    </a>
  );
}

function Contactos({ contactos }: { contactos: NonNullable<ExtraMensaje['contactos']> }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  function copiar(numero: string) {
    void navigator.clipboard.writeText(numero).then(() => {
      setCopiado(numero);
      setTimeout(() => setCopiado(null), 1500);
    });
  }
  return (
    <div className={estilos.contactos}>
      {contactos.map((c, i) => (
        <div key={i} className={estilos.contacto}>
          <span className={estilos.avatarContacto}>{c.nombre.trim().charAt(0).toUpperCase() || '👤'}</span>
          <span className={estilos.documentoDatos}>
            <span className={estilos.documentoNombre}>{c.nombre}</span>
            {c.telefonos.map((t) => (
              <button key={t} className={estilos.telefonoContacto} onClick={() => copiar(t)} title="Copiar número">
                {copiado === t ? '✓ Copiado' : t}
              </button>
            ))}
            {c.telefonos.length === 0 && <span className={estilos.documentoDetalle}>Sin número</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

const QUIEN_VOTO: Record<string, string> = { yo: 'Tú', lead: 'Cliente' };

function Encuesta({ encuesta }: { encuesta: NonNullable<ExtraMensaje['encuesta']> }) {
  const votantes = Object.entries(encuesta.votos);
  const totalVotos = votantes.length;
  return (
    <div className={estilos.encuesta}>
      <div className={estilos.encuestaPregunta}>📊 {encuesta.pregunta}</div>
      <div className={estilos.documentoDetalle}>
        {encuesta.maxSeleccion === 1 ? 'Selecciona una opción' : 'Selecciona una o más opciones'}
      </div>
      {encuesta.opciones.map((opcion) => {
        const quienes = votantes.filter(([, elegidas]) => elegidas.includes(opcion)).map(([quien]) => QUIEN_VOTO[quien] ?? quien);
        const porcentaje = totalVotos ? Math.round((quienes.length / totalVotos) * 100) : 0;
        return (
          <div key={opcion} className={estilos.encuestaOpcion}>
            <div className={estilos.encuestaFila}>
              <span>{opcion}</span>
              <span className={estilos.documentoDetalle}>{quienes.join(', ')}</span>
            </div>
            <div className={estilos.encuestaBarra}>
              <div style={{ width: `${porcentaje}%` }} />
            </div>
          </div>
        );
      })}
      <div className={estilos.documentoDetalle}>Los votos nuevos se ven en el teléfono.</div>
    </div>
  );
}

function VistaPreviaEnlace({ enlace }: { enlace: NonNullable<ExtraMensaje['enlace']> }) {
  let dominio = enlace.url;
  try {
    dominio = new URL(enlace.url.startsWith('http') ? enlace.url : `https://${enlace.url}`).hostname;
  } catch {
    // se muestra tal cual
  }
  return (
    <a
      href={enlace.url.startsWith('http') ? enlace.url : `https://${enlace.url}`}
      target="_blank"
      rel="noreferrer"
      className={estilos.vistaPrevia}
    >
      {enlace.miniatura && <img src={enlace.miniatura} alt="" className={estilos.vistaPreviaImagen} />}
      <span className={estilos.documentoDatos}>
        {enlace.titulo && <span className={estilos.documentoNombre}>{enlace.titulo}</span>}
        {enlace.descripcion && <span className={estilos.vistaPreviaDescripcion}>{enlace.descripcion}</span>}
        <span className={estilos.documentoDetalle}>{dominio}</span>
      </span>
    </a>
  );
}

/** Lo que va dentro de la burbuja segun el tipo de mensaje. */
export function ContenidoMensaje(props: Props) {
  const { mensaje } = props;
  const extra = mensaje.extra;
  const leyenda = mensaje.media?.leyenda;
  const conLeyenda = (contenido: ReactNode) => (
    <>
      {contenido}
      {leyenda && (
        <div className={estilos.leyenda}>
          <TextoWhatsapp texto={leyenda} />
        </div>
      )}
    </>
  );

  if (extra?.verUnaVez) {
    return <span className={estilos.textoSistema}>{mensaje.texto} — solo se puede abrir en el teléfono</span>;
  }
  if (mensaje.tipo === 'llamada') {
    return (
      <span className={`${estilos.textoSistema} ${extra?.llamada?.perdida ? estilos.llamadaPerdida : ''}`}>
        {mensaje.texto}
      </span>
    );
  }
  if (mensaje.tipo === 'ubicacion' && extra?.ubicacion) return <Ubicacion ubicacion={extra.ubicacion} />;
  if (mensaje.tipo === 'contacto' && extra?.contactos?.length) return <Contactos contactos={extra.contactos} />;
  if (mensaje.tipo === 'encuesta' && extra?.encuesta) return <Encuesta encuesta={extra.encuesta} />;

  // Texto, o adjuntos guardados antes de que existieran los datos para bajarlos.
  if (!mensaje.media || mensaje.tipo === 'texto' || mensaje.tipo === 'ubicacion' || mensaje.tipo === 'contacto') {
    if (esEmojiGrande(mensaje.texto)) return <span className={estilos.emojiGrande}>{mensaje.texto.trim()}</span>;
    return (
      <>
        {extra?.enlace && <VistaPreviaEnlace enlace={extra.enlace} />}
        <TextoWhatsapp texto={mensaje.texto} />
      </>
    );
  }

  switch (mensaje.tipo) {
    case 'imagen':
      return conLeyenda(<Imagen {...props} />);
    case 'sticker':
      return <Sticker {...props} />;
    case 'video':
      return conLeyenda(<Video {...props} />);
    case 'audio':
      return <Audio {...props} />;
    case 'nota_voz': {
      // Si la nota de voz se transcribio (ver backend), el texto es "🎤 <lo que dijo>".
      const transcripcion =
        mensaje.texto.startsWith('🎤 ') && mensaje.texto !== '🎤 Audio de voz' ? mensaje.texto.slice(3) : null;
      return (
        <>
          <Audio {...props} />
          {transcripcion && <div className={estilos.leyenda}>“{transcripcion}”</div>}
        </>
      );
    }
    case 'documento':
      return conLeyenda(<Documento {...props} />);
    default:
      return <TextoWhatsapp texto={mensaje.texto} />;
  }
}
