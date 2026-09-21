import { useState } from 'react';
import { Icono } from '../../components/ui/Icono';
import { Boton } from '../../components/ui/Boton';
import { Tarjeta } from '../../components/ui/Tarjeta';
import { Interruptor } from '../../components/ui/Interruptor';
import { api } from '../../lib/api';
import { formatearRelativo } from '../../lib/fecha';
import type { NumeroWhatsapp } from '../../lib/types';
import { PanelQR } from './PanelQR';
import estilos from './TarjetaNumero.module.css';

const VISUAL_POR_ESTADO: Record<NumeroWhatsapp['estado'], { fondo: string; punto?: string }> = {
  conectado: { fondo: 'var(--exito-fondo)' },
  esperando_qr: { fondo: 'var(--alerta-fondo)', punto: 'var(--alerta-punto)' },
  pausado_error: { fondo: 'var(--peligro-fondo)', punto: 'var(--peligro-punto)' },
  desconectado: { fondo: 'var(--fondo-neutro)', punto: 'var(--texto-tenue-2)' },
};

function detalleEstado(numero: NumeroWhatsapp): string {
  switch (numero.estado) {
    case 'conectado':
      return numero.conectadoEn ? `Conectado ${formatearRelativo(numero.conectadoEn)}` : 'Conectado';
    case 'esperando_qr':
      return 'Esperando que escanees el código QR…';
    case 'pausado_error':
      return numero.ultimoError
        ? `Pausado por un error: ${numero.ultimoError}`
        : 'Pausado por un error de conexión';
    case 'desconectado':
      return 'Sin conexión';
  }
}

export function TarjetaNumero({ numero, qr }: { numero: NumeroWhatsapp; qr: string | null }) {
  const [editando, setEditando] = useState(false);
  const [etiquetaBorrador, setEtiquetaBorrador] = useState(numero.etiqueta);
  const [procesando, setProcesando] = useState(false);

  async function guardarEtiqueta() {
    const valor = etiquetaBorrador.trim();
    if (!valor || valor === numero.etiqueta) {
      setEditando(false);
      setEtiquetaBorrador(numero.etiqueta);
      return;
    }
    setProcesando(true);
    try {
      await api.patch(`/numeros/${numero.id}`, { etiqueta: valor });
      setEditando(false);
    } catch {
      // La tarjeta simplemente conserva el valor anterior; el usuario puede reintentar.
    } finally {
      setProcesando(false);
    }
  }

  async function reconectar() {
    setProcesando(true);
    try {
      await api.post(`/numeros/${numero.id}/reconectar`);
    } finally {
      setProcesando(false);
    }
  }

  async function cambiarAutoRespuestas(activo: boolean) {
    setProcesando(true);
    try {
      await api.patch(`/numeros/${numero.id}/auto-respuestas`, { activo });
    } finally {
      setProcesando(false);
    }
  }

  async function cerrarSesion() {
    const confirmado = window.confirm(
      `¿Cerrar la sesión de "${numero.etiqueta}"? Tendrás que volver a escanear el código QR para reconectarlo.`,
    );
    if (!confirmado) return;
    setProcesando(true);
    try {
      await api.post(`/numeros/${numero.id}/cerrar-sesion`);
    } finally {
      setProcesando(false);
    }
  }

  const visual = VISUAL_POR_ESTADO[numero.estado];

  return (
    <Tarjeta>
      <div className={estilos.fila}>
        <div className={estilos.info}>
          <div className={estilos.icono} style={{ background: visual.fondo }}>
            {numero.estado === 'conectado' ? (
              <Icono nombre="check" color="var(--exito)" tamano={21} />
            ) : (
              <span className={estilos.punto} style={{ background: visual.punto }} />
            )}
          </div>

          <div style={{ minWidth: 0 }}>
            {editando ? (
              <input
                autoFocus
                className={estilos.inputEtiqueta}
                value={etiquetaBorrador}
                disabled={procesando}
                onChange={(e) => setEtiquetaBorrador(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void guardarEtiqueta();
                  if (e.key === 'Escape') {
                    setEditando(false);
                    setEtiquetaBorrador(numero.etiqueta);
                  }
                }}
                onBlur={() => void guardarEtiqueta()}
              />
            ) : (
              <div className={estilos.nombre}>
                {numero.etiqueta}
                {numero.telefono && <span className={estilos.telefono}> · +{numero.telefono}</span>}
              </div>
            )}
            <div className={estilos.detalle}>{detalleEstado(numero)}</div>
          </div>
        </div>

        <div className={estilos.acciones}>
          {!editando && (
            <Boton variante="secundario" onClick={() => setEditando(true)} disabled={procesando}>
              Renombrar
            </Boton>
          )}

          {numero.estado === 'conectado' && (
            <Boton variante="peligro" onClick={cerrarSesion} disabled={procesando}>
              Cerrar sesión
            </Boton>
          )}

          {(numero.estado === 'desconectado' || numero.estado === 'pausado_error') && (
            <Boton variante="secundario" onClick={reconectar} disabled={procesando}>
              Reconectar
            </Boton>
          )}

          {numero.estado === 'esperando_qr' && (
            <Boton variante="secundario" onClick={cerrarSesion} disabled={procesando}>
              Cancelar
            </Boton>
          )}
        </div>
      </div>

      {numero.estado === 'esperando_qr' && <PanelQR qr={qr} />}

      <div className={estilos.filaAutoRespuestas}>
        <span className={estilos.autoRespuestasTexto}>Auto-respuestas en este número</span>
        <Interruptor
          activo={numero.autoRespuestasActivo}
          onCambio={(v) => void cambiarAutoRespuestas(v)}
          disabled={procesando}
          etiqueta="Auto-respuestas en este número"
        />
      </div>
    </Tarjeta>
  );
}
