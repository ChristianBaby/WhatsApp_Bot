import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { EstadoVacio } from '../components/ui/EstadoVacio';
import { Tarjeta } from '../components/ui/Tarjeta';

export function Leads() {
  return (
    <div>
      <EncabezadoPagina titulo="Leads" descripcion="Sube y administra tus listas de contactos." />
      <Tarjeta>
        <EstadoVacio
          titulo="Todavía no hay listas cargadas"
          detalle="La carga de CSV/Excel con validación y limpieza llega en la Fase 2."
        />
      </Tarjeta>
    </div>
  );
}
