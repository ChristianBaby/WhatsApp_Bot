import { useEffect, useState } from 'react';
import { Boton } from '../components/ui/Boton';
import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { EstadoVacio } from '../components/ui/EstadoVacio';
import { Tarjeta } from '../components/ui/Tarjeta';
import { api, ErrorApi } from '../lib/api';
import estilos from './Configuracion.module.css';

type Valores = {
  telefono_propietario: string;
  dias_sin_recontactar: number;
  limite_respuestas_bot_hora: number;
  limite_respuestas_bot_dia: number;
  mensaje_confirmacion_baja: string;
  pausa_min_segundos: number;
  pausa_max_segundos: number;
  tamano_lote: number;
  pausa_entre_lotes_minutos: number;
  max_mensajes_por_ejecucion: number;
  horario_inicio: string;
  horario_fin: string;
};

const CLAVES = [
  'telefono_propietario',
  'dias_sin_recontactar',
  'limite_respuestas_bot_hora',
  'limite_respuestas_bot_dia',
  'mensaje_confirmacion_baja',
  'pausa_min_segundos',
  'pausa_max_segundos',
  'tamano_lote',
  'pausa_entre_lotes_minutos',
  'max_mensajes_por_ejecucion',
  'horario_inicio',
  'horario_fin',
] as const satisfies readonly (keyof Valores)[];

type CampoNumero = { clave: keyof Valores; etiqueta: string; ayuda: string; unidad: string };

function Numero({
  campo,
  valores,
  cambiar,
}: {
  campo: CampoNumero;
  valores: Valores;
  cambiar: (clave: keyof Valores, valor: string | number) => void;
}) {
  return (
    <div className={estilos.campo}>
      <label className={estilos.etiqueta}>{campo.etiqueta}</label>
      <div className={estilos.conUnidad}>
        <input
          type="number"
          min={0}
          className={estilos.input}
          value={String(valores[campo.clave])}
          onChange={(e) => cambiar(campo.clave, e.target.value === '' ? '' : Number(e.target.value))}
        />
        <span className={estilos.unidad}>{campo.unidad}</span>
      </div>
      <div className={estilos.ayuda}>{campo.ayuda}</div>
    </div>
  );
}

const PROTECCION: CampoNumero[] = [
  {
    clave: 'dias_sin_recontactar',
    etiqueta: 'No volver a escribir antes de',
    unidad: 'días',
    ayuda: 'Una campaña nueva excluye a quien recibió otra en este plazo. 0 = sin restricción.',
  },
  {
    clave: 'limite_respuestas_bot_hora',
    etiqueta: 'Respuestas automáticas por hora',
    unidad: 'por chat',
    ayuda: 'Al superarlo, el chat pasa a un asesor (evita que el bot converse sin fin con otro bot).',
  },
  {
    clave: 'limite_respuestas_bot_dia',
    etiqueta: 'Respuestas automáticas por día',
    unidad: 'por chat',
    ayuda: 'Mismo freno, en 24 horas.',
  },
];

const RITMO: CampoNumero[] = [
  { clave: 'pausa_min_segundos', etiqueta: 'Pausa mínima entre mensajes', unidad: 'seg', ayuda: 'Se elige al azar entre la mínima y la máxima.' },
  { clave: 'pausa_max_segundos', etiqueta: 'Pausa máxima entre mensajes', unidad: 'seg', ayuda: 'Pausas más largas reducen el riesgo de bloqueo.' },
  { clave: 'tamano_lote', etiqueta: 'Mensajes por lote', unidad: 'mensajes', ayuda: 'Después de cada lote hay una pausa larga.' },
  { clave: 'pausa_entre_lotes_minutos', etiqueta: 'Pausa entre lotes', unidad: 'min', ayuda: 'Descanso entre un lote y el siguiente.' },
  {
    clave: 'max_mensajes_por_ejecucion',
    etiqueta: 'Máximo por ejecución',
    unidad: 'mensajes',
    ayuda: 'Al llegar, la campaña se pausa; al reanudarla envía otro tramo igual.',
  },
];

