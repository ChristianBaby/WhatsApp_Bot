import { useState } from 'react';
import { Boton } from '../../components/ui/Boton';
import { Badge } from '../../components/ui/Badge';
import { api } from '../../lib/api';
import { formatearFecha } from '../../lib/fecha';
import type { LeadExcluido, ListaLeads } from '../../lib/types';
import { ETIQUETA_MOTIVO, TONO_MOTIVO } from './motivos';
import estilos from './TablaListas.module.css';

function FilaLista({ lista }: { lista: ListaLeads }) {
  const [abierta, setAbierta] = useState(false);
  const [excluidos, setExcluidos] = useState<LeadExcluido[] | null>(null);
  const [cargando, setCargando] = useState(false);

  async function alternar() {
    const siguiente = !abierta;
    setAbierta(siguiente);
    if (siguiente && excluidos === null && lista.invalidas > 0) {
      setCargando(true);
      try {
        setExcluidos(await api.get<LeadExcluido[]>(`/listas-leads/${lista.id}/excluidos`));
      } finally {
        setCargando(false);
      }
    }
  }

  return (
    <div>
      <div className={estilos.fila}>
        <div className={estilos.nombre}>{lista.nombre}</div>
        <div className={estilos.fecha}>{formatearFecha(lista.creadoEn)}</div>
        <div className={estilos.validas}>{lista.validas}</div>
        <div className={estilos.invalidas}>{lista.invalidas}</div>
        <div>
          <Boton variante="secundario" onClick={() => void alternar()} disabled={lista.invalidas === 0}>
            {abierta ? 'Ocultar detalle' : 'Ver detalle'}
          </Boton>
        </div>
      </div>

      {abierta && lista.invalidas > 0 && (
        <div className={estilos.detalle}>
          <div className={estilos.tituloDetalle}>Filas excluidas y motivo</div>
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

export function TablaListas({ listas }: { listas: ListaLeads[] }) {
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
        <FilaLista key={lista.id} lista={lista} />
      ))}
    </div>
  );
}
