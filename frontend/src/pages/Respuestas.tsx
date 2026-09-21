import { useEffect, useState } from 'react';
import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { EstadoVacio } from '../components/ui/EstadoVacio';
import { Tarjeta } from '../components/ui/Tarjeta';
import { useSSE } from '../hooks/useSSE';
import { api } from '../lib/api';
import type { ConversacionDetalle, ConversacionResumen } from '../lib/types';
import { ListaConversaciones } from './respuestas/ListaConversaciones';
import { DetalleConversacion } from './respuestas/DetalleConversacion';
import { FichaLead } from './respuestas/FichaLead';
import estilos from './Respuestas.module.css';

export function Respuestas() {
  const [conversaciones, setConversaciones] = useState<ConversacionResumen[] | null>(null);
  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<ConversacionDetalle | null>(null);
  const [mostrarFicha, setMostrarFicha] = useState(false);

  useEffect(() => {
    api
      .get<ConversacionResumen[]>('/conversaciones')
      .then((lista) => {
        setConversaciones(lista);
        if (lista.length > 0) setSeleccionadaId(lista[0]!.id);
      })
      .catch(() => setConversaciones([]));
  }, []);

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

  useSSE(['conversaciones'], {
    'conversacion:actualizada': (datos) => {
      const c = datos as ConversacionResumen;
      setConversaciones((prev) => {
        const lista = prev ?? [];
        const existe = lista.some((x) => x.id === c.id);
        const siguiente = existe ? lista.map((x) => (x.id === c.id ? c : x)) : [c, ...lista];
        return [...siguiente].sort((a, b) => {
          const fa = a.ultimoMensajeEn ? new Date(a.ultimoMensajeEn).getTime() : 0;
          const fb = b.ultimoMensajeEn ? new Date(b.ultimoMensajeEn).getTime() : 0;
          return fb - fa;
        });
      });
      setDetalle((prev) => (prev && prev.id === c.id ? { ...prev, ...c } : prev));
    },
    'mensaje:nuevo': (datos) => {
      const { conversacionId, mensaje } = datos as { conversacionId: number; mensaje: ConversacionDetalle['mensajes'][number] };
      setDetalle((prev) =>
        prev && prev.id === conversacionId && !prev.mensajes.some((m) => m.id === mensaje.id)
          ? { ...prev, mensajes: [...prev.mensajes, mensaje] }
          : prev,
      );
    },
  });

  function seleccionar(id: number) {
    setSeleccionadaId(id);
  }

  return (
    <div>
      <EncabezadoPagina titulo="Respuestas" descripcion="Leads que contestaron tus campañas." />

      {conversaciones === null && (
        <Tarjeta>
          <EstadoVacio titulo="Cargando…" />
        </Tarjeta>
      )}

      {conversaciones !== null && conversaciones.length === 0 && (
        <Tarjeta>
          <EstadoVacio
            titulo="Todavía no hay respuestas"
            detalle="Cuando un lead conteste una campaña, la conversación aparecerá aquí."
          />
        </Tarjeta>
      )}

      {conversaciones !== null && conversaciones.length > 0 && (
        <Tarjeta sinPadding className={estilos.layout}>
          <div className={estilos.columnaLista}>
            <ListaConversaciones conversaciones={conversaciones} seleccionadaId={seleccionadaId} onSeleccionar={seleccionar} />
          </div>
          <div>
            {detalle ? (
              <DetalleConversacion conversacion={detalle} onVerFicha={() => setMostrarFicha(true)} />
            ) : (
              <EstadoVacio titulo="Elige una conversación" />
            )}
          </div>
        </Tarjeta>
      )}

      {mostrarFicha && detalle && <FichaLead conversacion={detalle} onCerrar={() => setMostrarFicha(false)} />}
    </div>
  );
}
