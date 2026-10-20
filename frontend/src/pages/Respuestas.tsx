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
  Etiqueta,
  FiltroConversaciones,
  MensajeConversacion,
  PaginaConversaciones,
  PresenciaChat,
  Recordatorio,
} from '../lib/types';
import { ListaConversaciones } from './respuestas/ListaConversaciones';
import { DetalleConversacion } from './respuestas/DetalleConversacion';
import estilos from './Respuestas.module.css';
import crm from './respuestas/Crm.module.css';

/** Los fijados arriba y despues los mas recientes primero (mismo orden que el backend). */
function ordenar(lista: ConversacionResumen[]): ConversacionResumen[] {
  return [...lista].sort((a, b) => {
    if (a.fijado !== b.fijado) return a.fijado ? -1 : 1;
    const fa = a.ultimoMensajeEn ? new Date(a.ultimoMensajeEn).getTime() : 0;
    const fb = b.ultimoMensajeEn ? new Date(b.ultimoMensajeEn).getTime() : 0;
    return fb - fa || b.id - a.id;
  });
}

/** Los archivados solo se ven en su filtro (o al buscar), como en WhatsApp. */
function cumpleArchivo(c: ConversacionResumen, filtro: FiltroConversaciones, buscando: boolean): boolean {
  if (filtro === 'archivados') return c.archivado;
  return buscando || !c.archivado;
}

