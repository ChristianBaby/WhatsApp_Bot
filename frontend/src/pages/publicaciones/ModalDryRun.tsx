import { Modal } from '../../components/ui/Modal';
import type { ResultadoDryRun } from '../../lib/types';
import estilos from './ModalDryRun.module.css';

export function ModalDryRun({ resultado, onCerrar }: { resultado: ResultadoDryRun; onCerrar: () => void }) {
  const exclusiones = Object.entries(resultado.excluidosPorMotivo);
  const totalExcluidos = exclusiones.reduce((suma, [, n]) => suma + n, 0);

  return (
    <Modal titulo="Resultado de la simulación" onCerrar={onCerrar} ancho>
      <div className={estilos.resumen}>
        <div className={estilos.stat}>
          <span className={estilos.statValor}>{resultado.totalDestinatarios}</span>
          <span className={estilos.statLabel}>Destinatarios</span>
        </div>
        <div className={estilos.stat}>
          <span className={estilos.statValor}>~{resultado.duracionEstimadaMinutos} min</span>
          <span className={estilos.statLabel}>Duración estimada</span>
        </div>
        {totalExcluidos > 0 && (
          <div className={estilos.stat}>
            <span className={estilos.statValor}>{totalExcluidos}</span>
            <span className={estilos.statLabel}>Excluidos</span>
          </div>
        )}
      </div>

      {totalExcluidos > 0 && (
        <p style={{ color: 'var(--texto-suave)', fontSize: 13 }}>
          No se les enviará: {exclusiones.map(([motivo, n]) => `${motivo} (${n})`).join(' · ')}.
        </p>
      )}

      {resultado.muestras.length === 0 ? (
        <p style={{ color: 'var(--texto-suave)', fontSize: 13 }}>
          La lista elegida no tiene contactos válidos para mostrar una muestra.
        </p>
      ) : (
        <div>
          <div className={estilos.tituloMuestras}>
            Así se verían los primeros {resultado.muestras.length} mensajes
          </div>
          {resultado.muestras.map((m, i) => (
            <div className={estilos.muestra} key={i}>
              <div className={estilos.muestraEmpresa}>
                {m.empresa} · +{m.telefono}
              </div>
              <div className={estilos.muestraTexto}>{m.mensaje}</div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
