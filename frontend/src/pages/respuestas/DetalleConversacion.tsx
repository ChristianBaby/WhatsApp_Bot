import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Boton } from '../../components/ui/Boton';
import { api, ErrorApi } from '../../lib/api';
import { formatearFecha } from '../../lib/fecha';
import type { ConversacionDetalle } from '../../lib/types';
import { Burbuja } from './Burbuja';
import { ETAPA_INFO, infoEtapa } from './etapa';
import { nombreDeChat } from './nombreChat';
import { Visor } from './Visor';
import estilos from './DetalleConversacion.module.css';

type Props = {
  conversacion: ConversacionDetalle;
  onVerFicha: () => void;
  /** Trae la pagina de mensajes anterior a la mas vieja que se ve. */
  onCargarAnteriores: () => Promise<void>;
};

const OPCIONES_SUGERENCIA = ['interesado', 'no_interesado', 'duda_precio'] as const;
const MAX_ARCHIVO_BYTES = 16 * 1024 * 1024;
/** A cuantos px del borde se considera "arriba del todo" / "abajo del todo". */
const MARGEN_SCROLL = 120;

function etiquetaDia(iso: string): string {
  const fecha = new Date(iso);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (fecha.toDateString() === hoy.toDateString()) return 'Hoy';
  if (fecha.toDateString() === ayer.toDateString()) return 'Ayer';
  return formatearFecha(iso);
}

/** Cuanto queda resaltado el mensaje al que se salta desde una cita. */
const RESALTADO_MS = 1600;

