import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { api, ErrorApi } from '../../lib/api';
import type { MensajeConversacion } from '../../lib/types';
import { SelectorEmojis } from './SelectorEmojis';
import estilos from './Chat.module.css';

const MAX_ARCHIVO_BYTES = 16 * 1024 * 1024;
/** WhatsApp corta las notas de voz en 15 minutos. */
const MAX_GRABACION_S = 15 * 60;
/** Cada cuanto se repite "escribiendo..." (WhatsApp lo borra solo a los ~10 s). */
const REPETIR_PRESENCIA_MS = 8_000;
/** Sin teclear este tiempo, el contacto deja de ver "escribiendo...". */
const PAUSA_ESCRITURA_MS = 4_000;
const ALTO_MAX_TEXTO = 140;

type Props = {
  conversacionId: number;
  /** Quien escribio el mensaje que se responde ("Tú", el cliente o el integrante del grupo). */
  nombreAutor: (m: MensajeConversacion) => string;
  respondiendoA: MensajeConversacion | null;
  onCancelarRespuesta: () => void;
  editando: MensajeConversacion | null;
  onCancelarEdicion: () => void;
};

export type CompositorHandle = {
  /** Archivos soltados sobre el chat: quedan listos para enviar, con vista previa. */
  agregarArchivos: (archivos: File[]) => void;
  enfocar: () => void;
};

type Pendiente = { id: number; archivo: File; vista: string | null };

function duracion(segundos: number): string {
  const s = Math.floor(segundos);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function soltarVista(p: Pendiente) {
  if (p.vista) URL.revokeObjectURL(p.vista);
}

function formatoGrabacion(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t));
}

