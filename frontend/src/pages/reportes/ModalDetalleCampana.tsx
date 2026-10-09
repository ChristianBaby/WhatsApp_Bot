import { useEffect, useState } from 'react';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { Modal } from '../../components/ui/Modal';
import { api } from '../../lib/api';
import type { CampanaResumen, DesgloseCampana, DetalleCampana } from '../../lib/types';
import estilos from './ModalDetalleCampana.module.css';

function Desglose({ titulo, filas, nota }: { titulo: string; filas: DesgloseCampana[]; nota?: string }) {
  const mejor = Math.max(0, ...filas.map((f) => f.tasaRespuesta));
  return (
    <div className={estilos.bloque}>
      <div className={estilos.titulo}>{titulo}</div>
      {nota && <div className={estilos.nota}>{nota}</div>}
      {filas.length === 0 ? (
        <div className={estilos.nota}>Sin envíos todavía.</div>
      ) : (
        filas.map((f) => (
          <div key={f.clave}>
            <div className={estilos.fila}>
              <div className={estilos.clave} title={f.clave}>
                {f.clave}
                {f.tasaRespuesta === mejor && mejor > 0 && filas.length > 1 && <span className={estilos.mejor}> ★ la mejor</span>}
              </div>
              <div className={estilos.barraFondo}>
                <div className={estilos.barra} style={{ width: `${Math.min(100, f.tasaRespuesta)}%` }} />
              </div>
              <div className={estilos.numeros}>
                <strong className={f.tasaRespuesta === mejor && mejor > 0 ? estilos.mejor : undefined}>
                  {f.tasaRespuesta}%
                </strong>{' '}
                · {f.respondieron}/{f.enviados} respondieron · {f.leidos} leídos · {f.interesados} interesados
                {f.bajas > 0 && ` · ${f.bajas} bajas`}
              </div>
            </div>
            {f.texto && <div className={estilos.textoVariante}>{f.texto}</div>}
          </div>
        ))
      )}
    </div>
  );
}

/** Qué variante del mensaje, qué número y qué hora de envío consiguen más respuestas. */
export function ModalDetalleCampana({
  campana,
  onCerrar,
}: {
  campana: Pick<CampanaResumen, 'id' | 'nombre'>;
  onCerrar: () => void;
}) {
  const [detalle, setDetalle] = useState<DetalleCampana | null>(null);

  useEffect(() => {
    void api.get<DetalleCampana>(`/reportes/campanas/${campana.id}`).then(setDetalle);
  }, [campana.id]);

  return (
    <Modal titulo={`Campaña: ${campana.nombre}`} onCerrar={onCerrar} ancho>
      {!detalle ? (
        <EstadoVacio titulo="Cargando…" />
      ) : (
        <>
          <Desglose
            titulo="Por variante del mensaje"
            filas={detalle.porVariante}
            nota="Qué mensaje consiguió más respuestas e interesados. Úsalo para quedarte con el que mejor funciona."
          />
          <Desglose titulo="Por número de WhatsApp" filas={detalle.porNumero} />
          <Desglose
            titulo="Por hora de envío"
            filas={detalle.porHora}
            nota="Te dice a qué hora conviene programar tus campañas."
          />
        </>
      )}
    </Modal>
  );
}
