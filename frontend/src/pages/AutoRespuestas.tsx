import { useEffect, useState } from 'react';
import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { Tarjeta } from '../components/ui/Tarjeta';
import { Boton } from '../components/ui/Boton';
import { Interruptor } from '../components/ui/Interruptor';
import { api, ErrorApi } from '../lib/api';
import { DocumentosConocimiento } from './autoRespuestas/DocumentosConocimiento';
import { EditorPalabras } from './autoRespuestas/EditorPalabras';
import { ProbarIA } from './autoRespuestas/ProbarIA';
import estilos from './AutoRespuestas.module.css';

type ConfiguracionCruda = {
  autorespuestas_activo?: boolean;
  mensaje_bienvenida?: string;
  palabras_escalamiento?: string[];
  nombre_negocio?: string;
  instrucciones_ia?: string;
};

export function AutoRespuestas() {
  const [cargando, setCargando] = useState(true);
  const [activo, setActivo] = useState(false);
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [instrucciones, setInstrucciones] = useState('');
  const [bienvenida, setBienvenida] = useState('');
  const [palabras, setPalabras] = useState<string[]>([]);
  const [iaDisponible, setIaDisponible] = useState<boolean | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.get<ConfiguracionCruda>('/configuracion').then((cfg) => {
      setActivo(cfg.autorespuestas_activo ?? false);
      setNombreNegocio(cfg.nombre_negocio ?? '');
      setInstrucciones(cfg.instrucciones_ia ?? '');
      setBienvenida(cfg.mensaje_bienvenida ?? '');
      setPalabras(cfg.palabras_escalamiento ?? []);
      setCargando(false);
    });
    void api
      .get<{ iaDisponible: boolean }>('/conocimiento')
      .then((d) => setIaDisponible(d.iaDisponible))
      .catch(() => setIaDisponible(null));
  }, []);

  async function guardar() {
    setGuardando(true);
    setGuardado(false);
    setError(null);
    try {
      await api.patch('/configuracion', {
        autorespuestas_activo: activo,
        nombre_negocio: nombreNegocio,
        instrucciones_ia: instrucciones,
        mensaje_bienvenida: bienvenida,
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
    <div style={{ maxWidth: 760 }}>
      <EncabezadoPagina
        titulo="Auto-respuestas"
        descripcion="Cómo responde la IA a quienes te escriben, con qué información, y cuándo pasa el chat a un asesor."
      />

      <Tarjeta className={estilos.seccion}>
        <div className={estilos.filaInterruptor}>
          <div>
            <div className={estilos.tituloInterruptor}>Auto-responder {activo ? 'activado' : 'desactivado'}</div>
            <div className={estilos.descripcionInterruptor}>
              La IA lee toda la conversación, la campaña que recibió el cliente y tus documentos, y responde en su nombre.
              Cuando está desactivado, tú atiendes todos los mensajes.
            </div>
          </div>
          <Interruptor activo={activo} onCambio={setActivo} etiqueta="Auto-responder" />
        </div>

        <div className={estilos.campo}>
          <label className={estilos.etiqueta}>Nombre del negocio</label>
          <div className={estilos.ayuda}>Con quién cree hablar el cliente ("Soy el asistente de …").</div>
          <input
            className={estilos.textarea}
            value={nombreNegocio}
            onChange={(e) => setNombreNegocio(e.target.value)}
            placeholder="Ej. Universoft Systems"
          />
        </div>

        <div className={estilos.campo}>
          <label className={estilos.etiqueta}>Indicaciones para la IA</label>
          <div className={estilos.ayuda}>
            Reglas propias, una por línea. La IA siempre trata de "usted", nunca inventa datos y pasa a un asesor lo que no
            sabe.
          </div>
          <textarea
            className={estilos.textarea}
            rows={4}
            value={instrucciones}
            onChange={(e) => setInstrucciones(e.target.value)}
            placeholder={'Ej.\nSi preguntan por precios, recomienda el Plan Reservas.\nOfrece agendar una llamada cuando el cliente muestre interés.'}
          />
        </div>

        <div className={estilos.campo}>
          <label className={estilos.etiqueta}>Bienvenida</label>
          <div className={estilos.ayuda}>
            Guía para el primer mensaje: la IA saluda con esta idea y además responde lo que el cliente preguntó. Si la IA
            no está disponible, se envía tal cual.
          </div>
          <textarea
            className={estilos.textarea}
            rows={2}
            value={bienvenida}
            onChange={(e) => setBienvenida(e.target.value)}
            placeholder="¡Hola! Gracias por escribirnos. ¿En qué podemos ayudarle?"
          />
        </div>

        <div className={estilos.campo}>
          <label className={estilos.etiqueta}>Palabras que piden un asesor humano</label>
          <div className={estilos.ayuda}>
            Si el cliente escribe alguna de estas palabras o frases (completas), el chat pasa a un asesor de inmediato.
          </div>
          <EditorPalabras palabras={palabras} onCambio={setPalabras} />
          <div className={estilos.notaExtra}>
            Además, la IA misma pasa el chat a un asesor cuando lo que piden no está en tus documentos o necesita a una
            persona (una cotización particular, un reclamo…).
          </div>
        </div>

        {error && <p style={{ color: 'var(--peligro)', fontSize: 13 }}>{error}</p>}

        <Boton onClick={() => void guardar()} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </Boton>
        {guardado && <span className={estilos.guardado}>✓ Guardado</span>}
      </Tarjeta>

      <Tarjeta className={estilos.seccion}>
        <div className={estilos.tituloInterruptor}>Base de conocimiento</div>
        <div className={estilos.descripcionInterruptor} style={{ marginBottom: 12 }}>
          Documentos de los que la IA saca sus respuestas: servicios, precios, condiciones, preguntas frecuentes. Mejor en
          Markdown (.md) con títulos por tema.
        </div>
        <DocumentosConocimiento iaDisponible={iaDisponible} />
      </Tarjeta>

      <Tarjeta className={estilos.seccion}>
        <div className={estilos.tituloInterruptor}>Probar la IA</div>
        <div style={{ marginTop: 10 }}>
          <ProbarIA />
        </div>
      </Tarjeta>

      <div className={estilos.notaNumeros}>
        Si tienes varios números conectados (ver Conexión), esta configuración aplica a todos por igual — puedes
        desactivarla en un número puntual desde su tarjeta.
      </div>
    </div>
  );
}
