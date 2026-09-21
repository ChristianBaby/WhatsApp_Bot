import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { EstadoVacio } from '../components/ui/EstadoVacio';
import { Tarjeta } from '../components/ui/Tarjeta';

export function Conexion() {
  return (
    <div style={{ maxWidth: 680 }}>
      <EncabezadoPagina
        titulo="Conexión de WhatsApp"
        descripcion="Puedes vincular varios números y repartir tus campañas entre ellos."
      />
      <Tarjeta>
        <EstadoVacio
          titulo="Todavía no hay números vinculados"
          detalle="La vinculación por código QR llega en la Fase 1."
        />
      </Tarjeta>
    </div>
  );
}
