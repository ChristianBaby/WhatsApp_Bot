import { useState } from 'react';
import { Boton } from '../../components/ui/Boton';
import { Modal } from '../../components/ui/Modal';
import { api, ErrorApi } from '../../lib/api';
import type { Etiqueta } from '../../lib/types';
import { colorEtiqueta, COLORES_ETIQUETA } from './coloresEtiqueta';
import crm from './Crm.module.css';
import org from './Organizar.module.css';

type Props = { etiquetas: Etiqueta[]; onCerrar: () => void };

/** Renombrar, cambiar de color o borrar etiquetas (en WhatsApp Business, tambien en el telefono). */
export function ModalEtiquetas({ etiquetas, onCerrar }: Props) {
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function editar(e: Etiqueta) {
    setEditandoId(e.id);
    setNombre(e.nombre);
    setColor(e.color);
    setError(null);
  }

  async function intentar(accion: () => Promise<unknown>, mensaje: string) {
    setError(null);
    try {
      await accion();
      setEditandoId(null);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : mensaje);
    }
  }

  return (
    <Modal titulo="Etiquetas" onCerrar={onCerrar}>
      <p className={crm.ayuda}>
        Si tu número es WhatsApp Business, los cambios también se hacen en las etiquetas del teléfono.
      </p>
      {error && <div className={crm.error}>{error}</div>}
      {etiquetas.length === 0 && <div className={org.aviso}>Todavía no hay etiquetas. Créalas desde la ficha de un chat.</div>}
      {etiquetas.map((e) =>
        editandoId === e.id ? (
          <div key={e.id} className={crm.editorEtiqueta}>
            <input className={org.entrada} value={nombre} maxLength={40} onChange={(ev) => setNombre(ev.target.value)} />
            <div className={crm.paleta}>
              {COLORES_ETIQUETA.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  className={`${crm.muestra} ${i === color ? crm.muestraElegida : ''}`}
                  style={{ background: c }}
                  title={`Color ${i + 1}`}
                  onClick={() => setColor(i)}
                />
              ))}
            </div>
            <div className={crm.fila}>
              <Boton
                disabled={!nombre.trim()}
                onClick={() => void intentar(() => api.patch(`/etiquetas/${e.id}`, { nombre: nombre.trim(), color }), 'No se pudo guardar')}
              >
                Guardar
              </Boton>
              <Boton variante="secundario" onClick={() => setEditandoId(null)}>
                Cancelar
              </Boton>
            </div>
          </div>
        ) : (
          <div key={e.id} className={crm.filaEtiqueta}>
            <span className={crm.puntoEtiqueta} style={{ background: colorEtiqueta(e.color) }} />
            <span className={crm.nombreEtiqueta}>{e.nombre}</span>
            <span className={crm.detalleFicha}>{e.chats === 1 ? '1 chat' : `${e.chats} chats`}</span>
            <button type="button" className={org.enlaceIr} onClick={() => editar(e)}>
              Editar
            </button>
            <button
              type="button"
              className={`${org.enlaceIr} ${crm.peligro}`}
              onClick={() => {
                if (!window.confirm(`¿Borrar la etiqueta "${e.nombre}"? Se quita de ${e.chats} chat(s).`)) return;
                void intentar(() => api.delete(`/etiquetas/${e.id}`), 'No se pudo borrar');
              }}
            >
              Borrar
            </button>
          </div>
        ),
      )}
    </Modal>
  );
}
