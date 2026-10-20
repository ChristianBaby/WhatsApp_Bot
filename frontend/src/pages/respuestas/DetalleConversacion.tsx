import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Boton } from '../../components/ui/Boton';
import { api, ErrorApi } from '../../lib/api';
import { formatearFecha } from '../../lib/fecha';
import type { ConversacionDetalle, MensajeConversacion, PresenciaChat, PresenciaContacto } from '../../lib/types';
import { Avatar } from './Avatar';
import { BuscarEnChat } from './BuscarEnChat';
import { Burbuja } from './Burbuja';
import { InfoChat } from './InfoChat';
import { Compositor, type CompositorHandle } from './Compositor';
import { colorEtiqueta } from './coloresEtiqueta';
import { FichaChat } from './FichaChat';
import type { AccionesMensaje } from './MenuMensaje';
import { ModalReenviar } from './ModalReenviar';
import { ETAPA_INFO, infoEtapa } from './etapa';
import { nombreDeAutor, nombreDeChat } from './nombreChat';
import { Visor } from './Visor';
import estilos from './DetalleConversacion.module.css';
import org from './Organizar.module.css';
import crm from './Crm.module.css';

type Props = {
  conversacion: ConversacionDetalle;
  /** Sube cuando cambian notas, recordatorios o etiquetas de este chat (la ficha se refresca). */
  versionCrm: number;
  /** Trae la pagina de mensajes anterior a la mas vieja que se ve. */
  onCargarAnteriores: () => Promise<void>;
  /** Trae todos los mensajes anteriores hasta este (para saltar a uno viejo). */
  onCargarHasta: (mensajeId: number) => Promise<void>;
  /** Si el contacto esta escribiendo, grabando o en linea ahora mismo (en un grupo, quien). */
  presencia: PresenciaChat | null;
};

const OPCIONES_SUGERENCIA = ['interesado', 'no_interesado', 'duda_precio'] as const;

const TEXTO_PRESENCIA: Record<NonNullable<PresenciaContacto>, string> = {
  escribiendo: 'escribiendo…',
  grabando: 'grabando audio…',
  en_linea: 'en línea',
};

function textoPresencia(presencia: PresenciaChat | null): string | null {
  if (!presencia?.estado) return null;
  const texto = TEXTO_PRESENCIA[presencia.estado];
  if (presencia.quien) return `${presencia.quien} está ${texto}`;
  return texto;
}
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