export function DetalleConversacion({ conversacion, onVerFicha, onCargarAnteriores }: Props) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [cargandoAnteriores, setCargandoAnteriores] = useState(false);
  const [visorId, setVisorId] = useState<number | null>(null);
  const [resaltadoId, setResaltadoId] = useState<string | null>(null);
  const hiloRef = useRef<HTMLDivElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  const mensajes = conversacion.mensajes;
  const porWhatsappId = useMemo(
    () => new Map(mensajes.filter((m) => m.whatsappId).map((m) => [m.whatsappId!, m])),
    [mensajes],
  );
  // Lo que se puede recorrer en el visor: fotos y videos (no GIFs ni notas de video) que siguen en el chat.
  const fotosYVideos = useMemo(
    () =>
      mensajes.filter(
        (m) =>
          !m.eliminado &&
          m.media &&
          (m.tipo === 'imagen' || (m.tipo === 'video' && !m.media.gif && !m.media.circular)),
      ),
    [mensajes],
  );

  /** Salta al mensaje citado (si esta cargado) y lo resalta un momento. */
  function irACita(whatsappId: string) {
    const destino = hiloRef.current?.querySelector(`[data-wid="${CSS.escape(whatsappId)}"]`);
    if (!destino) return;
    destino.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setResaltadoId(whatsappId);
    setTimeout(() => setResaltadoId((actual) => (actual === whatsappId ? null : actual)), RESALTADO_MS);
  }
  const primeroId = mensajes[0]?.id ?? null;
  const ultimo = mensajes[mensajes.length - 1];

  // Lo que habia en pantalla antes de este render: para saber si los
  // mensajes nuevos se agregaron arriba (paginas viejas: mantener la vista
  // donde estaba) o abajo (mensaje nuevo: bajar si ya se estaba abajo).
  const previo = useRef({ conversacionId: 0, primeroId: null as number | null, ultimoId: null as number | null, alto: 0, arriba: 0, abajo: true });

  function recordarScroll() {
    const hilo = hiloRef.current;
    if (!hilo) return;
    previo.current.alto = hilo.scrollHeight;
    previo.current.arriba = hilo.scrollTop;
    previo.current.abajo = hilo.scrollHeight - hilo.scrollTop - hilo.clientHeight < MARGEN_SCROLL;
  }

  useLayoutEffect(() => {
    const hilo = hiloRef.current;
    if (!hilo) return;
    const antes = previo.current;

    if (antes.conversacionId !== conversacion.id) {
      hilo.scrollTop = hilo.scrollHeight;
    } else if (primeroId !== antes.primeroId && antes.primeroId !== null) {
      hilo.scrollTop = hilo.scrollHeight - antes.alto + antes.arriba;
    } else if (ultimo && ultimo.id !== antes.ultimoId && (antes.abajo || ultimo.autor !== 'lead')) {
      hilo.scrollTop = hilo.scrollHeight;
    }

    previo.current = { ...antes, conversacionId: conversacion.id, primeroId, ultimoId: ultimo?.id ?? null };
    recordarScroll();
  }, [conversacion.id, primeroId, ultimo]);

  // Cambiar de conversacion cierra cualquier "Corregir" o visor que haya quedado abierto.
  useEffect(() => {
    setCorrigiendo(false);
    setError(null);
    setVisorId(null);
  }, [conversacion.id]);

  async function alDesplazar() {
    recordarScroll();
    const hilo = hiloRef.current;
    if (!hilo || hilo.scrollTop > MARGEN_SCROLL || !conversacion.hayMasMensajes || cargandoAnteriores) return;
    setCargandoAnteriores(true);
    try {
      await onCargarAnteriores();
    } finally {
      setCargandoAnteriores(false);
    }
  }

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

  async function enviarArchivo(archivo: File) {
    if (archivo.size > MAX_ARCHIVO_BYTES) {
      setError('El archivo pesa más de 16 MB, el máximo que permite WhatsApp.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const datos = new FormData();
      datos.append('archivo', archivo);
      // Lo que esté escrito en la caja va como texto de la foto/video/documento.
      if (texto.trim()) datos.append('texto', texto.trim());
      await api.post(`/conversaciones/${conversacion.id}/adjuntos`, datos);
      setTexto('');
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo enviar el archivo');
    } finally {
      setEnviando(false);
      if (archivoRef.current) archivoRef.current.value = '';
    }
  }

  async function cambiarModo(modo: 'bot' | 'manual') {
    await api.post(`/conversaciones/${conversacion.id}/modo`, { modo });
  }

  async function aplicarEtapa(etapa: string) {
    await api.patch(`/conversaciones/${conversacion.id}/etapa`, { etapa });
    setCorrigiendo(false);
  }

  const nombre = nombreDeChat(conversacion);

  async function marcarVenta() {
    if (!window.confirm(`¿Marcar "${nombre}" como venta concretada?`)) return;
    await aplicarEtapa('venta_concretada');
  }

  const etapa = infoEtapa(conversacion.etapaPipeline);
  const sugerencia = conversacion.iaSugerencia ? infoEtapa(conversacion.iaSugerencia) : null;
  const esLead = conversacion.leadId !== null;
  const otrosNombres = [conversacion.nombreContacto, conversacion.empresa].filter((n) => n && n !== nombre);

  return (
    <div className={estilos.contenedor}>
      <div className={estilos.encabezado}>
        <div>
          <div className={estilos.nombreFila}>
            <span className={estilos.nombre}>{nombre}</span>
            {etapa && <Badge tono={etapa.tono}>{etapa.etiqueta}</Badge>}
          </div>
          <div className={estilos.subtitulo}>
            +{conversacion.telefono}
            {otrosNombres.length > 0 && ` · ${otrosNombres.join(' · ')}`}
            {conversacion.rubro && ` · Rubro: ${conversacion.rubro}`}
          </div>
        </div>
        {conversacion.campanaNombre && <div className={estilos.campana}>Campaña: {conversacion.campanaNombre}</div>}
      </div>

      {conversacion.modo === 'bot' ? (
        <div className={estilos.bannerBot}>
          <span>🤖 El bot responde automáticamente en este chat (si el auto-responder está activado)</span>
          <Boton variante="secundario" onClick={() => void cambiarModo('manual')}>
            Responder yo mismo
          </Boton>
        </div>
      ) : (
        <div className={estilos.bannerManual}>
          <div className={estilos.bannerManualFila}>
            <span>🙋 Lo estás atendiendo tú, el bot está pausado aquí</span>
            <Boton variante="secundario" onClick={() => void cambiarModo('bot')}>
              Reactivar bot
            </Boton>
          </div>
          {conversacion.escaladoMotivo === 'palabra_clave' && (
            <div className={estilos.bannerSubnota}>El cliente pidió hablar con un asesor.</div>
          )}
          {conversacion.escaladoMotivo === 'baja_confianza' && (
            <div className={estilos.bannerSubnota}>El bot no pudo responder esta consulta con confianza.</div>
          )}
          {conversacion.escaladoMotivo === 'limite_respuestas' && (
            <div className={estilos.bannerSubnota}>
              El bot alcanzó su límite de respuestas en este chat (posible conversación con otro bot o respuesta automática).
            </div>
          )}
          {conversacion.escaladoMotivo === 'pidio_baja' && (
            <div className={estilos.bannerSubnota}>
              Este contacto pidió no recibir más mensajes: está fuera de las campañas y de las respuestas automáticas.
            </div>
          )}
        </div>
      )}

      <div className={estilos.hilo} ref={hiloRef} onScroll={() => void alDesplazar()}>
        {conversacion.hayMasMensajes && (
          <div className={estilos.cargandoAnteriores}>
            {cargandoAnteriores ? 'Cargando mensajes anteriores…' : 'Sube para ver mensajes anteriores'}
          </div>
        )}

        {mensajes.map((m, i) => {
          const dia = etiquetaDia(m.creadoEn);
          const diaAnterior = i > 0 ? etiquetaDia(mensajes[i - 1]!.creadoEn) : null;
          const citaId = m.extra?.cita?.whatsappId;
          return (
            <div key={m.id}>
              {dia !== diaAnterior && (
                <div className={estilos.separadorDia}>
                  <span>{dia}</span>
                </div>
              )}
              <Burbuja
                conversacionId={conversacion.id}
                mensaje={m}
                nombreContacto={nombre}
                citado={citaId ? porWhatsappId.get(citaId) : undefined}
                resaltado={resaltadoId === m.whatsappId}
                onIrACita={irACita}
                onAbrirVisor={setVisorId}
              />
            </div>
          );
        })}
      </div>

      {visorId !== null && (
        <Visor
          conversacionId={conversacion.id}
          items={fotosYVideos}
          inicialId={visorId}
          nombreContacto={nombre}
          onCerrar={() => setVisorId(null)}
        />
      )}

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
          ref={archivoRef}
          type="file"
          hidden
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) void enviarArchivo(archivo);
          }}
        />
        <button
          className={estilos.botonAdjuntar}
          title="Enviar foto, video, audio o documento"
          onClick={() => archivoRef.current?.click()}
          disabled={enviando}
        >
          📎
        </button>
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
          placeholder={enviando ? 'Enviando…' : 'Escribe un mensaje…'}
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
        Se envía desde el WhatsApp de este número. 📎 para fotos, videos, audios o documentos (lo escrito en la caja va
        como texto del archivo). Al responder, el chat pasa a modo manual (🙋).
      </div>

      {esLead && (
        <div className={estilos.acciones}>
          <Boton variante="secundario" onClick={onVerFicha}>
            Ver ficha del lead
          </Boton>
          {conversacion.etapaPipeline !== 'venta_concretada' && (
            <Boton variante="secundario" onClick={() => void marcarVenta()}>
              🏆 Marcar venta concretada
            </Boton>
          )}
        </div>
      )}
    </div>
  );
}
