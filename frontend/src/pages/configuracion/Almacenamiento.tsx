import { useEffect, useState } from 'react';
import { Boton } from '../../components/ui/Boton';
import { api, ErrorApi } from '../../lib/api';
import { formatearFechaHora } from '../../lib/fecha';
import estilos from '../Configuracion.module.css';

type Resumen = {
  archivos: number;
  bytes: number;
  disco: { libreBytes: number; totalBytes: number } | null;
  ultimaLimpieza: {
    fecha: string;
    borrados: number;
    liberadosBytes: number;
    huerfanos: number;
    emergencia: boolean;
  } | null;
};

function tamano(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** Cuanto ocupan los archivos de los chats en el servidor, y un boton para limpiar ya. */
export function Almacenamiento() {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [limpiando, setLimpiando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.get<Resumen>('/almacenamiento').then(setResumen).catch(() => setResumen(null));
  }, []);

  async function limpiar() {
    setLimpiando(true);
    setError(null);
    try {
      setResumen(await api.post<Resumen>('/almacenamiento/limpiar'));
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo limpiar');
    } finally {
      setLimpiando(false);
    }
  }

  if (!resumen) return <div className={estilos.ayuda}>Cargando uso del servidor…</div>;

  const disco = resumen.disco;
  const pocoEspacio = disco !== null && disco.libreBytes < 5 * 1024 ** 3;
  const ultima = resumen.ultimaLimpieza;

  return (
    <div className={estilos.campo}>
      <div className={estilos.etiqueta}>
        Ahora: {resumen.archivos} archivo{resumen.archivos === 1 ? '' : 's'} guardado{resumen.archivos === 1 ? '' : 's'} ·{' '}
        {tamano(resumen.bytes)}
        {disco && (
          <span style={{ color: pocoEspacio ? 'var(--peligro)' : undefined }}>
            {' '}
            · Disco del servidor: {tamano(disco.libreBytes)} libres de {tamano(disco.totalBytes)}
          </span>
        )}
      </div>
      {pocoEspacio && (
        <div className={estilos.ayuda} style={{ color: 'var(--peligro)' }}>
          Queda poco espacio: la limpieza de emergencia ya está borrando lo que nadie abrió en 7 días.
        </div>
      )}
      {ultima && (
        <div className={estilos.ayuda}>
          Última limpieza: {formatearFechaHora(ultima.fecha)} — {ultima.borrados + ultima.huerfanos} archivo(s),{' '}
          {tamano(ultima.liberadosBytes)} liberados{ultima.emergencia ? ' (emergencia)' : ''}.
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <Boton variante="secundario" onClick={() => void limpiar()} disabled={limpiando}>
          {limpiando ? 'Limpiando…' : 'Limpiar ahora'}
        </Boton>
      </div>
      {error && <div className={estilos.ayuda} style={{ color: 'var(--peligro)' }}>{error}</div>}
    </div>
  );
}
