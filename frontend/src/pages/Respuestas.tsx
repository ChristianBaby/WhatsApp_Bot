import { useCallback, useEffect, useRef, useState } from 'react';
import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { EstadoVacio } from '../components/ui/EstadoVacio';
import { Tarjeta } from '../components/ui/Tarjeta';
import { useSSE } from '../hooks/useSSE';
import { api } from '../lib/api';
import type {
  ConversacionDetalle,
  ConversacionResumen,
  EstadoEntrega,
  FiltroConversaciones,
  MensajeConversacion,
  PaginaConversaciones,
} from '../lib/types';
import { ListaConversaciones } from './respuestas/ListaConversaciones';
import { DetalleConversacion } from './respuestas/DetalleConversacion';
import { FichaLead } from './respuestas/FichaLead';
import estilos from './Respuestas.module.css';

/** Mas recientes primero (mismo orden que el backend). */
function ordenar(lista: ConversacionResumen[]): ConversacionResumen[] {
  return [...lista].sort((a, b) => {
    const fa = a.ultimoMensajeEn ? new Date(a.ultimoMensajeEn).getTime() : 0;
    const fb = b.ultimoMensajeEn ? new Date(b.ultimoMensajeEn).getTime() : 0;
    return fb - fa || b.id - a.id;
  });
}

/** Si un chat que llega en vivo (y no estaba en la lista) corresponde al filtro elegido. */
function cumpleFiltro(c: ConversacionResumen, filtro: FiltroConversaciones): boolean {
  if (filtro === 'no_leidos') return c.noLeidos > 0;
  if (filtro === 'leads') return c.leadId !== null;
  if (filtro === 'asesor') {
    return c.modo === 'manual' && (c.escaladoMotivo === 'palabra_clave' || c.escaladoMotivo === 'baja_confianza');
  }
  return true;
}

/** Tras sincronizar el historial llegan muchos lotes seguidos: se recarga una vez al final. */
const ESPERA_RECARGA_MS = 1500;

