import { Badge } from '../../components/ui/Badge';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { formatearRelativo } from '../../lib/fecha';
import type { ConversacionResumen } from '../../lib/types';
import { infoEtapa } from './etapa';
import estilos from './ListaConversaciones.module.css';

type Props = {
  conversaciones: ConversacionResumen[];
  seleccionadaId: number | null;
  onSeleccionar: (id: number) => void;
};

export function ListaConversaciones({ conversaciones, seleccionadaId, onSeleccionar }: Props) {
  if (conversaciones.length === 0) {
    return (
      <div style={{ padding: 20 }}>
        <EstadoVacio titulo="Sin respuestas todavía" detalle="Aquí aparecerán los leads que te contesten." />
      </div>
    );
  }

  return (
    <div className={estilos.lista}>
      {conversaciones.map((c) => {
        const etapa = infoEtapa(c.etapaPipeline);
        return (
          <button
            key={c.id}
            className={`${estilos.item} ${c.id === seleccionadaId ? estilos.seleccionado : ''}`}
            onClick={() => onSeleccionar(c.id)}
          >
            <div className={estilos.filaSuperior}>
              <span className={estilos.empresa} style={{ fontWeight: c.noLeidos > 0 ? 800 : 600 }}>
                {c.empresa ?? `+${c.telefono}`}
              </span>
              <span className={estilos.derecha}>
                {c.noLeidos > 0 && <span className={estilos.puntoNoLeido} />}
                <span className={estilos.hace}>{c.ultimoMensajeEn ? formatearRelativo(c.ultimoMensajeEn) : ''}</span>
              </span>
            </div>
            <div className={estilos.preview}>{c.ultimoMensajePreview}</div>
            {etapa && <Badge tono={etapa.tono}>{etapa.etiqueta}</Badge>}
          </button>
        );
      })}
    </div>
  );
}
