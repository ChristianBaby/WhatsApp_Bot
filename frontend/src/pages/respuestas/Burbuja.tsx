import { useState } from 'react';
import { formatearHora } from '../../lib/fecha';
import type { MensajeConversacion } from '../../lib/types';
import { ContenidoMensaje } from './ContenidoMensaje';
import { MenuMensaje, type AccionesMensaje } from './MenuMensaje';
import { esEmojiGrande } from './TextoWhatsapp';
import estilos from './DetalleConversacion.module.css';

type Props = {
  conversacionId: number;
  mensaje: MensajeConversacion;
  /** Como se llama el cliente en este chat (para la cita: "Juan" o "Tú"). */
  nombreContacto: string;
  /** El mensaje citado, si esta cargado en pantalla. */
  citado: MensajeConversacion | undefined;
  /** Se acaba de saltar a este mensaje desde una cita: se resalta un momento. */
  resaltado: boolean;
  onIrACita: (whatsappId: string) => void;
  onAbrirVisor: (mensajeId: number) => void;
  acciones: AccionesMensaje;
};

function Checks({ mensaje }: { mensaje: MensajeConversacion }) {
  if (mensaje.autor === 'lead' || !mensaje.estadoEntrega) return null;
  if (mensaje.estadoEntrega === 'enviado') return <span className={estilos.check}>✓</span>;
  return (
    <span className={`${estilos.check} ${mensaje.estadoEntrega === 'leido' ? estilos.checkLeido : ''}`}>✓✓</span>
  );
}

/** Un mensaje del chat, como en WhatsApp: cita, reenviado, contenido, hora, checks y reacciones. */
export function Burbuja({ conversacionId, mensaje, nombreContacto, citado, resaltado, onIrACita, onAbrirVisor, acciones }: Props) {
  const [verOriginal, setVerOriginal] = useState(false);
  const propio = mensaje.autor !== 'lead';
  const extra = mensaje.extra;
  const cita = extra?.cita;
  const reacciones = Object.values(mensaje.reacciones ?? {}).filter(Boolean);

  // Stickers y emojis solos van sin globo, como en WhatsApp.
  const sinGlobo =
    !mensaje.eliminado &&
    !cita &&
    (mensaje.tipo === 'sticker' || (mensaje.tipo === 'texto' && esEmojiGrande(mensaje.texto)));

  const autorCita = citado ? citado.autor : cita?.autor;
  const nombreCita = autorCita === 'lead' ? nombreContacto : 'Tú';

  const clases = [
    estilos.burbuja,
    propio ? estilos.burbujaYo : estilos.burbujaLead,
    sinGlobo ? estilos.burbujaSinGlobo : '',
    resaltado ? estilos.burbujaResaltada : '',
  ].join(' ');

  return (
    <div
      className={estilos.filaBurbuja}
      style={{ justifyContent: propio ? 'flex-end' : 'flex-start' }}
      data-wid={mensaje.whatsappId ?? undefined}
    >
      <div className={estilos.columnaBurbuja}>
        <div className={clases}>
          <MenuMensaje mensaje={mensaje} propio={propio} {...acciones} />
          {mensaje.autor === 'bot' && <div className={estilos.etiquetaBot}>🤖 Bot</div>}
          {extra?.reenviado && (
            <div className={estilos.reenviado}>↪ {extra.reenviado === 'muchas' ? 'Reenviado muchas veces' : 'Reenviado'}</div>
          )}
          {cita && (
            <button
              className={`${estilos.cita} ${autorCita === 'lead' ? estilos.citaDeLead : ''}`}
              onClick={() => onIrACita(cita.whatsappId)}
              title={citado ? 'Ir al mensaje' : 'El mensaje original es anterior a lo cargado en el chat'}
            >
              <span className={estilos.citaAutor}>{nombreCita}</span>
              <span className={estilos.citaTextoCorto}>{citado?.eliminado ? '🚫 Mensaje eliminado' : (citado?.texto ?? cita.texto)}</span>
            </button>
          )}

          {mensaje.eliminado && !verOriginal ? (
            <div className={estilos.eliminado}>
              🚫 {propio ? 'Eliminaste este mensaje' : 'Se eliminó este mensaje'}
              <button className={estilos.verOriginal} onClick={() => setVerOriginal(true)}>
                Ver lo que decía
              </button>
            </div>
          ) : (
            <div className={mensaje.eliminado ? estilos.contenidoEliminado : undefined}>
              <ContenidoMensaje conversacionId={conversacionId} mensaje={mensaje} onAbrirVisor={onAbrirVisor} />
            </div>
          )}

          <div className={estilos.horaBurbuja}>
            {mensaje.editado && !mensaje.eliminado && <span className={estilos.editado}>Editado </span>}
            {formatearHora(mensaje.creadoEn)} <Checks mensaje={mensaje} />
          </div>
        </div>

        {reacciones.length > 0 && (
          <button
            type="button"
            className={`${estilos.reacciones} ${propio ? estilos.reaccionesYo : ''}`}
            title={mensaje.reacciones?.yo ? 'Clic para quitar tu reacción' : 'Reacciones'}
            onClick={() => mensaje.reacciones?.yo && acciones.onReaccionar(mensaje, null)}
          >
            {reacciones.join(' ')}
          </button>
        )}
      </div>
    </div>
  );
}
