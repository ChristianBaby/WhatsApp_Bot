import { useEffect, useRef } from 'react';
import { Badge } from '../../components/ui/Badge';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { formatearRelativo } from '../../lib/fecha';
import type { ConversacionResumen, FiltroConversaciones } from '../../lib/types';
import { infoEtapa } from './etapa';
import { inicialesDeChat, nombreDeChat } from './nombreChat';
import estilos from './ListaConversaciones.module.css';

const FILTROS: { valor: FiltroConversaciones; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'no_leidos', etiqueta: 'No leídos' },
  { valor: 'leads', etiqueta: 'Leads' },
  { valor: 'asesor', etiqueta: 'Piden asesor' },
  { valor: 'grupos', etiqueta: 'Grupos' },
];

type Props = {
  conversaciones: ConversacionResumen[] | null;
  seleccionadaId: number | null;
  onSeleccionar: (id: number) => void;
  filtro: FiltroConversaciones;
  onFiltro: (filtro: FiltroConversaciones) => void;
  busqueda: string;
  onBusqueda: (texto: string) => void;
  hayMas: boolean;
  cargandoMas: boolean;
  onCargarMas: () => void;
};

export function ListaConversaciones({
  conversaciones,
  seleccionadaId,
  onSeleccionar,
  filtro,
  onFiltro,
  busqueda,
  onBusqueda,
  hayMas,
  cargandoMas,
  onCargarMas,
}: Props) {
  const listaRef = useRef<HTMLDivElement>(null);
  const finalRef = useRef<HTMLDivElement>(null);
  const cargarMasRef = useRef(onCargarMas);
  cargarMasRef.current = onCargarMas;

  // Pide la pagina siguiente cuando el final de la lista se acerca a la vista.
  useEffect(() => {
    const final = finalRef.current;
    if (!final || !hayMas) return;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) cargarMasRef.current();
      },
      { root: listaRef.current, rootMargin: '300px' },
    );
    observador.observe(final);
    return () => observador.disconnect();
  }, [hayMas, conversaciones?.length]);

  return (
    <div className={estilos.contenedor}>
      <div className={estilos.cabecera}>
        <input
          className={estilos.buscador}
          type="search"
          placeholder="Buscar por nombre, empresa o número…"
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
        />
        <div className={estilos.filtros}>
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              className={`${estilos.filtro} ${filtro === f.valor ? estilos.filtroActivo : ''}`}
              onClick={() => onFiltro(f.valor)}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div className={estilos.lista} ref={listaRef}>
        {conversaciones === null && <div className={estilos.aviso}>Cargando chats…</div>}

        {conversaciones?.length === 0 && (
          <div style={{ padding: 20 }}>
            <EstadoVacio
              titulo={busqueda ? 'Sin resultados' : 'No hay chats aquí'}
              detalle={
                busqueda
                  ? 'Prueba con otro nombre o número.'
                  : 'Cuando vincules un número, sus chats aparecerán aquí, los más recientes primero.'
              }
            />
          </div>
        )}

        {conversaciones?.map((c) => {
          const etapa = infoEtapa(c.etapaPipeline);
          const nombre = nombreDeChat(c);
          return (
            <button
              key={c.id}
              className={`${estilos.item} ${c.id === seleccionadaId ? estilos.seleccionado : ''}`}
              onClick={() => onSeleccionar(c.id)}
            >
              <span className={estilos.avatar} title={c.esGrupo ? 'Grupo' : undefined}>
                {c.esGrupo ? '👥' : inicialesDeChat(nombre)}
              </span>
              <span className={estilos.cuerpo}>
                <span className={estilos.filaSuperior}>
                  <span className={estilos.empresa} style={{ fontWeight: c.noLeidos > 0 ? 800 : 600 }}>
                    {nombre}
                  </span>
                  <span className={estilos.hace}>{c.ultimoMensajeEn ? formatearRelativo(c.ultimoMensajeEn) : ''}</span>
                </span>
                <span className={estilos.filaInferior}>
                  <span className={estilos.preview}>{c.ultimoMensajePreview}</span>
                  {c.noLeidos > 0 && <span className={estilos.contador}>{c.noLeidos > 99 ? '99+' : c.noLeidos}</span>}
                </span>
                {etapa && (
                  <span className={estilos.etiquetas}>
                    <Badge tono={etapa.tono}>{etapa.etiqueta}</Badge>
                  </span>
                )}
              </span>
            </button>
          );
        })}

        {hayMas && (
          <div ref={finalRef} className={estilos.aviso}>
            {cargandoMas ? 'Cargando más chats…' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
