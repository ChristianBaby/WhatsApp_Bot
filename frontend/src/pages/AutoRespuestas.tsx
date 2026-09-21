import { useEffect, useState } from 'react';
import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { Tarjeta } from '../components/ui/Tarjeta';
import { Boton } from '../components/ui/Boton';
import { Interruptor } from '../components/ui/Interruptor';
import { api, ErrorApi } from '../lib/api';
import { EditorPalabras } from './autoRespuestas/EditorPalabras';
import estilos from './AutoRespuestas.module.css';

type ConfiguracionCruda = {
  autorespuestas_activo?: boolean;
  mensaje_bienvenida?: string;
  base_conocimiento?: string;
  palabras_escalamiento?: string[];
};

export function AutoRespuestas() {
  const [cargando, setCargando] = useState(true);
  const [activo, setActivo] = useState(false);
  const [bienvenida, setBienvenida] = useState('');
  const [baseConocimiento, setBaseConocimiento] = useState('');
  const [palabras, setPalabras] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ConfiguracionCruda>('/configuracion').then((cfg) => {
      setActivo(cfg.autorespuestas_activo ?? false);
      setBienvenida(cfg.mensaje_bienvenida ?? '');
      setBaseConocimiento(cfg.base_conocimiento ?? '');
      setPalabras(cfg.palabras_escalamiento ?? []);
      setCargando(false);
    });
  }, []);

  async function guardar() {
    setGuardando(true);
    setGuardado(false);
    setError(null);
    try {
      await api.patch('/configuracion', {
        autorespuestas_activo: activo,
        mensaje_bienvenida: bienvenida,
        base_conocimiento: baseConocimiento,
        palabras_escalamiento: palabras,
      });
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar la configuración');
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return null;

  return (
    <div style={{ maxWidth: 720 }}>
      <EncabezadoPagina
        titulo="Auto-respuestas"
        descripcion="Configura cómo responde el bot a quienes te escriben, y cuándo pasa la conversación a un asesor humano."
      />

      <Tarjeta>
        <div className={estilos.filaInterruptor}>
          <div>
            <div className={estilos.tituloInterruptor}>Auto-responder {activo ? 'activado' : 'desactivado'}</div>
            <div className={estilos.descripcionInterruptor}>
              Cuando está desactivado, nadie recibe respuesta automática — tú atiendes todos los mensajes entrantes
              manualmente.
            </div>
          </div>
          <Interruptor activo={activo} onCambio={setActivo} etiqueta="Auto-responder" />
        </div>

        <div className={estilos.campo}>
          <label className={estilos.etiqueta}>Mensaje de bienvenida</label>
          <div className={estilos.ayuda}>Se envía en el primer mensaje de cualquier conversación nueva.</div>
          <textarea
            className={estilos.textarea}
            rows={2}
            value={bienvenida}
            onChange={(e) => setBienvenida(e.target.value)}
            placeholder="¡Hola! 👋 Gracias por escribirnos. ¿En qué puedo ayudarte hoy?"
          />
        </div>

        <div className={estilos.campo}>
          <label className={estilos.etiqueta}>Base de conocimiento</label>
          <div className={estilos.ayuda}>
            Información de tus servicios que el bot usa para responder preguntas. Entre más completa, mejores
            respuestas da.
          </div>
          <textarea
            className={estilos.textarea}
            rows={5}
            value={baseConocimiento}
            onChange={(e) => setBaseConocimiento(e.target.value)}
            placeholder="Ej. Ofrecemos... Horario de atención: lunes a viernes de 9:00 a 18:00..."
          />
        </div>

        <div className={estilos.campo}>
          <label className={estilos.etiqueta}>Palabras que piden un asesor humano</label>
          <div className={estilos.ayuda}>
            Si el lead escribe alguna de estas, la conversación pasa a modo manual de inmediato.
          </div>
          <EditorPalabras palabras={palabras} onCambio={setPalabras} />
          <div className={estilos.notaExtra}>
            Además de estas palabras, la IA también deriva la conversación a un asesor cuando detecta que no puede
            responder con confianza.
          </div>
        </div>

        <div className={estilos.notaNumeros}>
          Si tienes varios números conectados (ver Conexión), esta configuración aplica a todos por igual — puedes
          desactivarlo en un número puntual desde su tarjeta.
        </div>

        {error && <p style={{ color: 'var(--peligro)', fontSize: 13 }}>{error}</p>}

        <Boton onClick={() => void guardar()} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </Boton>
        {guardado && <span className={estilos.guardado}>✓ Guardado</span>}
      </Tarjeta>
    </div>
  );
}
