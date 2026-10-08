import { useState } from 'react';
import { Boton } from '../../components/ui/Boton';
import { Badge } from '../../components/ui/Badge';
import { api, ErrorApi } from '../../lib/api';
import { formatearFecha } from '../../lib/fecha';
import type { LeadExcluido, ListaLeads } from '../../lib/types';
import { LeadsDeLista } from './LeadsDeLista';
import { ETIQUETA_MOTIVO, TONO_MOTIVO } from './motivos';
import estilos from './TablaListas.module.css';

type Panel = 'leads' | 'excluidas' | null;

type PropsFila = {
  lista: ListaLeads;
  onEliminada: (id: number, accion: 'eliminada' | 'archivada') => void;
  onCambio: () => void;
};

function FilaLista({ lista, onEliminada, onCambio }: PropsFila) {
  const [panel, setPanel] = useState<Panel>(null);
  const [excluidos, setExcluidos] = useState<LeadExcluido[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function abrir(siguiente: Panel) {
    const nuevo = panel === siguiente ? null : siguiente;
    setPanel(nuevo);
    if (nuevo === 'excluidas' && excluidos === null) {
      setCargando(true);
      try {
        setExcluidos(await api.get<LeadExcluido[]>(`/listas-leads/${lista.id}/excluidos`));
      } finally {
        setCargando(false);
      }
    }
  }

  async function ejecutar(accion: () => Promise<void>) {
    setProcesando(true);
    setError(null);
    try {
      await accion();
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo completar la acción');
    } finally {
      setProcesando(false);
    }
  }

  function eliminar() {
    const confirmado = window.confirm(
      `¿Eliminar la lista "${lista.nombre}"?\n\n` +
        'Si nunca se usó en una campaña se borra por completo. Si ya se usó, se archiva: ' +
        'deja de verse aquí, pero sus campañas y métricas se conservan.',
    );
    if (!confirmado) return;
    void ejecutar(async () => {
      const { accion } = await api.delete<{ accion: 'eliminada' | 'archivada' }>(`/listas-leads/${lista.id}`);
      onEliminada(lista.id, accion);
    });
  }

  return (
    <div>
      <div className={estilos.fila}>
        <div className={estilos.nombre}>
          {lista.nombre}
          {lista.nombreArchivoOriginal && <div className={estilos.archivo}>{lista.nombreArchivoOriginal}</div>}
        </div>
        <div className={estilos.fecha}>{formatearFecha(lista.creadoEn)}</div>
        <div className={estilos.validas}>{lista.validas}</div>
        <div className={estilos.invalidas}>{lista.invalidas}</div>
        <div className={estilos.acciones}>
          <Boton variante="secundario" onClick={() => void abrir('leads')}>
            {panel === 'leads' ? 'Ocultar' : 'Ver leads'}
          </Boton>
          {lista.invalidas > 0 && (
            <Boton variante="texto" onClick={() => void abrir('excluidas')}>
              {panel === 'excluidas' ? 'Ocultar excluidas' : 'Excluidas'}
            </Boton>
          )}
          <Boton
            variante="texto"
            onClick={() => void ejecutar(() => api.descargar(`/listas-leads/${lista.id}/exportar`))}
            disabled={procesando}
            title="Descarga los leads con su etapa actual en Excel"
          >
            Exportar
          </Boton>
          {lista.tieneArchivo && (
            <Boton
              variante="texto"
              onClick={() => void ejecutar(() => api.descargar(`/listas-leads/${lista.id}/archivo`))}
              disabled={procesando}
              title="Descarga el archivo tal como lo subiste"
            >
              Original
            </Boton>
          )}
          <Boton variante="texto" onClick={eliminar} disabled={procesando}>
            Eliminar
          </Boton>
        </div>
      </div>

      {error && <div className={estilos.error}>{error}</div>}

      {panel === 'leads' && <LeadsDeLista lista={lista} onCambio={onCambio} />}

      {panel === 'excluidas' && (
        <div className={estilos.detalle}>
          <div className={estilos.tituloDetalle}>Filas excluidas al subir el archivo y motivo</div>
          {cargando && <div className={estilos.sinExcluidos}>Cargando…</div>}
          {!cargando &&
            excluidos?.map((fila) => (
              <div className={estilos.filaExcluida} key={fila.id}>
                <span className={estilos.numeroFila}>Fila {fila.filaNumero}</span>
                <Badge tono={TONO_MOTIVO[fila.motivo]}>{ETIQUETA_MOTIVO[fila.motivo]}</Badge>
                <span className={estilos.datoReferencia}>{fila.datoReferencia}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

type Props = {
  listas: ListaLeads[];
  onEliminada: (id: number, accion: 'eliminada' | 'archivada') => void;
  onCambio: () => void;
};

export function TablaListas({ listas, onEliminada, onCambio }: Props) {
  return (
    <div>
      <div className={estilos.encabezado}>
        <div>Nombre</div>
        <div>Fecha</div>
        <div>Válidas</div>
        <div>Inválidas</div>
        <div />
      </div>
      {listas.map((lista) => (
        <FilaLista key={lista.id} lista={lista} onEliminada={onEliminada} onCambio={onCambio} />
      ))}
    </div>
  );
}
