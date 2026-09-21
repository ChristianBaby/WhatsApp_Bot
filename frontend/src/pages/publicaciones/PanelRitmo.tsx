import { useState } from 'react';
import { Tarjeta } from '../../components/ui/Tarjeta';
import { Boton } from '../../components/ui/Boton';
import estilos from './PanelRitmo.module.css';

export type OverridesRitmo = {
  pausaMinSegundos: number | null;
  pausaMaxSegundos: number | null;
  tamanoLote: number | null;
  pausaEntreLotesMinutos: number | null;
  horarioInicio: string | null;
  horarioFin: string | null;
  maxMensajes: number | null;
};

export const SIN_OVERRIDES: OverridesRitmo = {
  pausaMinSegundos: null,
  pausaMaxSegundos: null,
  tamanoLote: null,
  pausaEntreLotesMinutos: null,
  horarioInicio: null,
  horarioFin: null,
  maxMensajes: null,
};

type Props = {
  defaults: Record<string, unknown>;
  overrides: OverridesRitmo;
  onCambio: (overrides: OverridesRitmo) => void;
  onDryRun: () => void;
  dryRunCargando: boolean;
  onAbrirPrueba: () => void;
};

/** Ritmo anti-bloqueo (seccion 3.5): valores por defecto, con override opcional por campaña. */
export function PanelRitmo({ defaults, overrides, onCambio, onDryRun, dryRunCargando, onAbrirPrueba }: Props) {
  const [personalizando, setPersonalizando] = useState(() => Object.values(overrides).some((v) => v !== null));

  const pausaMin = overrides.pausaMinSegundos ?? Number(defaults.pausa_min_segundos ?? 45);
  const pausaMax = overrides.pausaMaxSegundos ?? Number(defaults.pausa_max_segundos ?? 150);
  const lote = overrides.tamanoLote ?? Number(defaults.tamano_lote ?? 25);
  const pausaLote = overrides.pausaEntreLotesMinutos ?? Number(defaults.pausa_entre_lotes_minutos ?? 20);
  const horaInicio = overrides.horarioInicio ?? String(defaults.horario_inicio ?? '09:00');
  const horaFin = overrides.horarioFin ?? String(defaults.horario_fin ?? '19:00');

  function actualizar<K extends keyof OverridesRitmo>(campo: K, valor: OverridesRitmo[K]) {
    onCambio({ ...overrides, [campo]: valor });
  }

  function restaurarDefaults() {
    setPersonalizando(false);
    onCambio(SIN_OVERRIDES);
  }

  return (
    <Tarjeta>
      <div className={estilos.titulo}>Ritmo de envío</div>

      {!personalizando && (
        <>
          <div className={estilos.filaValor}>
            <span>Pausa entre mensajes</span>
            <span>
              {pausaMin}–{pausaMax} seg
            </span>
          </div>
          <div className={estilos.filaValor}>
            <span>Tamaño de lote</span>
            <span>{lote} contactos</span>
          </div>
          <div className={estilos.filaValor}>
            <span>Pausa entre lotes</span>
            <span>{pausaLote} min</span>
          </div>
          <div className={estilos.filaValor}>
            <span>Horario permitido</span>
            <span>
              {horaInicio}–{horaFin}
            </span>
          </div>
          <button className={estilos.linkPersonalizar} onClick={() => setPersonalizando(true)}>
            Personalizar para esta campaña
          </button>
        </>
      )}

      {personalizando && (
        <>
          <div className={estilos.grupo}>
            <label className={estilos.grupoEtiqueta}>Pausa entre mensajes (seg)</label>
            <div className={estilos.par}>
              <input
                type="number"
                className={estilos.inputChico}
                placeholder={String(pausaMin)}
                value={overrides.pausaMinSegundos ?? ''}
                onChange={(e) => actualizar('pausaMinSegundos', e.target.value ? Number(e.target.value) : null)}
              />
              <input
                type="number"
                className={estilos.inputChico}
                placeholder={String(pausaMax)}
                value={overrides.pausaMaxSegundos ?? ''}
                onChange={(e) => actualizar('pausaMaxSegundos', e.target.value ? Number(e.target.value) : null)}
              />
            </div>
          </div>

          <div className={estilos.grupo}>
            <label className={estilos.grupoEtiqueta}>Lote / pausa entre lotes (min)</label>
            <div className={estilos.par}>
              <input
                type="number"
                className={estilos.inputChico}
                placeholder={String(lote)}
                value={overrides.tamanoLote ?? ''}
                onChange={(e) => actualizar('tamanoLote', e.target.value ? Number(e.target.value) : null)}
              />
              <input
                type="number"
                className={estilos.inputChico}
                placeholder={String(pausaLote)}
                value={overrides.pausaEntreLotesMinutos ?? ''}
                onChange={(e) => actualizar('pausaEntreLotesMinutos', e.target.value ? Number(e.target.value) : null)}
              />
            </div>
          </div>

          <div className={estilos.grupo}>
            <label className={estilos.grupoEtiqueta}>Horario permitido</label>
            <div className={estilos.par}>
              <input
                type="time"
                className={estilos.inputChico}
                value={overrides.horarioInicio ?? horaInicio}
                onChange={(e) => actualizar('horarioInicio', e.target.value)}
              />
              <input
                type="time"
                className={estilos.inputChico}
                value={overrides.horarioFin ?? horaFin}
                onChange={(e) => actualizar('horarioFin', e.target.value)}
              />
            </div>
          </div>

          <div className={estilos.grupo}>
            <label className={estilos.grupoEtiqueta}>Máximo de mensajes en esta campaña</label>
            <input
              type="number"
              className={estilos.inputChico}
              placeholder={String(defaults.max_mensajes_por_ejecucion ?? 200)}
              value={overrides.maxMensajes ?? ''}
              onChange={(e) => actualizar('maxMensajes', e.target.value ? Number(e.target.value) : null)}
            />
          </div>

          <button className={estilos.linkPersonalizar} onClick={restaurarDefaults}>
            Usar los valores por defecto
          </button>
        </>
      )}

      <div className={estilos.divisor} />

      <div className={estilos.nota}>
        Estos valores vienen de tu configuración por defecto, salvo que los personalices arriba. Los globales se
        cambian en <span className={estilos.link}>Configuración</span>.
      </div>

      <div className={estilos.accionesPrueba}>
        <Boton variante="secundario" ancho onClick={onDryRun} disabled={dryRunCargando}>
          {dryRunCargando ? 'Simulando…' : '🧪 Probar (dry-run)'}
        </Boton>
        <Boton variante="secundario" ancho onClick={onAbrirPrueba}>
          📤 Enviar prueba a un número
        </Boton>
      </div>
    </Tarjeta>
  );
}