/** La caja de escribir del chat, como la de WhatsApp Web. */
export const Compositor = forwardRef<CompositorHandle, Props>(function Compositor(
  { conversacionId, nombreAutor, respondiendoA, onCancelarRespuesta, editando, onCancelarEdicion },
  ref,
) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emojis, setEmojis] = useState(false);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [grabando, setGrabando] = useState<{ desde: number; segundos: number } | null>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const siguienteId = useRef(1);
  const grabadora = useRef<{ recorder: MediaRecorder; partes: Blob[]; enviar: boolean; reloj: number } | null>(null);
  const presencia = useRef<{ ultima: number; pausa?: ReturnType<typeof setTimeout> }>({ ultima: 0 });

  useImperativeHandle(ref, () => ({
    agregarArchivos,
    enfocar: () => textoRef.current?.focus(),
  }));

  // Al editar, la caja trae el texto original; al terminar, queda vacia.
  useEffect(() => {
    setTexto(editando ? editando.texto : '');
    if (editando) textoRef.current?.focus();
  }, [editando]);

  useEffect(() => {
    if (respondiendoA) textoRef.current?.focus();
  }, [respondiendoA]);

  // La caja crece con el texto (hasta un tope), como en WhatsApp.
  useLayoutEffect(() => {
    const caja = textoRef.current;
    if (!caja) return;
    caja.style.height = 'auto';
    caja.style.height = `${Math.min(caja.scrollHeight, ALTO_MAX_TEXTO)}px`;
  }, [texto]);

  // Al salir del chat: se suelta el microfono, las vistas previas y el "escribiendo...".
  useEffect(
    () => () => {
      const g = grabadora.current;
      if (g) {
        g.enviar = false;
        clearInterval(g.reloj);
        if (g.recorder.state !== 'inactive') g.recorder.stop();
      }
      clearTimeout(presencia.current.pausa);
    },
    [],
  );
  const pendientesRef = useRef(pendientes);
  pendientesRef.current = pendientes;
  useEffect(() => () => pendientesRef.current.forEach(soltarVista), []);

  function avisar(estado: 'composing' | 'recording' | 'paused') {
    void api.post(`/conversaciones/${conversacionId}/escribiendo`, { estado }).catch(() => undefined);
  }

  /** "escribiendo..." mientras se teclea (repetido cada pocos segundos) y "pausa" al dejar de teclear. */
  function alTeclear() {
    if (editando) return;
    const ahora = Date.now();
    if (ahora - presencia.current.ultima > REPETIR_PRESENCIA_MS) {
      presencia.current.ultima = ahora;
      avisar('composing');
    }
    clearTimeout(presencia.current.pausa);
    presencia.current.pausa = setTimeout(() => {
      presencia.current.ultima = 0;
      avisar('paused');
    }, PAUSA_ESCRITURA_MS);
  }

  function terminarEscritura() {
    clearTimeout(presencia.current.pausa);
    presencia.current.ultima = 0;
  }

  function agregarArchivos(archivos: File[]) {
    setError(null);
    const validos: Pendiente[] = [];
    for (const archivo of archivos) {
      if (archivo.size > MAX_ARCHIVO_BYTES) {
        setError(`"${archivo.name}" pesa más de 16 MB, el máximo que permite WhatsApp.`);
        continue;
      }
      const vista = archivo.type.startsWith('image/') ? URL.createObjectURL(archivo) : null;
      validos.push({ id: siguienteId.current++, archivo, vista });
    }
    if (validos.length) setPendientes((prev) => [...prev, ...validos]);
    textoRef.current?.focus();
  }

  function quitarPendiente(id: number) {
    const quitado = pendientesRef.current.find((p) => p.id === id);
    if (quitado) soltarVista(quitado);
    setPendientes((prev) => prev.filter((p) => p.id !== id));
  }

  function insertarEmoji(emoji: string) {
    const caja = textoRef.current;
    const inicio = caja?.selectionStart ?? texto.length;
    const fin = caja?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, inicio) + emoji + texto.slice(fin));
    requestAnimationFrame(() => {
      caja?.focus();
      caja?.setSelectionRange(inicio + emoji.length, inicio + emoji.length);
    });
  }

  async function ejecutar(accion: () => Promise<unknown>, mensajeError: string) {
    setEnviando(true);
    setError(null);
    try {
      await accion();
      return true;
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : mensajeError);
      return false;
    } finally {
      setEnviando(false);
    }
  }

  async function enviar() {
    if (enviando) return;
    const valor = texto.trim();
    const citaId = respondiendoA?.id;

    if (editando) {
      if (!valor) return;
      const ok = await ejecutar(
        () => api.patch(`/conversaciones/${conversacionId}/mensajes/${editando.id}`, { texto: valor }),
        'No se pudo editar el mensaje',
      );
      if (ok) onCancelarEdicion();
      return;
    }

    if (pendientes.length) {
      terminarEscritura();
      const ok = await ejecutar(async () => {
        // Uno por uno, en orden; lo escrito va como texto del primero (como en WhatsApp).
        for (const [i, p] of pendientes.entries()) {
          const datos = new FormData();
          datos.append('archivo', p.archivo);
          if (i === 0 && valor) datos.append('texto', valor);
          if (i === 0 && citaId) datos.append('citaId', String(citaId));
          await api.post(`/conversaciones/${conversacionId}/adjuntos`, datos);
          quitarPendiente(p.id);
        }
      }, 'No se pudo enviar el archivo');
      if (ok) {
        setTexto('');
        onCancelarRespuesta();
      }
      return;
    }

    if (!valor) return;
    terminarEscritura();
    const ok = await ejecutar(
      () => api.post(`/conversaciones/${conversacionId}/mensajes`, { texto: valor, citaId }),
      'No se pudo enviar el mensaje',
    );
    if (ok) {
      setTexto('');
      onCancelarRespuesta();
    }
  }

  async function empezarGrabacion() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Este navegador no permite grabar audio.');
      return;
    }
    let flujo: MediaStream;
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('No se pudo usar el micrófono. Revisa el permiso del navegador para este sitio.');
      return;
    }
    const formato = formatoGrabacion();
    const recorder = new MediaRecorder(flujo, formato ? { mimeType: formato } : undefined);
    const desde = Date.now();
    const sesion = {
      recorder,
      partes: [] as Blob[],
      enviar: false,
      reloj: window.setInterval(() => {
        const segundos = (Date.now() - desde) / 1000;
        setGrabando({ desde, segundos });
        // "grabando audio..." para el contacto, repetido como el "escribiendo...".
        if (Math.floor(segundos) % 8 === 0) avisar('recording');
        if (segundos >= MAX_GRABACION_S) detenerGrabacion(true);
      }, 1000),
    };
    recorder.ondataavailable = (e) => {
      if (e.data.size) sesion.partes.push(e.data);
    };
    recorder.onstop = () => {
      flujo.getTracks().forEach((t) => t.stop());
      clearInterval(sesion.reloj);
      grabadora.current = null;
      setGrabando(null);
      avisar('paused');
      if (sesion.enviar) void enviarGrabacion(sesion.partes, recorder.mimeType || formato || 'audio/webm', (Date.now() - desde) / 1000);
    };
    grabadora.current = sesion;
    recorder.start();
    setGrabando({ desde, segundos: 0 });
    avisar('recording');
  }

  function detenerGrabacion(enviarla: boolean) {
    const g = grabadora.current;
    if (!g) return;
    g.enviar = enviarla;
    if (g.recorder.state !== 'inactive') g.recorder.stop();
  }

  async function enviarGrabacion(partes: Blob[], mime: string, segundos: number) {
    if (segundos < 1 || !partes.length) {
      setError('La grabación fue demasiado corta.');
      return;
    }
    const extension = mime.includes('ogg') ? 'ogg' : 'webm';
    const datos = new FormData();
    datos.append('audio', new Blob(partes, { type: mime }), `nota-de-voz.${extension}`);
    datos.append('segundos', String(Math.round(segundos)));
    if (respondiendoA) datos.append('citaId', String(respondiendoA.id));
    const ok = await ejecutar(() => api.post(`/conversaciones/${conversacionId}/nota-voz`, datos), 'No se pudo enviar la nota de voz');
    if (ok) onCancelarRespuesta();
  }

  function cancelarModo() {
    if (editando) onCancelarEdicion();
    else if (respondiendoA) onCancelarRespuesta();
  }

  const hayAlgoQueEnviar = Boolean(texto.trim()) || pendientes.length > 0;
  const autorCitado = respondiendoA ? nombreAutor(respondiendoA) : '';

  return (
    <div className={estilos.compositor}>
      {(respondiendoA || editando) && (
        <div className={estilos.barraModo}>
          <div className={`${estilos.citaCompositor} ${respondiendoA?.autor === 'lead' ? estilos.citaCompositorLead : ''}`}>
            <span className={estilos.citaCompositorAutor}>{editando ? '✏️ Editando mensaje' : `↩️ Respondiendo a ${autorCitado}`}</span>
            <span className={estilos.citaCompositorTexto}>{(editando ?? respondiendoA)!.texto}</span>
          </div>
          <button type="button" className={estilos.botonRedondo} title="Cancelar (Esc)" onClick={cancelarModo}>
            ✕
          </button>
        </div>
      )}

      {pendientes.length > 0 && (
        <div className={estilos.pendientes}>
          {pendientes.map((p) => (
            <div key={p.id} className={estilos.pendiente} title={p.archivo.name}>
              {p.vista ? (
                <img src={p.vista} alt={p.archivo.name} className={estilos.pendienteImagen} />
              ) : (
                <div className={estilos.pendienteArchivo}>
                  <span>{p.archivo.type.startsWith('video/') ? '🎥' : p.archivo.type.startsWith('audio/') ? '🎵' : '📄'}</span>
                  <span className={estilos.pendienteNombre}>{p.archivo.name}</span>
                </div>
              )}
              <button type="button" className={estilos.quitarPendiente} title="Quitar" onClick={() => quitarPendiente(p.id)}>
                ✕
              </button>
            </div>
          ))}
          <div className={estilos.pendienteNota}>Lo que escribas abajo va como texto del primer archivo.</div>
        </div>
      )}

      {grabando ? (
        <div className={estilos.filaCompositor}>
          <button type="button" className={estilos.botonRedondo} title="Descartar" onClick={() => detenerGrabacion(false)}>
            🗑️
          </button>
          <div className={estilos.grabando}>
            <span className={estilos.puntoGrabando} /> Grabando {duracion(grabando.segundos)}
          </div>
          <button type="button" className={estilos.botonEnviar} title="Enviar nota de voz" onClick={() => detenerGrabacion(true)}>
            ➤
          </button>
        </div>
      ) : (
        <div className={estilos.filaCompositor}>
          <input
            ref={archivoRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              agregarArchivos([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
          <div className={estilos.anclaEmojis}>
            <button
              type="button"
              className={estilos.botonRedondo}
              title="Emojis"
              onClick={() => setEmojis((v) => !v)}
              disabled={enviando}
            >
              😊
            </button>
            {emojis && <SelectorEmojis onElegir={insertarEmoji} onCerrar={() => setEmojis(false)} />}
          </div>
          {!editando && (
            <button
              type="button"
              className={estilos.botonRedondo}
              title="Enviar fotos, videos, audios o documentos (también puedes pegarlos o arrastrarlos)"
              onClick={() => archivoRef.current?.click()}
              disabled={enviando}
            >
              📎
            </button>
          )}
          <textarea
            ref={textoRef}
            rows={1}
            className={estilos.cajaTexto}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              alTeclear();
            }}
            onPaste={(e) => {
              const archivos = [...e.clipboardData.files];
              if (archivos.length && !editando) {
                e.preventDefault();
                agregarArchivos(archivos);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              } else if (e.key === 'Escape') {
                cancelarModo();
              }
            }}
            placeholder={
              enviando ? 'Enviando…' : pendientes.length ? 'Añade un texto…' : editando ? 'Edita el mensaje…' : 'Escribe un mensaje'
            }
            disabled={enviando}
          />
          {hayAlgoQueEnviar || editando ? (
            <button
              type="button"
              className={estilos.botonEnviar}
              title={editando ? 'Guardar' : 'Enviar'}
              onClick={() => void enviar()}
              disabled={enviando || (!texto.trim() && !pendientes.length)}
            >
              {editando ? '✓' : '➤'}
            </button>
          ) : (
            <button
              type="button"
              className={estilos.botonEnviar}
              title="Grabar nota de voz"
              onClick={() => void empezarGrabacion()}
              disabled={enviando}
            >
              🎤
            </button>
          )}
        </div>
      )}
      {error && <div className={estilos.errorCompositor}>{error}</div>}
    </div>
  );
});
