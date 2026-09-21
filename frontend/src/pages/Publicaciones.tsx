import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { EstadoVacio } from '../components/ui/EstadoVacio';
import { Tarjeta } from '../components/ui/Tarjeta';

export function Publicaciones() {
  return (
    <div>
      <EncabezadoPagina
        titulo="Publicaciones"
        descripcion="Crea campañas y revisa la cola de envíos."
      />
      <Tarjeta>
        <EstadoVacio
          titulo="Todavía no hay publicaciones"
          detalle="La cola de campañas y el motor de envío llegan en la Fase 3."
        />
      </Tarjeta>
    </div>
  );
}
