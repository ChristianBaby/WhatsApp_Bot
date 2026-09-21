import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Boton } from '../../components/ui/Boton';
import { api, ErrorApi } from '../../lib/api';
import estilos from './ModalPrueba.module.css';

type Props = {
  numerosDisponibles: { id: number; etiqueta: string }[];
  listaId: number | null;
  variantesMensaje: string[];
  catalogoUrl: string | null;
  onCerrar: () => void;
};

/** Envía UN mensaje real de prueba, fuera de cualquier campaña (seccion 3.5). */
export function ModalPrueba({ numerosDisponibles, listaId, variantesMensaje, catalogoUrl, onCerrar }: Props) {
  const [telefono, setTelefono] = useState('');
  const [numeroId, setNumeroId] = useState(numerosDisponibles[0]?.id ?? null);
  const [enviando, setEnviando] = useState(false);
  const [mensajeEnviado, setMensajeEnviado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    if (!numeroId || telefono.trim().length < 6) return;
    setEnviando(true);
    setError(null);
    setMensajeEnviado(null);
    try {
      const resultado = await api.post<{ enviado: boolean; mensaje: string }>('/publicaciones/enviar-prueba', {
        listaId,
        variantesMensaje: variantesMensaje.filter((v) => v.trim()),
        catalogoUrl,
        numeroId,
        telefonoPrueba: telefono.trim(),
      });
      setMensajeEnviado(resultado.mensaje);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo enviar la prueba');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Enviar prueba a un número" onCerrar={onCerrar}>
      {numerosDisponibles.length > 1 && (
        <div className={estilos.campo}>
          <label className={estilos.etiqueta}>Enviar desde</label>
          <select
            className={estilos.select}
            value={numeroId ?? ''}
            onChange={(e) => setNumeroId(Number(e.target.value))}
          >
            {numerosDisponibles.map((n) => (
              <option key={n.id} value={n.id}>
                {n.etiqueta}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={estilos.campo}>
        <label className={estilos.etiqueta}>Número de destino (con código de país)</label>
        <input
          className={estilos.input}
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="Ej. +51 987 654 321"
          disabled={enviando}
        />
      </div>

      {mensajeEnviado && <div className={estilos.resultado}>✅ Enviado. Texto: "{mensajeEnviado}"</div>}
      {error && <div className={estilos.error}>{error}</div>}

      <div className={estilos.acciones}>
        <Boton onClick={() => void enviar()} disabled={enviando || !numeroId || telefono.trim().length < 6}>
          {enviando ? 'Enviando…' : 'Enviar prueba'}
        </Boton>
      </div>
    </Modal>
  );
}