export function Respuestas() {
  const [conversaciones, setConversaciones] = useState<ConversacionResumen[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [filtro, setFiltro] = useState<FiltroConversaciones>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<ConversacionDetalle | null>(null);
  const [mostrarFicha, setMostrarFicha] = useState(false);

  // Cada consulta de la lista tiene un numero: si el usuario cambia de filtro
  // o busqueda antes de que llegue la respuesta anterior, esa se descarta.
  const consultaRef = useRef(0);
  const cargandoMasRef = useRef(false);
  const recargaPendienteRef = useRef<ReturnType<typeof setTimeout>>();

  const rutaLista = useCallback(
    (cursorPagina?: string) => {
      const params = new URLSearchParams({ filtro });
      if (busquedaAplicada) params.set('q', busquedaAplicada);
      if (cursorPagina) params.set('cursor', cursorPagina);
      return `/conversaciones?${params.toString()}`;
    },
    [filtro, busquedaAplicada],
  );

  const recargar = useCallback(() => {
    const consulta = ++consultaRef.current;
    api
      .get<PaginaConversaciones>(rutaLista())
      .then((pagina) => {
        if (consulta !== consultaRef.current) return;
        setConversaciones(pagina.conversaciones);
        setCursor(pagina.siguienteCursor);
      })
      .catch(() => {
        if (consulta === consultaRef.current) setConversaciones([]);
      });
  }, [rutaLista]);

  useEffect(() => {
    setConversaciones(null);
    recargar();
  }, [recargar]);

  // La busqueda se aplica cuando se deja de escribir, no en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setBusquedaAplicada(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  function cargarMas() {
    if (!cursor || cargandoMasRef.current) return;
    cargandoMasRef.current = true;
    setCargandoMas(true);
    const consulta = consultaRef.current;
    api
      .get<PaginaConversaciones>(rutaLista(cursor))
      .then((pagina) => {
        if (consulta !== consultaRef.current) return;
        setConversaciones((prev) => {
          const ids = new Set((prev ?? []).map((c) => c.id));
          return [...(prev ?? []), ...pagina.conversaciones.filter((c) => !ids.has(c.id))];
        });
        setCursor(pagina.siguienteCursor);
      })
      .catch(() => undefined)
      .finally(() => {
        cargandoMasRef.current = false;
        setCargandoMas(false);
      });
  }

  // Abrir un chat: trae solo su ultima pagina de mensajes y lo marca leido.
  useEffect(() => {
    if (!seleccionadaId) {
      setDetalle(null);
      return;
    }
    let vigente = true;
    api.get<ConversacionDetalle>(`/conversaciones/${seleccionadaId}`).then((d) => {
      if (vigente) setDetalle(d);
    });
    void api.post(`/conversaciones/${seleccionadaId}/marcar-leida`);
    return () => {
      vigente = false;
    };
  }, [seleccionadaId]);

  async function cargarAnteriores() {
    const actual = detalle;
    const primero = actual?.mensajes[0];
    if (!actual || !primero) return;
    const pagina = await api.get<{ mensajes: MensajeConversacion[]; hayMas: boolean }>(
      `/conversaciones/${actual.id}/mensajes?antesDe=${primero.id}`,
    );
    setDetalle((prev) => {
      if (!prev || prev.id !== actual.id) return prev;
      const ids = new Set(prev.mensajes.map((m) => m.id));
      return {
        ...prev,
        mensajes: [...pagina.mensajes.filter((m) => !ids.has(m.id)), ...prev.mensajes],
        hayMasMensajes: pagina.hayMas,
      };
    });
  }

  // Si llega un mensaje al chat que se esta mirando, ya esta leido.
  const marcarLeidaPendienteRef = useRef<ReturnType<typeof setTimeout>>();
  function marcarLeidaEnSegundos(id: number) {
    clearTimeout(marcarLeidaPendienteRef.current);
    marcarLeidaPendienteRef.current = setTimeout(() => {
      if (document.visibilityState === 'visible') void api.post(`/conversaciones/${id}/marcar-leida`);
    }, 800);
  }

  useSSE(['conversaciones'], {
    'conversacion:actualizada': (datos) => {
      const c = datos as ConversacionResumen;
      setConversaciones((prev) => {
        if (!prev) return prev;
        const existe = prev.some((x) => x.id === c.id);
        if (!existe && (busquedaAplicada || !cumpleFiltro(c, filtro))) return prev;
        return ordenar(existe ? prev.map((x) => (x.id === c.id ? c : x)) : [c, ...prev]);
      });
      setDetalle((prev) => (prev && prev.id === c.id ? { ...prev, ...c } : prev));
    },
    'conversaciones:sincronizadas': () => {
      clearTimeout(recargaPendienteRef.current);
      recargaPendienteRef.current = setTimeout(recargar, ESPERA_RECARGA_MS);
    },
    'mensaje:nuevo': (datos) => {
      const { conversacionId, mensaje } = datos as { conversacionId: number; mensaje: MensajeConversacion };
      setDetalle((prev) =>
        prev && prev.id === conversacionId && !prev.mensajes.some((m) => m.id === mensaje.id)
          ? { ...prev, mensajes: [...prev.mensajes, mensaje] }
          : prev,
      );
      if (mensaje.autor === 'lead' && conversacionId === seleccionadaId) marcarLeidaEnSegundos(conversacionId);
    },
    'mensaje:estado': (datos) => {
      const { conversacionId, mensajeId, estado } = datos as {
        conversacionId: number;
        mensajeId: number;
        estado: EstadoEntrega;
      };
      setDetalle((prev) =>
        prev && prev.id === conversacionId
          ? { ...prev, mensajes: prev.mensajes.map((m) => (m.id === mensajeId ? { ...m, estadoEntrega: estado } : m)) }
          : prev,
      );
    },
  });

  useEffect(
    () => () => {
      clearTimeout(recargaPendienteRef.current);
      clearTimeout(marcarLeidaPendienteRef.current);
    },
    [],
  );

  return (
    <div>
      <EncabezadoPagina
        titulo="Chats"
        descripcion="Todos los chats de WhatsApp de tus números, los más recientes primero."
      />

      <Tarjeta sinPadding className={estilos.layout}>
        <div className={estilos.columnaLista}>
          <ListaConversaciones
            conversaciones={conversaciones}
            seleccionadaId={seleccionadaId}
            onSeleccionar={setSeleccionadaId}
            filtro={filtro}
            onFiltro={setFiltro}
            busqueda={busqueda}
            onBusqueda={setBusqueda}
            hayMas={cursor !== null}
            cargandoMas={cargandoMas}
            onCargarMas={cargarMas}
          />
        </div>
        <div className={estilos.columnaDetalle}>
          {detalle && detalle.id === seleccionadaId ? (
            <DetalleConversacion
              conversacion={detalle}
              onVerFicha={() => setMostrarFicha(true)}
              onCargarAnteriores={cargarAnteriores}
            />
          ) : (
            <EstadoVacio titulo={seleccionadaId ? 'Cargando…' : 'Elige un chat'} />
          )}
        </div>
      </Tarjeta>

      {mostrarFicha && detalle && <FichaLead conversacion={detalle} onCerrar={() => setMostrarFicha(false)} />}
    </div>
  );
}
