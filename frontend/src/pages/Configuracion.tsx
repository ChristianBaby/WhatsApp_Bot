import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { EstadoVacio } from '../components/ui/EstadoVacio';
import { Tarjeta } from '../components/ui/Tarjeta';

export function Configuracion() {
  return (
    <div style={{ maxWidth: 720 }}>
      <EncabezadoPagina
        titulo="Configuración"
        descripcion="Valores por defecto para tus campañas y reportes."
      />
      <Tarjeta>
        <EstadoVacio
          titulo="La configuración llega en la Fase 7"
          detalle="Ritmo de envío, horario laboral, API key de Gemini e integraciones externas."
        />
      </Tarjeta>
    </div>
  );
}
