import { useRef, useState } from 'react';
import { Icono } from '../../components/ui/Icono';
import { api, ErrorApi } from '../../lib/api';
import estilos from './AdjuntoCampo.module.css';

export type Adjunto = {
  ruta: string;
  tipo: 'imagen' | 'video';
  nombreOriginal: string;
  url: string;
  tamano: number;
};

type Props = {
  valor: Adjunto | null;
  onCambio: (adjunto: Adjunto | null) => void;
  disabled?: boolean;
};

function formatearTamano(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Imagen o video corto opcional de la publicacion (seccion 3.3). */
export function AdjuntoCampo({ valor, onCambio, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alElegirArchivo(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    setSubiendo(true);
    try {
      const formData = new FormData();
      formData.append('archivo', archivo);
      const resultado = await api.post<Adjunto>('/adjuntos', formData);
      onCambio(resultado);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo subir el archivo');
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div>
      <div
        className={estilos.caja}
        onClick={() => !disabled && !subiendo && inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        {valor?.tipo === 'imagen' ? (
          <img src={valor.url} alt="" className={estilos.miniatura} />
        ) : (
          <div className={estilos.iconoVacio}>
            <Icono nombre="subir" tamano={18} color="var(--texto-tenue)" />
          </div>
        )}

        <div>
          <span className={estilos.texto}>
            {subiendo
              ? 'Subiendo…'
              : valor
                ? `${valor.nombreOriginal} — ${valor.tipo}, ${formatearTamano(valor.tamano)}`
                : 'Haz clic para adjuntar una imagen o video corto'}
          </span>
          {!valor && <span className={estilos.ayuda}>Opcional — .jpg, .png, .webp, .mp4, .mov, .webm (máx. 16MB)</span>}
        </div>

        {valor && (
          <button
            className={estilos.quitar}
            onClick={(e) => {
              e.stopPropagation();
              onCambio(null);
            }}
            aria-label="Quitar adjunto"
            type="button"
          >
            <Icono nombre="cerrar" tamano={16} />
          </button>
        )}
      </div>

      {error && <div style={{ color: 'var(--peligro)', fontSize: 12, marginTop: 6 }}>{error}</div>}

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm"
        className={estilos.inputOculto}
        disabled={disabled || subiendo}
        onChange={(e) => {
          void alElegirArchivo(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
