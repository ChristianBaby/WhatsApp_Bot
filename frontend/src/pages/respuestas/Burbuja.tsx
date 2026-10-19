import { useState } from 'react';
import { formatearHora } from '../../lib/fecha';
import type { MensajeConversacion } from '../../lib/types';
import { ContenidoMensaje } from './ContenidoMensaje';
import { MenuMensaje, type AccionesMensaje } from './MenuMensaje';
import { colorDeParticipante } from './nombreChat';
import { esEmojiGrande } from './TextoWhatsapp';
import estilos from './DetalleConversacion.module.css';

type Props = {
  conversacionId: number;
  mensaje: MensajeConversacion;
  /** En un grupo, cada mensaje ajeno lleva arriba el nombre de quien lo escribio. */
  esGrupo: boolean;
  /** Quien escribio un mensaje ("Tú", el cliente o el integrante del grupo): para la cita y el remitente. */
  nombreAutor: (m: Pick<MensajeConversacion, 'autor' | 'extra'>) => string;
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
/** Las reacciones juntas por emoji, como en WhatsApp: "👍 3 ❤️". */
function resumirReacciones(reacciones: MensajeConversacion['reacciones']): string {
  const cuenta = new Map<string, number>();
  for (const emoji of Object.values(reacciones ?? {})) if (emoji) cuenta.set(emoji, (cuenta.get(emoji) ?? 0) + 1);
  return [...cuenta].map(([emoji, n]) => (n > 1 ? `${emoji} ${n}` : emoji)).join(' ');
}

export function Burbuja({ conversacionId, mensaje, esGrupo, nombreAutor, citado, resaltado, onIrACita, onAbrirVisor, acciones }: Props) {
  const [verOriginal, setVerOriginal] = useState(false);
  const propio = mensaje.autor !== 'lead';
  const extra = mensaje.extra;
  const cita = extra?.cita;
  const reacciones = resumirReacciones(mensaje.reacciones);
  const remitente = esGrupo && !propio ? extra?.participante : null;

  // Stickers y emojis solos van sin globo, como en WhatsApp.
  const sinGlobo =
    !mensaje.eliminado &&
    !cita &&
    (mensaje.tipo === 'sticker' || (mensaje.tipo === 'texto' && esEmojiGrande(mensaje.texto)));

  const autorCita = citado ? citado.autor : cita?.autor;
  // Si el mensaje citado no esta cargado, en un grupo no se sabe quien lo escribio.
  const nombreCita = citado
    ? nombreAutor(citado)
    : autorCita === 'lead'
      ? esGrupo
        ? 'Participante'
        : nombreAutor({ autor: 'lead', extra: null })
      : 'Tú';

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
          {remitente && (
            <div className={estilos.remitente} style={{ color: colorDeParticipante(remitente.jid) }}>
              {nombreAutor(mensaje)}
              {remitente.nombre && remitente.telefono && <span className={estilos.remitenteTelefono}>+{remitente.telefono}</span>}
            </div>
          )}
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

        {reacciones && (
          <button
            type="button"
            className={`${estilos.reacciones} ${propio ? estilos.reaccionesYo : ''}`}
            title={mensaje.reacciones?.yo ? 'Clic para quitar tu reacción' : 'Reacciones'}
            onClick={() => mensaje.reacciones?.yo && acciones.onReaccionar(mensaje, null)}
          >
            {reacciones}
          </button>
        )}
      </div>
    </div>
  );
}
