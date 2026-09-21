import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { Boton } from '../../components/ui/Boton';
import { api } from '../../lib/api';
import { formatearRelativo } from '../../lib/fecha';
import type { ConversacionDetalle } from '../../lib/types';
import { infoEtapa } from './etapa';
import estilos from './FichaLead.module.css';

export function FichaLead({ conversacion, onCerrar }: { conversacion: ConversacionDetalle; onCerrar: () => void }) {
  const [notas, setNotas] = useState(conversacion.notas ?? '');
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const etapa = infoEtapa(conversacion.etapaPipeline);

  async function guardarNota() {
    setGuardando(true);
    setGuardado(false);
    try {
      await api.patch(`/conversaciones/${conversacion.id}/notas`, { notas });
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal titulo={conversacion.empresa ?? `+${conversacion.telefono}`} onCerrar={onCerrar}>
      <p style={{ color: 'var(--texto-suave)', fontSize: 12.5, marginTop: -8, marginBottom: 16 }}>
        {conversacion.nombreContacto ?? '—'} · +{conversacion.telefono}
      </p>

      <div className={estilos.badges}>
        {etapa && <Badge tono={etapa.tono}>{etapa.etiqueta}</Badge>}
        {conversacion.rubro && <Badge tono="neutro">Rubro: {conversacion.rubro}</Badge>}
      </div>

      <div className={estilos.seccion}>
        <div className={estilos.tituloSeccion}>Campañas recibidas</div>
        <div className={estilos.valor}>{conversacion.campanaNombre ?? 'Ninguna campaña registrada'}</div>
      </div>

      <div className={estilos.seccion}>
        <div className={estilos.tituloSeccion}>Resumen de la conversación</div>
        <div className={estilos.valor}>
          {conversacion.mensajes.length} mensajes
          {conversacion.ultimoMensajeEn && ` · última actividad ${formatearRelativo(conversacion.ultimoMensajeEn)}`}
        </div>
      </div>

      <div className={estilos.seccion}>
        <div className={estilos.tituloSeccion}>Notas internas</div>
        <textarea
          className={estilos.textarea}
          rows={3}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Agrega una nota sobre este lead…"
        />
        <Boton onClick={() => void guardarNota()} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar nota'}
        </Boton>
        {guardado && <span className={estilos.guardado}>✓ Guardado</span>}
      </div>
    </Modal>
  );
}
