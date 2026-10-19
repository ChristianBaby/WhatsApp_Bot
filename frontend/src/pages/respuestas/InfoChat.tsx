import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { formatearFecha } from '../../lib/fecha';
import { urlMediaMensaje } from '../../lib/mediaChat';
import type { ConversacionDetalle, MensajeConversacion, TipoGaleria } from '../../lib/types';
import { Avatar } from './Avatar';
import { ContenidoMensaje } from './ContenidoMensaje';
import { Visor } from './Visor';
import estilos from './Organizar.module.css';

type Pestana = TipoGaleria | 'destacados';

const PESTANAS: { valor: Pestana; etiqueta: string }[] = [
  { valor: 'media', etiqueta: 'Multimedia' },
  { valor: 'documentos', etiqueta: 'Documentos' },
  { valor: 'enlaces', etiqueta: 'Enlaces' },
  { valor: 'destacados', etiqueta: '⭐ Destacados' },
];

type Props = {
  conversacion: ConversacionDetalle;
  nombre: string;
  nombreAutor: (m: MensajeConversacion) => string;
  onIr: (m: MensajeConversacion) => void;
  onCerrar: () => void;
};

type Pagina = { mensajes: MensajeConversacion[]; hayMas: boolean };

/** Una foto o video de la galeria: la miniatura enseguida y la foto real cuando se ve en pantalla. */
function Miniatura({ conversacionId, mensaje, onAbrir }: { conversacionId: number; mensaje: MensajeConversacion; onAbrir: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const esFoto = mensaje.tipo === 'imagen';

  useEffect(() => {
    const caja = ref.current;
    if (!caja || !esFoto) return;
    let vigente = true;
    const observador = new IntersectionObserver((entradas) => {
      if (!entradas.some((e) => e.isIntersecting)) return;
      observador.disconnect();
      void urlMediaMensaje(conversacionId, mensaje.id)
        .then((u) => vigente && setUrl(u))
        .catch(() => undefined);
    });
    observador.observe(caja);
    return () => {
      vigente = false;
      observador.disconnect();
    };
  }, [conversacionId, mensaje.id, esFoto]);

  const fondo = url ?? mensaje.media?.miniatura ?? null;
  return (
    <button
      ref={ref}
      type="button"
      className={estilos.miniaturaGaleria}
      style={fondo ? { backgroundImage: `url("${fondo}")` } : undefined}
      onClick={onAbrir}
      title={formatearFecha(mensaje.creadoEn)}
    >
      {!fondo && (esFoto ? '📷' : '🎥')}
      {!esFoto && <span className={estilos.marcaVideo}>▶</span>}
    </button>
  );
}

/** "Info del contacto / del grupo": foto, y archivos, documentos, enlaces y destacados del chat. */
export function InfoChat({ conversacion, nombre, nombreAutor, onIr, onCerrar }: Props) {
  const [pestana, setPestana] = useState<Pestana>('media');
  const [pagina, setPagina] = useState<Pagina | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [visorId, setVisorId] = useState<number | null>(null);
  const id = conversacion.id;

  useEffect(() => {
    let vigente = true;
    setPagina(null);
    const pedido =
      pestana === 'destacados'
        ? api.get<{ mensajes: MensajeConversacion[] }>(`/conversaciones/${id}/destacados`).then((r) => ({ mensajes: r.mensajes, hayMas: false }))
        : api.get<Pagina>(`/conversaciones/${id}/galeria?tipo=${pestana}`);
    pedido.then((p) => vigente && setPagina(p)).catch(() => vigente && setPagina({ mensajes: [], hayMas: false }));
    return () => {
      vigente = false;
    };
  }, [id, pestana]);

  // Un mensaje que se destaca o deja de estarlo mientras esta abierto: se refleja en la lista de destacados.
  useEffect(() => {
    if (pestana !== 'destacados') return;
    setPagina((p) => {
      if (!p) return p;
      const cargados = new Map(conversacion.mensajes.map((m) => [m.id, m]));
      return { ...p, mensajes: p.mensajes.map((m) => cargados.get(m.id) ?? m).filter((m) => m.destacado) };
    });
  }, [conversacion.mensajes, pestana]);

  async function cargarMas() {
    const ultimo = pagina?.mensajes[pagina.mensajes.length - 1];
    if (!ultimo || pestana === 'destacados' || cargandoMas) return;
    setCargandoMas(true);
    try {
      const mas = await api.get<Pagina>(`/conversaciones/${id}/galeria?tipo=${pestana}&antesDe=${ultimo.id}`);
      setPagina((p) => (p ? { mensajes: [...p.mensajes, ...mas.mensajes], hayMas: mas.hayMas } : p));
    } finally {
      setCargandoMas(false);
    }
  }

  const mensajes = pagina?.mensajes ?? [];
  // El visor recorre de la mas vieja a la mas nueva, como en el chat.
  const enOrden = [...mensajes].reverse();

  return (
    <aside className={estilos.panelLateral}>
      <div className={estilos.panelCabecera}>
        <button type="button" className={estilos.botonIcono} title="Cerrar" onClick={onCerrar}>
          ✕
        </button>
        <span className={estilos.panelTitulo}>{conversacion.esGrupo ? 'Info del grupo' : 'Info del contacto'}</span>
      </div>

      <div className={estilos.panelCuerpo}>
        <div className={estilos.perfil}>
          <Avatar conversacionId={id} nombre={nombre} esGrupo={conversacion.esGrupo} tamano={96} />
          <div className={estilos.perfilNombre}>{nombre}</div>
          <div className={estilos.perfilDetalle}>{conversacion.esGrupo ? 'Grupo de WhatsApp' : `+${conversacion.telefono}`}</div>
        </div>

        <div className={estilos.pestanas}>
          {PESTANAS.map((p) => (
            <button
              key={p.valor}
              type="button"
              className={`${estilos.pestana} ${pestana === p.valor ? estilos.pestanaActiva : ''}`}
              onClick={() => setPestana(p.valor)}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>

        {!pagina && <div className={estilos.aviso}>Cargando…</div>}
        {pagina?.mensajes.length === 0 && (
          <div className={estilos.aviso}>
            {pestana === 'destacados'
              ? 'No hay mensajes destacados. Usa ⌄ → ⭐ Destacar en un mensaje.'
              : 'Todavía no hay nada aquí en este chat.'}
          </div>
        )}

        {pestana === 'media' && mensajes.length > 0 && (
          <div className={estilos.galeria}>
            {mensajes.map((m) => (
              <Miniatura key={m.id} conversacionId={id} mensaje={m} onAbrir={() => setVisorId(m.id)} />
            ))}
          </div>
        )}

        {pestana !== 'media' &&
          mensajes.map((m) => (
            <div key={m.id} className={estilos.itemArchivo}>
              <div className={estilos.itemArchivoCabecera}>
                <span>
                  {formatearFecha(m.creadoEn)} · {nombreAutor(m)}
                </span>
                <button type="button" className={estilos.enlaceIr} onClick={() => onIr(m)}>
                  Ir al mensaje
                </button>
              </div>
              <ContenidoMensaje conversacionId={id} mensaje={m} onAbrirVisor={setVisorId} />
            </div>
          ))}

        {pagina?.hayMas && (
          <button type="button" className={estilos.botonMas} onClick={() => void cargarMas()} disabled={cargandoMas}>
            {cargandoMas ? 'Cargando…' : 'Ver más'}
          </button>
        )}
      </div>

      {visorId !== null && (
        <Visor
          conversacionId={id}
          items={enOrden.filter((m) => m.tipo === 'imagen' || m.tipo === 'video')}
          inicialId={visorId}
          nombreAutor={nombreAutor}
          onCerrar={() => setVisorId(null)}
        />
      )}
    </aside>
  );
}
