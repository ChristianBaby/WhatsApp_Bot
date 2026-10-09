import { useState } from 'react';
import { Tarjeta } from '../../components/ui/Tarjeta';
import { Badge } from '../../components/ui/Badge';
import { Boton } from '../../components/ui/Boton';
import { api } from '../../lib/api';
import { formatearFechaHora, formatearHora } from '../../lib/fecha';
import type { PublicacionConProgreso } from '../../lib/types';
import { ModalDetalleCampana } from '../reportes/ModalDetalleCampana';
import { ESTADO_INFO } from './estado';
import estilos from './TarjetaCampana.module.css';

function etiquetaFecha(pub: PublicacionConProgreso): string {
  switch (pub.estado) {
    case 'borrador':
      return 'Guardada como borrador';
    case 'programada':
      return `Programada para el ${formatearFechaHora(pub.programadaPara)}`;
    case 'en_curso':
      return pub.iniciadaEn ? `En curso desde las ${formatearHora(pub.iniciadaEn)}` : 'En curso';
    case 'pausada':
      return 'Pausada';
    case 'completada':
      return pub.finalizadaEn ? `Enviada el ${formatearFechaHora(pub.finalizadaEn)}` : 'Completada';
    case 'cancelada':
      return 'Cancelada';
  }
}

type Props = {
  publicacion: PublicacionConProgreso;
  onEditar: () => void;
};

export function TarjetaCampana({ publicacion: pub, onEditar }: Props) {
  const [procesando, setProcesando] = useState(false);
  const { etiqueta, tono } = ESTADO_INFO[pub.estado];
  const { progreso } = pub;

  const puedeEditar = pub.estado === 'borrador' || pub.estado === 'programada';
  const puedeCancelar = pub.estado !== 'completada' && pub.estado !== 'cancelada';
  const puedeReanudar = pub.estado === 'pausada';
  // Respuestas por variante del mensaje, por numero y por hora (ver Reportes).
  const tieneResultados = progreso.enviados > 0;
  const [verResultados, setVerResultados] = useState(false);

  const procesados = progreso.enviados + progreso.sinWhatsapp + progreso.fallidos + progreso.excluidos;
  const pct = progreso.totalDestinatarios > 0 ? Math.round((procesados / progreso.totalDestinatarios) * 100) : 0;

  async function cancelar() {
    if (!window.confirm(`¿Cancelar "${pub.nombre}"? Esta acción no se puede deshacer.`)) return;
    setProcesando(true);
    try {
      await api.post(`/publicaciones/${pub.id}/cancelar`);
    } finally {
      setProcesando(false);
    }
  }

  async function reanudar() {
    setProcesando(true);
    try {
      await api.post(`/publicaciones/${pub.id}/reanudar`);
    } finally {
      setProcesando(false);
    }
  }

  return (
    <Tarjeta className={estilos.tarjeta}>
      <div className={estilos.encabezado}>
        <div>
          <div className={estilos.nombre}>{pub.nombre}</div>
          <div className={estilos.detalle}>
            Lista: {pub.nombreLista} · {etiquetaFecha(pub)}
          </div>
        </div>
        <div className={estilos.derecha}>
          <Badge tono={tono}>{etiqueta}</Badge>
        </div>
      </div>

      {pub.estado === 'en_curso' && (
        <div>
          <div className={estilos.progresoFila}>
            <span>
              {procesados} de {progreso.totalDestinatarios} procesados
              {progreso.excluidos > 0 && ` · ${progreso.excluidos} excluidos`}
            </span>
            <span>{pct}%</span>
          </div>
          <div className={estilos.barraFondo}>
            <div className={estilos.barraRelleno} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {pub.estado === 'completada' && (
        <div className={estilos.resumenFinal}>
          <span>✅ {progreso.enviados} enviados</span>
          <span>🚫 {progreso.sinWhatsapp} sin WhatsApp</span>
          <span>❌ {progreso.fallidos} fallidos</span>
          {progreso.excluidos > 0 && (
            <span title="Bajas, clientes, chats con asesor, contactados hace poco o teléfonos repetidos">
              ⛔ {progreso.excluidos} excluidos
            </span>
          )}
        </div>
      )}

      {pub.estado === 'pausada' && pub.motivoPausa && <div className={estilos.motivoPausa}>⏸ {pub.motivoPausa}</div>}

      {(puedeEditar || puedeCancelar || puedeReanudar || tieneResultados) && (
        <div className={estilos.acciones}>
          {tieneResultados && (
            <Boton variante="secundario" onClick={() => setVerResultados(true)}>
              Resultados
            </Boton>
          )}
          {puedeEditar && (
            <Boton variante="secundario" onClick={onEditar} disabled={procesando}>
              Editar
            </Boton>
          )}
          {puedeReanudar && (
            <Boton onClick={() => void reanudar()} disabled={procesando}>
              Reanudar
            </Boton>
          )}
          {puedeCancelar && (
            <Boton variante="peligro" onClick={() => void cancelar()} disabled={procesando}>
              Cancelar
            </Boton>
          )}
        </div>
      )}

      {verResultados && <ModalDetalleCampana campana={pub} onCerrar={() => setVerResultados(false)} />}
    </Tarjeta>
  );
}
