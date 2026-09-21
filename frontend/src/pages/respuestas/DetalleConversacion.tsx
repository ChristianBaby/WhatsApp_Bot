import { useEffect, useRef, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Boton } from '../../components/ui/Boton';
import { api, ErrorApi } from '../../lib/api';
import { formatearHora } from '../../lib/fecha';
import type { ConversacionDetalle } from '../../lib/types';
import { ETAPA_INFO, infoEtapa } from './etapa';
import estilos from './DetalleConversacion.module.css';

type Props = {
  conversacion: ConversacionDetalle;
  onVerFicha: () => void;
};

const OPCIONES_SUGERENCIA = ['interesado', 'no_interesado', 'duda_precio'] as const;

export function DetalleConversacion({ conversacion, onVerFicha }: Props) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const hiloRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hiloRef.current?.scrollTo({ top: hiloRef.current.scrollHeight });
  }, [conversacion.id, conversacion.mensajes.length]);

  // Cambiar de conversacion cierra cualquier "Corregir" que haya quedado abierto.
  useEffect(() => setCorrigiendo(false), [conversacion.id]);

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

  async function cambiarModo(modo: 'bot' | 'manual') {
    await api.post(`/conversaciones/${conversacion.id}/modo`, { modo });
  }

  async function aplicarEtapa(etapa: string) {
    await api.patch(`/conversaciones/${conversacion.id}/etapa`, { etapa });
    setCorrigiendo(false);
  }

  async function marcarVenta() {
    if (!window.confirm(`¿Marcar "${conversacion.empresa}" como venta concretada?`)) return;
    await aplicarEtapa('venta_concretada');
  }

  const etapa = infoEtapa(conversacion.etapaPipeline);
  const sugerencia = conversacion.iaSugerencia ? infoEtapa(conversacion.iaSugerencia) : null;
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

      {conversacion.modo === 'bot' ? (
        <div className={estilos.bannerBot}>
          <span>🤖 El bot está respondiendo automáticamente en esta conversación</span>
          <Boton variante="secundario" onClick={() => void cambiarModo('manual')}>
            Responder yo mismo
          </Boton>
        </div>
      ) : (
        <div className={estilos.bannerManual}>
          <div className={estilos.bannerManualFila}>
            <span>🙋 La estás atendiendo tú, el bot está pausado aquí</span>
            <Boton variante="secundario" onClick={() => void cambiarModo('bot')}>
              Reactivar bot
            </Boton>
          </div>
          {conversacion.escaladoMotivo === 'palabra_clave' && (
            <div className={estilos.bannerSubnota}>El lead pidió hablar con un asesor.</div>
          )}
          {conversacion.escaladoMotivo === 'baja_confianza' && (
            <div className={estilos.bannerSubnota}>El bot no pudo responder esta consulta con confianza.</div>
          )}
        </div>
      )}

      <div className={estilos.hilo} ref={hiloRef}>
        {conversacion.mensajes.map((m) => (
          <div
            key={m.id}
            className={estilos.filaBurbuja}
            style={{ justifyContent: m.autor === 'yo' ? 'flex-end' : 'flex-start' }}
          >
            <div className={`${estilos.burbuja} ${m.autor === 'yo' ? estilos.burbujaYo : estilos.burbujaLead}`}>
              {m.autor === 'bot' && <div className={estilos.etiquetaBot}>🤖 Bot</div>}
              {m.texto}
              <div className={estilos.horaBurbuja}>{formatearHora(m.creadoEn)}</div>
            </div>
          </div>
        ))}
      </div>

      {sugerencia && (
        <div className={estilos.tarjetaSugerencia}>
          <div>
            <strong>IA sugiere:</strong> {sugerencia.etiqueta} — según el texto de su respuesta
          </div>
          {!corrigiendo ? (
            <div className={estilos.sugerenciaAcciones}>
              <Boton onClick={() => void aplicarEtapa(conversacion.iaSugerencia!)}>Confirmar</Boton>
              <Boton variante="secundario" onClick={() => setCorrigiendo(true)}>
                Corregir
              </Boton>
            </div>
          ) : (
            <div className={estilos.sugerenciaAcciones}>
              {OPCIONES_SUGERENCIA.filter((o) => o !== conversacion.iaSugerencia).map((opcion) => (
                <Boton key={opcion} variante="secundario" onClick={() => void aplicarEtapa(opcion)}>
                  {ETAPA_INFO[opcion]?.etiqueta}
                </Boton>
              ))}
            </div>
          )}
        </div>
      )}

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
      {error && (
        <div className={estilos.notaAyuda} style={{ color: 'var(--peligro)' }}>
          {error}
        </div>
      )}
      <div className={estilos.notaAyuda}>
        Escribe y envía directo desde aquí — usa la sesión de WhatsApp del número correspondiente. Al responder, esta
        conversación pasa a modo manual (🙋).
      </div>

      <div className={estilos.acciones}>
        <a href={urlWhatsapp} target="_blank" rel="noreferrer">
          <Boton variante="secundario">Abrir en WhatsApp ↗</Boton>
        </a>
        <Boton variante="secundario" onClick={onVerFicha}>
          Ver ficha del lead
        </Boton>
        {conversacion.etapaPipeline !== 'venta_concretada' && (
          <Boton variante="secundario" onClick={() => void marcarVenta()}>
            🏆 Marcar venta concretada
          </Boton>
        )}
      </div>
    </div>
  );
}
