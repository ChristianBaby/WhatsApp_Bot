import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { EstadoVacio } from '../components/ui/EstadoVacio';
import { Tarjeta } from '../components/ui/Tarjeta';

export function Reportes() {
  return (
    <div>
      <EncabezadoPagina
        titulo="Reportes"
        descripcion="Resultados de campañas, del pipeline y del auto-responder."
      />
      <Tarjeta>
        <EstadoVacio
          titulo="Todavía no hay datos que reportar"
          detalle="Los reportes se llenan solos en cuanto haya campañas enviadas. La pantalla llega en la Fase 6."
        />
      </Tarjeta>
    </div>
  );
}
