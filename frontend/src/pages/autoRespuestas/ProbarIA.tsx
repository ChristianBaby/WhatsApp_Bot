import { useState } from 'react';
import { Boton } from '../../components/ui/Boton';
import { api, ErrorApi } from '../../lib/api';
import estilos from './ProbarIA.module.css';

type Decision =
  | { tipo: 'silencio' }
  | { tipo: 'escalar'; motivo: 'palabra_clave'; palabra: string }
  | { tipo: 'escalar'; motivo: 'baja_confianza'; razon?: string }
  | { tipo: 'bienvenida'; texto: string }
  | { tipo: 'responder'; texto: string };

type ResultadoPrueba = {
  iaDisponible: boolean;
  decision: Decision;
  fuentes: string[];
  lead: string | null;
  mensajeCampana: string | null;
};

type Turno = { autor: 'lead' | 'bot'; texto: string; nota?: string };

function describirEscalado(d: Extract<Decision, { tipo: 'escalar' }>): string {
  if (d.motivo === 'palabra_clave') return `Pasaría a un asesor: el cliente escribió "${d.palabra}".`;
  return `Pasaría a un asesor${d.razon ? `: ${d.razon}` : ' (no tiene información suficiente para responder).'}`;
}

/**
 * Conversa con la IA como si fueras un cliente, con la misma configuracion y
 * documentos que usa el bot real, pero sin enviar nada por WhatsApp.
 */
export function ProbarIA() {
  const [mensaje, setMensaje] = useState('');
  const [telefono, setTelefono] = useState('');
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [ultimo, setUltimo] = useState<ResultadoPrueba | null>(null);
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function probar() {
    const texto = mensaje.trim();
    if (!texto) return;
    setProbando(true);
    setError(null);
    try {
      // El historial que ve la IA son solo los turnos de esta prueba.
      const historial = turnos.map((t) => ({ autor: t.autor, texto: t.texto }));
      const resultado = await api.post<ResultadoPrueba>('/ia/probar', {
        mensaje: texto,
        telefono: telefono.trim() || undefined,
        historial,
      });
      const d = resultado.decision;
      const respuesta: Turno =
        d.tipo === 'bienvenida' || d.tipo === 'responder'
          ? { autor: 'bot', texto: d.texto }
          : { autor: 'bot', texto: '', nota: d.tipo === 'escalar' ? describirEscalado(d) : 'El bot no respondería nada.' };
      setTurnos((prev) => [...prev, { autor: 'lead', texto }, respuesta]);
      setUltimo(resultado);
      setMensaje('');
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo probar la IA');
    } finally {
      setProbando(false);
    }
  }

  function reiniciar() {
    setTurnos([]);
    setUltimo(null);
    setError(null);
  }

  return (
    <div>
      <div className={estilos.ayuda}>
        Escribe como si fueras un cliente. Usa tus documentos y ajustes guardados; no envía nada por WhatsApp. Si pones el
        teléfono de un lead, la IA usa sus datos y la campaña que recibió.
      </div>

      <input
        className={estilos.input}
        placeholder="Teléfono de un lead (opcional, para simularlo)"
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        disabled={turnos.length > 0}
      />

      {turnos.length > 0 && (
        <div className={estilos.hilo}>
          {turnos.map((t, i) =>
            t.autor === 'lead' ? (
              <div className={`${estilos.burbuja} ${estilos.cliente}`} key={i}>
                {t.texto}
              </div>
            ) : t.texto ? (
              <div className={`${estilos.burbuja} ${estilos.bot}`} key={i}>
                {t.texto}
              </div>
            ) : (
              <div className={estilos.nota} key={i}>
                🙋 {t.nota}
              </div>
            ),
          )}
        </div>
      )}

      <div className={estilos.fila}>
        <input
          className={estilos.input}
          placeholder={turnos.length ? 'Sigue la conversación…' : 'Ej. Hola, ¿cuánto cuesta una página con reservas?'}
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void probar();
          }}
          disabled={probando}
        />
        <Boton onClick={() => void probar()} disabled={probando || !mensaje.trim()}>
          {probando ? 'Pensando…' : 'Enviar'}
        </Boton>
        {turnos.length > 0 && (
          <Boton variante="texto" onClick={reiniciar} disabled={probando}>
            Reiniciar
          </Boton>
        )}
      </div>

      {error && <div className={estilos.error}>{error}</div>}

      {ultimo && (
        <div className={estilos.detalle}>
          {!ultimo.iaDisponible && <div>⚠️ La IA no está configurada en el servidor: solo se ve el comportamiento sin IA.</div>}
          {ultimo.lead && <div>Simulando a: {ultimo.lead}</div>}
          <div>
            Documentos que leyó la IA:{' '}
            {ultimo.fuentes.length ? ultimo.fuentes.join(' · ') : 'ninguno (no hay documentos activos)'}
          </div>
        </div>
      )}
    </div>
  );
}