/** Si un chat que llega en vivo (y no estaba en la lista) corresponde al filtro elegido. */
function cumpleFiltro(c: ConversacionResumen, filtro: FiltroConversaciones, yo: string | null, etiquetaId: number | null): boolean {
  if (etiquetaId && !c.etiquetas.some((e) => e.id === etiquetaId)) return false;
  if (filtro === 'mios') return Boolean(yo) && c.asignadoA?.id === yo;
  if (filtro === 'recordatorios') return c.proximoRecordatorio !== null;
  if (filtro === 'no_leidos') return c.noLeidos > 0;
  if (filtro === 'leads') return c.leadId !== null;
  if (filtro === 'grupos') return c.esGrupo;
  if (filtro === 'archivados') return c.archivado;
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
  /** Sube cuando cambian notas, recordatorios o etiquetas del chat abierto: su ficha se refresca. */
  const [versionCrm, setVersionCrm] = useState(0);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [etiquetaFiltro, setEtiquetaFiltro] = useState<number | null>(null);
  const [yo, setYo] = useState<string | null>(null);
  /** Recordatorios que vencieron mientras el panel estaba abierto. */
  const [avisos, setAvisos] = useState<{ recordatorio: Recordatorio; conversacionId: number; nombre: string }[]>([]);
  /** "escribiendo..." / "en linea" de cada chat, en vivo (no se guarda). */
  const [presencias, setPresencias] = useState<Record<number, PresenciaChat>>({});

  // Cada consulta de la lista tiene un numero: si el usuario cambia de filtro
  // o busqueda antes de que llegue la respuesta anterior, esa se descarta.
  const consultaRef = useRef(0);
  const cargandoMasRef = useRef(false);
  const recargaPendienteRef = useRef<ReturnType<typeof setTimeout>>();

  const rutaLista = useCallback(
    (cursorPagina?: string) => {
      const params = new URLSearchParams({ filtro });
      if (busquedaAplicada) params.set('q', busquedaAplicada);
      if (etiquetaFiltro) params.set('etiqueta', String(etiquetaFiltro));
      if (cursorPagina) params.set('cursor', cursorPagina);
      return `/conversaciones?${params.toString()}`;
    },
    [filtro, busquedaAplicada, etiquetaFiltro],
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

  useEffect(() => {
    void api.get<{ etiquetas: Etiqueta[] }>('/etiquetas').then((r) => setEtiquetas(r.etiquetas)).catch(() => undefined);
    void api
      .get<{ yo: string | null }>('/usuarios-panel')
      .then((r) => setYo(r.yo))
      .catch(() => undefined);
  }, []);

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
    // Para ver en el encabezado si el contacto esta escribiendo o en linea.
    void api.post(`/conversaciones/${seleccionadaId}/presencia`).catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [seleccionadaId]);

  /** Mensajes anteriores a los que se ven: una pagina, o todos hasta un mensaje (para saltar a uno viejo). */
  async function cargarAnteriores(hasta?: number) {
    const actual = detalle;
    const primero = actual?.mensajes[0];
    if (!actual || !primero) return;
    const pagina = await api.get<{ mensajes: MensajeConversacion[]; hayMas: boolean }>(
      `/conversaciones/${actual.id}/mensajes?antesDe=${primero.id}${hasta ? `&hasta=${hasta}` : ''}`,
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
        // Se archivo o desarchivo: sale de esta lista.
        if (existe && !cumpleArchivo(c, filtro, Boolean(busquedaAplicada))) return prev.filter((x) => x.id !== c.id);
        if (!existe && (busquedaAplicada || !cumpleFiltro(c, filtro, yo, etiquetaFiltro) || !cumpleArchivo(c, filtro, false))) {
          return prev;
        }
        return ordenar(existe ? prev.map((x) => (x.id === c.id ? c : x)) : [c, ...prev]);
      });
      setDetalle((prev) => (prev && prev.id === c.id ? { ...prev, ...c } : prev));
    },
    'conversaciones:sincronizadas': () => {
      clearTimeout(recargaPendienteRef.current);
      recargaPendienteRef.current = setTimeout(recargar, ESPERA_RECARGA_MS);
    },
    'conversacion:presencia': (datos) => {
      const { conversacionId, ...presencia } = datos as PresenciaChat & { conversacionId: number };
      setPresencias((prev) => ({ ...prev, [conversacionId]: { estado: presencia.estado, quien: presencia.quien ?? null } }));
    },
    'mensaje:nuevo': (datos) => {
      const { conversacionId, mensaje } = datos as { conversacionId: number; mensaje: MensajeConversacion };
      // Si mando un mensaje, ya no esta escribiendo (en un grupo, "en linea" no se muestra).
      if (mensaje.autor === 'lead') {
        setPresencias((prev) => {
          const actual = prev[conversacionId];
          if (!actual?.estado) return prev;
          const estado = mensaje.extra?.participante ? null : 'en_linea';
          return { ...prev, [conversacionId]: { estado, quien: null } };
        });
      }
      setDetalle((prev) =>
        prev && prev.id === conversacionId && !prev.mensajes.some((m) => m.id === mensaje.id)
          ? { ...prev, mensajes: [...prev.mensajes, mensaje] }
          : prev,
      );
      if (mensaje.autor === 'lead' && conversacionId === seleccionadaId) marcarLeidaEnSegundos(conversacionId);
    },
    // Reaccion, edicion o "eliminar para todos" sobre un mensaje que ya se ve.
    'mensaje:actualizado': (datos) => {
      const { conversacionId, mensaje } = datos as { conversacionId: number; mensaje: MensajeConversacion };
      setDetalle((prev) =>
        prev && prev.id === conversacionId
          ? { ...prev, mensajes: prev.mensajes.map((m) => (m.id === mensaje.id ? mensaje : m)) }
          : prev,
      );
    },
    'nota:cambio': (datos) => {
      if ((datos as { conversacionId: number }).conversacionId === seleccionadaId) setVersionCrm((v) => v + 1);
    },
    'recordatorio:cambio': (datos) => {
      if ((datos as { conversacionId: number }).conversacionId === seleccionadaId) setVersionCrm((v) => v + 1);
    },
    'etiquetas:actualizadas': (datos) => {
      setEtiquetas(datos as Etiqueta[]);
      setVersionCrm((v) => v + 1);
    },
    'recordatorio:vencido': (datos) => {
      const aviso = datos as { recordatorio: Recordatorio; conversacionId: number; nombre: string };
      setAvisos((prev) => [...prev.filter((a) => a.recordatorio.id !== aviso.recordatorio.id), aviso].slice(-4));
      if (aviso.conversacionId === seleccionadaId) setVersionCrm((v) => v + 1);
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
            etiquetas={etiquetas}
            etiquetaFiltro={etiquetaFiltro}
            onEtiquetaFiltro={setEtiquetaFiltro}
            hayMas={cursor !== null}
            cargandoMas={cargandoMas}
            onCargarMas={cargarMas}
          />
        </div>
        <div className={estilos.columnaDetalle}>
          {detalle && detalle.id === seleccionadaId ? (
            <DetalleConversacion
              conversacion={detalle}
              versionCrm={versionCrm}
              onCargarAnteriores={() => cargarAnteriores()}
              onCargarHasta={(id) => cargarAnteriores(id)}
              presencia={presencias[detalle.id] ?? null}
            />
          ) : (
            <EstadoVacio titulo={seleccionadaId ? 'Cargando…' : 'Elige un chat'} />
          )}
        </div>
      </Tarjeta>

      {avisos.length > 0 && (
        <div className={crm.avisos} role="status">
          {avisos.map((a) => (
            <div key={a.recordatorio.id} className={crm.aviso}>
              <strong>⏰ {a.nombre}</strong>
              <span>{a.recordatorio.texto}</span>
              <div className={crm.fila}>
                <button
                  type="button"
                  className={crm.etiqueta}
                  onClick={() => {
                    setSeleccionadaId(a.conversacionId);
                    setAvisos((prev) => prev.filter((x) => x !== a));
                  }}
                >
                  Abrir chat
                </button>
                <button type="button" className={crm.etiqueta} onClick={() => setAvisos((prev) => prev.filter((x) => x !== a))}>
                  Cerrar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
