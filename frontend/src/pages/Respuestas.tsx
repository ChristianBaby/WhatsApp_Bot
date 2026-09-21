import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { EstadoVacio } from '../components/ui/EstadoVacio';
import { Tarjeta } from '../components/ui/Tarjeta';

export function Respuestas() {
  return (
    <div>
      <EncabezadoPagina titulo="Respuestas" descripcion="Leads que contestaron tus campañas." />
      <Tarjeta>
        <EstadoVacio
          titulo="Todavía no hay respuestas"
          detalle="El chat integrado y la detección de respuestas llegan en la Fase 4."
        />
      </Tarjeta>
    </div>
  );
}