export function Configuracion() {
  const [valores, setValores] = useState<Valores | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.get<Partial<Valores>>('/configuracion').then((cfg) => {
      setValores({
        telefono_propietario: cfg.telefono_propietario ?? '',
        dias_sin_recontactar: cfg.dias_sin_recontactar ?? 30,
        limite_respuestas_bot_hora: cfg.limite_respuestas_bot_hora ?? 4,
        limite_respuestas_bot_dia: cfg.limite_respuestas_bot_dia ?? 10,
        mensaje_confirmacion_baja: cfg.mensaje_confirmacion_baja ?? '',
        pausa_min_segundos: cfg.pausa_min_segundos ?? 45,
        pausa_max_segundos: cfg.pausa_max_segundos ?? 150,
        tamano_lote: cfg.tamano_lote ?? 25,
        pausa_entre_lotes_minutos: cfg.pausa_entre_lotes_minutos ?? 20,
        max_mensajes_por_ejecucion: cfg.max_mensajes_por_ejecucion ?? 200,
        horario_inicio: cfg.horario_inicio ?? '09:00',
        horario_fin: cfg.horario_fin ?? '19:00',
      });
    });
  }, []);

  function cambiar(clave: keyof Valores, valor: string | number) {
    setValores((prev) => (prev ? { ...prev, [clave]: valor } : prev));
  }

  async function guardar() {
    if (!valores) return;
    setGuardando(true);
    setGuardado(false);
    setError(null);
    try {
      await api.patch('/configuracion', Object.fromEntries(CLAVES.map((c) => [c, valores[c]])));
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar la configuración');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <EncabezadoPagina titulo="Configuración" descripcion="Valores por defecto para tus campañas y el cuidado de tus números." />

      {!valores ? (
        <Tarjeta>
          <EstadoVacio titulo="Cargando…" />
        </Tarjeta>
      ) : (
        <>
          <Tarjeta className={estilos.seccion}>
            <div className={estilos.tituloSeccion}>Avisos</div>
            <div className={estilos.campo}>
              <label className={estilos.etiqueta}>Tu WhatsApp para avisos</label>
              <input
                className={estilos.input}
                value={valores.telefono_propietario}
                onChange={(e) => cambiar('telefono_propietario', e.target.value)}
                placeholder="Ej. 987 654 321"
              />
              <div className={estilos.ayuda}>
                Aquí te llegan las respuestas nuevas, los leads calientes, las bajas y el resumen de cada campaña. El bot
                nunca le responde a este número. Déjalo vacío para no recibir avisos.
              </div>
            </div>
          </Tarjeta>

          <Tarjeta className={estilos.seccion}>
            <div className={estilos.tituloSeccion}>Protección del número</div>
            <div className={estilos.grilla}>
              {PROTECCION.map((c) => (
                <Numero key={c.clave} campo={c} valores={valores} cambiar={cambiar} />
              ))}
            </div>
            <div className={estilos.campo}>
              <label className={estilos.etiqueta}>Respuesta cuando alguien pide la baja</label>
              <textarea
                className={estilos.textarea}
                rows={2}
                value={valores.mensaje_confirmacion_baja}
                onChange={(e) => cambiar('mensaje_confirmacion_baja', e.target.value)}
              />
              <div className={estilos.ayuda}>Se envía una sola vez. Déjalo vacío para bloquear sin responder.</div>
            </div>
          </Tarjeta>

          <Tarjeta className={estilos.seccion}>
            <div className={estilos.tituloSeccion}>Ritmo de envío por defecto</div>
            <div className={estilos.ayuda} style={{ marginBottom: 14 }}>
              Cada campaña puede cambiarlo; esto es lo que usa si no lo hace.
            </div>
            <div className={estilos.grilla}>
              {RITMO.map((c) => (
                <Numero key={c.clave} campo={c} valores={valores} cambiar={cambiar} />
              ))}
              <div className={estilos.campo}>
                <label className={estilos.etiqueta}>Horario de envío</label>
                <div className={estilos.conUnidad}>
                  <input
                    type="time"
                    className={estilos.input}
                    value={valores.horario_inicio}
                    onChange={(e) => cambiar('horario_inicio', e.target.value)}
                  />
                  <span className={estilos.unidad}>a</span>
                  <input
                    type="time"
                    className={estilos.input}
                    value={valores.horario_fin}
                    onChange={(e) => cambiar('horario_fin', e.target.value)}
                  />
                </div>
                <div className={estilos.ayuda}>Fuera de este horario las campañas esperan (hora de Perú).</div>
              </div>
            </div>
          </Tarjeta>

          {error && <p style={{ color: 'var(--peligro)', fontSize: 13 }}>{error}</p>}
          <Boton onClick={() => void guardar()} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </Boton>
          {guardado && <span className={estilos.guardado}>✓ Guardado</span>}
        </>
      )}
    </div>
  );
}
