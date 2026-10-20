import { useState } from 'react';
import { Boton } from '../../components/ui/Boton';
import { Modal } from '../../components/ui/Modal';
import { api, ErrorApi } from '../../lib/api';
import type { RespuestaRapida } from '../../lib/types';
import crm from './Crm.module.css';
import org from './Organizar.module.css';

type Props = {
  respuestas: RespuestaRapida[];
  /** Usar una en el chat (la cierra). */
  onUsar: (r: RespuestaRapida) => void;
  /** Se creo, edito o borro una: hay que volver a pedir la lista. */
  onCambio: () => void;
  onCerrar: () => void;
};

/** Las respuestas rapidas: usar, crear, editar y borrar. En el chat se usan escribiendo "/" y el atajo. */
export function ModalRapidas({ respuestas, onUsar, onCambio, onCerrar }: Props) {
  const [editandoId, setEditandoId] = useState<number | 'nueva' | null>(respuestas.length ? null : 'nueva');
  const [atajo, setAtajo] = useState('');
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);

  function abrir(r: RespuestaRapida | null) {
    setEditandoId(r?.id ?? 'nueva');
    setAtajo(r?.atajo ?? '');
    setTexto(r?.texto ?? '');
    setError(null);
  }

  async function intentar(accion: () => Promise<unknown>, mensaje: string) {
    setError(null);
    try {
      await accion();
      setEditandoId(null);
      onCambio();
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : mensaje);
    }
  }

  const guardar = () =>
    intentar(
      () =>
        editandoId === 'nueva'
          ? api.post('/respuestas-rapidas', { atajo, texto })
          : api.patch(`/respuestas-rapidas/${editandoId}`, { atajo, texto }),
      'No se pudo guardar',
    );

  const editor = (
    <div className={crm.filaRapida}>
      <input className={org.entrada} placeholder="Atajo, ej. precios" value={atajo} maxLength={30} onChange={(e) => setAtajo(e.target.value)} />
      <textarea
        className={`${org.entrada} ${crm.textarea}`}
        rows={4}
        placeholder="Texto. Usa {nombre} para poner el nombre del cliente."
        value={texto}
        maxLength={4000}
        onChange={(e) => setTexto(e.target.value)}
      />
      <div className={crm.fila}>
        <Boton disabled={!atajo.trim() || !texto.trim()} onClick={() => void guardar()}>
          Guardar
        </Boton>
        <Boton variante="secundario" onClick={() => setEditandoId(null)}>
          Cancelar
        </Boton>
      </div>
    </div>
  );

  return (
    <Modal titulo="⚡ Respuestas rápidas" onCerrar={onCerrar} ancho>
      <p className={crm.ayuda}>
        En el chat escribe <strong>/</strong> y el atajo (ej. <strong>/precios</strong>) para usarlas. <strong>{'{nombre}'}</strong> se
        cambia por el nombre del cliente.
      </p>
      {error && <div className={crm.error}>{error}</div>}
      {editandoId === 'nueva' ? editor : <Boton onClick={() => abrir(null)}>＋ Nueva respuesta rápida</Boton>}
      {respuestas.map((r) =>
        editandoId === r.id ? (
          <div key={r.id}>{editor}</div>
        ) : (
          <div key={r.id} className={crm.filaRapida}>
            <div className={crm.tituloSeccion}>
              <span className={crm.sugerenciaAtajo}>/{r.atajo}</span>
              <span className={crm.fila}>
                <button type="button" className={org.enlaceIr} onClick={() => onUsar(r)}>
                  Usar
                </button>
                <button type="button" className={org.enlaceIr} onClick={() => abrir(r)}>
                  Editar
                </button>
                <button
                  type="button"
                  className={`${org.enlaceIr} ${crm.peligro}`}
                  onClick={() => {
                    if (window.confirm(`¿Borrar /${r.atajo}?`)) void intentar(() => api.delete(`/respuestas-rapidas/${r.id}`), 'No se pudo borrar');
                  }}
                >
                  Borrar
                </button>
              </span>
            </div>
            <div className={crm.notaTexto}>{r.texto}</div>
          </div>
        ),
      )}
    </Modal>
  );
}
