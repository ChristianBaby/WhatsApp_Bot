import { useEffect, useRef, useState } from 'react';
import type { MensajeConversacion } from '../../lib/types';
import { REACCIONES_RAPIDAS } from './emojis';
import { SelectorEmojis } from './SelectorEmojis';
import estilos from './Chat.module.css';

/** Lo mismo que limita WhatsApp (y el backend, ver envioPanel.ts). */
const EDITAR_MAX_MS = 15 * 60 * 1000;
const ELIMINAR_MAX_MS = 48 * 60 * 60 * 1000;
const TIPOS_REENVIABLES = ['texto', 'imagen', 'video', 'audio', 'nota_voz', 'documento', 'sticker'];
/** Lo que ocupa el menu abierto con el selector de emojis (aprox.). */
const ALTO_MENU = 340;

export type AccionesMensaje = {
  onResponder: (m: MensajeConversacion) => void;
  onReaccionar: (m: MensajeConversacion, emoji: string | null) => void;
  onReenviar: (m: MensajeConversacion) => void;
  onEditar: (m: MensajeConversacion) => void;
  onEliminar: (m: MensajeConversacion) => void;
  onDestacar: (m: MensajeConversacion, destacado: boolean) => void;
};

/** Que se puede hacer con un mensaje, segun WhatsApp. */
export function permisosDe(m: MensajeConversacion) {
  const enWhatsapp = Boolean(m.whatsappId) && !m.whatsappId!.startsWith('llamada-') && !m.eliminado;
  const propio = m.autor !== 'lead';
  const edad = Date.now() - new Date(m.creadoEn).getTime();
  return {
    responder: enWhatsapp,
    reaccionar: enWhatsapp,
    reenviar: !m.eliminado && TIPOS_REENVIABLES.includes(m.tipo),
    copiar: !m.eliminado && Boolean(m.texto) && m.tipo === 'texto',
    destacar: enWhatsapp,
    editar: enWhatsapp && propio && m.tipo === 'texto' && edad < EDITAR_MAX_MS,
    eliminar: enWhatsapp && propio && edad < ELIMINAR_MAX_MS,
  };
}

type Props = AccionesMensaje & { mensaje: MensajeConversacion; propio: boolean };

/** La flechita que aparece al pasar el mouse por un mensaje, con sus acciones (como en WhatsApp Web). */
export function MenuMensaje({ mensaje, propio, onResponder, onReaccionar, onReenviar, onEditar, onEliminar, onDestacar }: Props) {
  const [abierto, setAbierto] = useState(false);
  /** Cerca del borde de abajo, el menu se abre hacia arriba para no quedar cortado. */
  const [haciaArriba, setHaciaArriba] = useState(false);
  const [masEmojis, setMasEmojis] = useState(false);
  const cajaRef = useRef<HTMLDivElement>(null);
  const permisos = permisosDe(mensaje);
  const miReaccion = mensaje.reacciones?.yo ?? null;

  useEffect(() => {
    if (!abierto) return;
    const alClic = (e: MouseEvent) => {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false);
    };
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', alClic);
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('mousedown', alClic);
      document.removeEventListener('keydown', alTecla);
    };
  }, [abierto]);

  if (!Object.values(permisos).some(Boolean)) return null;

  function hacer(accion: () => void) {
    setAbierto(false);
    accion();
  }

  function reaccionar(emoji: string) {
    // Elegir la misma reaccion que ya tengo la quita, como en WhatsApp.
    hacer(() => onReaccionar(mensaje, emoji === miReaccion ? null : emoji));
  }

  return (
    <div ref={cajaRef} className={`${estilos.menuMensaje} ${propio ? estilos.menuPropio : ''} ${abierto ? estilos.menuAbierto : ''}`}>
      <button
        type="button"
        className={estilos.flechaMenu}
        title="Opciones"
        onClick={(e) => {
          setHaciaArriba(e.currentTarget.getBoundingClientRect().bottom > window.innerHeight - ALTO_MENU);
          setMasEmojis(false);
          setAbierto((a) => !a);
        }}
      >
        ⌄
      </button>
      {abierto && (
        <div
          className={[estilos.desplegable, propio ? estilos.desplegablePropio : '', haciaArriba ? estilos.desplegableArriba : '']
            .filter(Boolean)
            .join(' ')}
        >
          {permisos.reaccionar && (
            <div className={estilos.filaReacciones}>
              {REACCIONES_RAPIDAS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`${estilos.reaccionRapida} ${emoji === miReaccion ? estilos.reaccionMia : ''}`}
                  onClick={() => reaccionar(emoji)}
                >
                  {emoji}
                </button>
              ))}
              <button type="button" className={estilos.reaccionRapida} title="Más emojis" onClick={() => setMasEmojis(true)}>
                ＋
              </button>
            </div>
          )}
          {permisos.responder && <Opcion texto="↩️ Responder" onClick={() => hacer(() => onResponder(mensaje))} />}
          {permisos.copiar && (
            <Opcion texto="📋 Copiar" onClick={() => hacer(() => void navigator.clipboard?.writeText(mensaje.texto))} />
          )}
          {permisos.reenviar && <Opcion texto="↪️ Reenviar" onClick={() => hacer(() => onReenviar(mensaje))} />}
          {permisos.destacar && (
            <Opcion
              texto={mensaje.destacado ? '☆ Quitar destacado' : '⭐ Destacar'}
              onClick={() => hacer(() => onDestacar(mensaje, !mensaje.destacado))}
            />
          )}
          {permisos.editar && <Opcion texto="✏️ Editar" onClick={() => hacer(() => onEditar(mensaje))} />}
          {permisos.eliminar && (
            <Opcion texto="🗑️ Eliminar para todos" peligro onClick={() => hacer(() => onEliminar(mensaje))} />
          )}
          {masEmojis && (
            <SelectorEmojis
              posicion={haciaArriba ? 'arriba' : 'abajo'}
              onElegir={(emoji) => {
                setMasEmojis(false);
                reaccionar(emoji);
              }}
              onCerrar={() => setMasEmojis(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Opcion({ texto, peligro, onClick }: { texto: string; peligro?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`${estilos.opcionMenu} ${peligro ? estilos.opcionPeligro : ''}`} onClick={onClick}>
      {texto}
    </button>
  );
}