export function DetalleConversacion({ conversacion, versionCrm, onCargarAnteriores, onCargarHasta, presencia }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [cargandoAnteriores, setCargandoAnteriores] = useState(false);
  const [visorId, setVisorId] = useState<number | null>(null);
  const [resaltadoId, setResaltadoId] = useState<number | null>(null);
  /** Panel lateral abierto: la lupa o la info del chat. */
  const [panel, setPanel] = useState<'buscar' | 'info' | 'ficha' | null>(null);
  /** Mensaje viejo al que se quiere saltar, mientras se cargan los mensajes hasta el. */
  const saltoPendienteRef = useRef<number | null>(null);
  const [respondiendoA, setRespondiendoA] = useState<MensajeConversacion | null>(null);
  const [editando, setEditando] = useState<MensajeConversacion | null>(null);
  const [reenviando, setReenviando] = useState<MensajeConversacion | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const hiloRef = useRef<HTMLDivElement>(null);
  const compositorRef = useRef<CompositorHandle>(null);

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

  /** Lleva la vista a un mensaje del chat y lo resalta un momento. */
  function resaltar(destino: Element) {
    destino.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const id = Number((destino as HTMLElement).dataset.mid);
    setResaltadoId(id);
    setTimeout(() => setResaltadoId((actual) => (actual === id ? null : actual)), RESALTADO_MS);
  }

  /** Salta al mensaje citado (si esta cargado). */
  function irACita(whatsappId: string) {
    const destino = hiloRef.current?.querySelector(`[data-wid="${CSS.escape(whatsappId)}"]`);
    if (destino) resaltar(destino);
  }

  /** Salta a un mensaje desde la busqueda o la info del chat: si es viejo, primero se cargan los mensajes hasta el. */
  async function irAMensaje(m: MensajeConversacion) {
    if (panel === 'info') setPanel(null);
    const destino = hiloRef.current?.querySelector(`[data-mid="${m.id}"]`);
    if (destino) {
      resaltar(destino);
      return;
    }
    saltoPendienteRef.current = m.id;
    try {
      await onCargarHasta(m.id);
    } catch {
      saltoPendienteRef.current = null;
      setError('No se pudo cargar ese mensaje');
      return;
    }
    setTimeout(() => {
      if (saltoPendienteRef.current !== m.id) return;
      saltoPendienteRef.current = null;
      setError('Ese mensaje es muy antiguo para mostrarlo aquí: sube en el chat para llegar a él.');
    }, 500);
  }

  // Cuando llegan los mensajes hasta el buscado, se salta a el.
  useEffect(() => {
    const id = saltoPendienteRef.current;
    if (id === null) return;
    const destino = hiloRef.current?.querySelector(`[data-mid="${id}"]`);
    if (!destino) return;
    saltoPendienteRef.current = null;
    resaltar(destino);
  }, [mensajes]);
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

  // Cambiar de conversacion cierra cualquier "Corregir", visor, respuesta o edicion que haya quedado abierto.
  useEffect(() => {
    setCorrigiendo(false);
    setError(null);
    setVisorId(null);
    setRespondiendoA(null);
    setEditando(null);
    setReenviando(null);
    setPanel(null);
    saltoPendienteRef.current = null;
  }, [conversacion.id]);

  async function intentar(accion: () => Promise<unknown>, mensajeError: string) {
    setError(null);
    try {
      await accion();
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : mensajeError);
    }
  }

  const acciones: AccionesMensaje = {
    onResponder: (m) => {
      setEditando(null);
      setRespondiendoA(m);
    },
    onReaccionar: (m, emoji) =>
      void intentar(
        () => api.post(`/conversaciones/${conversacion.id}/mensajes/${m.id}/reaccion`, { emoji }),
        'No se pudo enviar la reacción',
      ),
    onReenviar: setReenviando,
    onEditar: (m) => {
      setRespondiendoA(null);
      setEditando(m);
    },
    onDestacar: (m, destacado) =>
      void intentar(
        () => api.post(`/conversaciones/${conversacion.id}/mensajes/${m.id}/destacar`, { destacado }),
        'No se pudo destacar el mensaje',
      ),
    onEliminar: (m) => {
      const quienes = conversacion.esGrupo ? 'Nadie en el grupo lo verá' : 'El cliente dejará de verlo';
      if (!window.confirm(`¿Eliminar este mensaje para todos? ${quienes}.`)) return;
      void intentar(() => api.delete(`/conversaciones/${conversacion.id}/mensajes/${m.id}`), 'No se pudo eliminar el mensaje');
    },
  };

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


  function fijar() {
    void intentar(
      () => api.post(`/conversaciones/${conversacion.id}/fijar`, { fijado: !conversacion.fijado }),
      'No se pudo fijar el chat',
    );
  }

  function archivar() {
    void intentar(
      () => api.post(`/conversaciones/${conversacion.id}/archivar`, { archivado: !conversacion.archivado }),
      'No se pudo archivar el chat',
    );
  }

  async function cambiarModo(modo: 'bot' | 'manual') {
    await api.post(`/conversaciones/${conversacion.id}/modo`, { modo });
  }

  async function aplicarEtapa(etapa: string) {
    await api.patch(`/conversaciones/${conversacion.id}/etapa`, { etapa });
    setCorrigiendo(false);
  }

  const nombre = nombreDeChat(conversacion);
  const esGrupo = conversacion.esGrupo;
  const nombreAutor = (m: Pick<MensajeConversacion, 'autor' | 'extra'>) => nombreDeAutor(m, nombre, esGrupo);
  const presente = textoPresencia(presencia);
  const recordatorioPendiente = conversacion.proximoRecordatorio;
  const recordatorioVencido = Boolean(recordatorioPendiente && new Date(recordatorioPendiente).getTime() <= Date.now());

  async function marcarVenta() {
    if (!window.confirm(`¿Marcar "${nombre}" como venta concretada?`)) return;
    await aplicarEtapa('venta_concretada');
  }

  const etapa = infoEtapa(conversacion.etapaPipeline);
  const sugerencia = conversacion.iaSugerencia ? infoEtapa(conversacion.iaSugerencia) : null;
  const esLead = conversacion.leadId !== null;
  const otrosNombres = [conversacion.nombreContacto, conversacion.empresa].filter((n) => n && n !== nombre);

  // Arrastrar archivos sobre el chat los deja listos para enviar, como en WhatsApp Web.
  const conArchivos = (e: DragEvent) => [...e.dataTransfer.types].includes('Files');

  return (
    <div
      className={estilos.contenedor}
      onDragOver={(e) => {
        if (!conArchivos(e)) return;
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastrando(false);
      }}
      onDrop={(e) => {
        if (!conArchivos(e)) return;
        e.preventDefault();
        setArrastrando(false);
        compositorRef.current?.agregarArchivos([...e.dataTransfer.files]);
      }}
    >
      {arrastrando && <div className={estilos.zonaSoltar}>Suelta aquí para enviar los archivos</div>}
      <div className={estilos.encabezado}>
        <button type="button" className={estilos.avatarEncabezado} title="Info del chat" onClick={() => setPanel('info')}>
          <Avatar conversacionId={conversacion.id} nombre={nombre} esGrupo={esGrupo} tamano={40} />
        </button>
        <div className={estilos.encabezadoTexto}>
          <div className={estilos.nombreFila}>
            <span className={estilos.nombre}>{nombre}</span>
            {etapa && <Badge tono={etapa.tono}>{etapa.etiqueta}</Badge>}
          </div>
          <div className={estilos.subtitulo}>
            {presente && <span className={estilos.presencia}>{presente} · </span>}
            {esGrupo ? 'Grupo' : `+${conversacion.telefono}`}
            {otrosNombres.length > 0 && ` · ${otrosNombres.join(' · ')}`}
            {conversacion.rubro && ` · Rubro: ${conversacion.rubro}`}
          </div>
          {conversacion.campanaNombre && <div className={estilos.campana}>Campaña: {conversacion.campanaNombre}</div>}
          {(conversacion.etiquetas.length > 0 || conversacion.asignadoA || recordatorioPendiente) && (
            <div className={crm.chipsLista}>
              {recordatorioPendiente && (
                <span className={recordatorioVencido ? crm.vencido : crm.chipLista}>
                  ⏰ {recordatorioVencido ? 'Recordatorio vencido' : 'Recordatorio pendiente'}
                </span>
              )}
              {conversacion.asignadoA && (
                <span className={crm.chipLista}>👤 {conversacion.asignadoA.email ?? conversacion.asignadoA.id}</span>
              )}
              {conversacion.etiquetas.map((e) => (
                <span key={e.id} className={crm.chipLista}>
                  <span className={crm.puntoEtiqueta} style={{ background: colorEtiqueta(e.color) }} />
                  {e.nombre}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className={org.accionesEncabezado}>
          <button
            type="button"
            className={`${org.botonIcono} ${panel === 'buscar' ? org.botonActivo : ''}`}
            title="Buscar en el chat"
            onClick={() => setPanel(panel === 'buscar' ? null : 'buscar')}
          >
            🔍
          </button>
          <button
            type="button"
            className={`${org.botonIcono} ${conversacion.fijado ? org.botonActivo : ''}`}
            title={conversacion.fijado ? 'Desfijar chat' : 'Fijar chat arriba'}
            onClick={fijar}
          >
            📌
          </button>
          <button
            type="button"
            className={`${org.botonIcono} ${conversacion.archivado ? org.botonActivo : ''}`}
            title={conversacion.archivado ? 'Desarchivar chat' : 'Archivar chat'}
            onClick={archivar}
          >
            🗄️
          </button>
          <button
            type="button"
            className={`${org.botonIcono} ${panel === 'ficha' ? org.botonActivo : ''}`}
            title="Ficha: datos, etiquetas, asignar, recordatorios y notas"
            onClick={() => setPanel(panel === 'ficha' ? null : 'ficha')}
          >
            👤
          </button>
          <button
            type="button"
            className={`${org.botonIcono} ${panel === 'info' ? org.botonActivo : ''}`}
            title="Info, archivos y destacados"
            onClick={() => setPanel(panel === 'info' ? null : 'info')}
          >
            ⓘ
          </button>
        </div>
      </div>
      {conversacion.archivado && (
        <div className={estilos.notaAyuda}>🗄️ Chat archivado: no aparece en la lista principal (está en “Archivados”).</div>
      )}

      {panel === 'buscar' && (
        <BuscarEnChat
          conversacionId={conversacion.id}
          nombreAutor={nombreAutor}
          onIr={(m) => void irAMensaje(m)}
          onCerrar={() => setPanel(null)}
        />
      )}
      {panel === 'ficha' && (
        <FichaChat conversacion={conversacion} nombre={nombre} version={versionCrm} onCerrar={() => setPanel(null)} />
      )}
      {panel === 'info' && (
        <InfoChat
          conversacion={conversacion}
          nombre={nombre}
          nombreAutor={nombreAutor}
          onIr={(m) => void irAMensaje(m)}
          onCerrar={() => setPanel(null)}
        />
      )}

      {esGrupo ? (
        <div className={estilos.bannerManual}>
          <span>👥 Grupo de WhatsApp: el bot no responde aquí, solo tú</span>
        </div>
      ) : conversacion.modo === 'bot' ? (
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
                esGrupo={esGrupo}
                nombreAutor={nombreAutor}
                citado={citaId ? porWhatsappId.get(citaId) : undefined}
                resaltado={resaltadoId === m.id}
                onIrACita={irACita}
                onAbrirVisor={setVisorId}
                acciones={acciones}
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
          nombreAutor={nombreAutor}
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

      {reenviando && (
        <ModalReenviar conversacionId={conversacion.id} mensaje={reenviando} onCerrar={() => setReenviando(null)} />
      )}

      {error && (
        <div className={estilos.notaAyuda} style={{ color: 'var(--peligro)' }}>
          {error}
        </div>
      )}
      <Compositor
        key={conversacion.id}
        ref={compositorRef}
        conversacionId={conversacion.id}
        nombreAutor={nombreAutor}
        nombreCliente={nombre}
        respondiendoA={respondiendoA}
        onCancelarRespuesta={() => setRespondiendoA(null)}
        editando={editando}
        onCancelarEdicion={() => setEditando(null)}
      />
      <div className={estilos.notaAyuda}>
        Se envía desde el WhatsApp de este número. Pasa el mouse por un mensaje y usa ⌄ para responder, reaccionar,
        reenviar, editar o eliminar. Puedes pegar o arrastrar fotos.
        {!esGrupo && ' Al responder, el chat pasa a modo manual (🙋).'}
      </div>

      {esLead && (
        <div className={estilos.acciones}>
          <Boton variante="secundario" onClick={() => setPanel('ficha')}>
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
