import { useRef, useState, type DragEvent } from 'react';
import { Icono } from '../../components/ui/Icono';
import { Boton } from '../../components/ui/Boton';
import estilos from './Dropzone.module.css';

const EXTENSIONES_ACEPTADAS = ['.csv', '.xlsx'];

type Props = {
  onArchivo: (archivo: File) => void;
  disabled?: boolean;
};

/** Arrastrar-y-soltar o hacer clic para elegir el CSV/XLSX de leads. */
export function Dropzone({ onArchivo, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);

  function manejarSeleccion(archivos: FileList | null) {
    const archivo = archivos?.[0];
    if (archivo) onArchivo(archivo);
  }

  function alSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    if (disabled) return;
    manejarSeleccion(e.dataTransfer.files);
  }

  return (
    <div
      className={`${estilos.zona} ${arrastrando ? estilos.arrastrando : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={alSoltar}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      style={{ cursor: disabled ? 'default' : 'pointer' }}
    >
      <Icono nombre="subir" tamano={30} color="var(--texto-tenue)" />
      <div className={estilos.texto}>Arrastra tu archivo aquí o haz clic para subir</div>
      <div className={estilos.ayuda}>
        Formatos aceptados: {EXTENSIONES_ACEPTADAS.join(', ')} — columnas obligatorias: teléfono, empresa
      </div>
      <Boton
        variante="secundario"
        disabled={disabled}
        onClick={(e) => {
          // Evita que el clic tambien dispare el onClick del contenedor
          // (abriria el selector dos veces).
          e.stopPropagation();
          inputRef.current?.click();
        }}
      >
        Seleccionar archivo
      </Boton>
      <input
        ref={inputRef}
        type="file"
        accept={EXTENSIONES_ACEPTADAS.join(',')}
        className={estilos.inputOculto}
        disabled={disabled}
        onChange={(e) => {
          manejarSeleccion(e.target.files);
          e.target.value = ''; // permite volver a elegir el mismo archivo si hace falta
        }}
      />
    </div>
  );
}
