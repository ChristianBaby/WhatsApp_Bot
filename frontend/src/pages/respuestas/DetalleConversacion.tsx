import { useEffect, useRef, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Boton } from '../../components/ui/Boton';
import { api, ErrorApi } from '../../lib/api';
import { formatearHora } from '../../lib/fecha';
import type { ConversacionDetalle } from '../../lib/types';
import { infoEtapa } from './etapa';
import estilos from './DetalleConversacion.module.css';

type Props = {
  conversacion: ConversacionDetalle;
  onVerFicha: () => void;
};

export function DetalleConversacion({ conversacion, onVerFicha }: Props) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hiloRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hiloRef.current?.scrollTo({ top: hiloRef.current.scrollHeight });
  }, [conversacion.id, conversacion.mensajes.length]);

  async function enviar() {
    const valor = texto.trim();
    if (!valor) return;
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/conversaciones/${conversacion.id}/mensajes`, { texto: valor });
      setTexto('');
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo enviar el mensaje');
    } finally {
      setEnviando(false);
    }
  }

  async function marcarVenta(etapa: 'venta_concretada' | 'descartado') {
    const confirmado =
      etapa === 'venta_concretada'
        ? window.confirm(`¿Marcar "${conversacion.empresa}" como venta concretada?`)
        : window.confirm(`¿Marcar "${conversacion.empresa}" como descartado?`);
    if (!confirmado) return;
    await api.patch(`/conversaciones/${conversacion.id}/etapa`, { etapa });
  }

  const etapa = infoEtapa(conversacion.etapaPipeline);
  const urlWhatsapp = `https://wa.me/${conversacion.telefono}`;

  return (
    <div className={estilos.contenedor}>
      <div className={estilos.encabezado}>
        <div>
          <div className={estilos.nombreFila}>
            <span className={estilos.nombre}>{conversacion.empresa ?? `+${conversacion.telefono}`}</span>
            {etapa && <Badge tono={etapa.tono}>{etapa.etiqueta}</Badge>}
          </div>
          <div className={estilos.subtitulo}>
            {conversacion.nombreContacto ?? '—'} · +{conversacion.telefono}
            {conversacion.rubro && ` · Rubro: ${conversacion.rubro}`}
          </div>
        </div>
        {conversacion.campanaNombre && <div className={estilos.campana}>Campaña: {conversacion.campanaNombre}</div>}
      </div>

      <div className={estilos.hilo} ref={hiloRef}>
        {conversacion.mensajes.map((m) => (
          <div key={m.id} className={estilos.filaBurbuja} style={{ justifyContent: m.autor === 'yo' ? 'flex-end' : 'flex-start' }}>
            <div className={`${estilos.burbuja} ${m.autor === 'yo' ? estilos.burbujaYo : estilos.burbujaLead}`}>
              {m.texto}
              <div className={estilos.horaBurbuja}>{formatearHora(m.creadoEn)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={estilos.filaInput}>
        <input
          className={estilos.input}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          placeholder="Escribe una respuesta…"
          disabled={enviando}
        />
        <Boton onClick={() => void enviar()} disabled={enviando || !texto.trim()}>
          Enviar ➤
        </Boton>
      </div>
      {error && <div className={estilos.notaAyuda} style={{ color: 'var(--peligro)' }}>{error}</div>}
      <div className={estilos.notaAyuda}>
        Escribe y envía directo desde aquí — usa la sesión de WhatsApp del número correspondiente.
      </div>

      <div className={estilos.acciones}>
        <a href={urlWhatsapp} target="_blank" rel="noreferrer">
          <Boton variante="secundario">Abrir en WhatsApp ↗</Boton>
        </a>
        <Boton variante="secundario" onClick={onVerFicha}>
          Ver ficha del lead
        </Boton>
        {conversacion.etapaPipeline !== 'venta_concretada' && (
          <Boton variante="secundario" onClick={() => void marcarVenta('venta_concretada')}>
            🏆 Marcar venta concretada
          </Boton>
        )}
      </div>
    </div>
  );
}
