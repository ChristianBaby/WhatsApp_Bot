import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { EstadoVacio } from '../components/ui/EstadoVacio';
import { Tarjeta } from '../components/ui/Tarjeta';

export function AutoRespuestas() {
  return (
    <div style={{ maxWidth: 720 }}>
      <EncabezadoPagina
        titulo="Auto-respuestas"
        descripcion="Configura cómo responde el bot a quienes te escriben, y cuándo pasa la conversación a un asesor humano."
      />
      <Tarjeta>
        <EstadoVacio
          titulo="El auto-responder todavía no está disponible"
          detalle="La bienvenida, la base de conocimiento y el escalamiento a un asesor llegan en la Fase 5."
        />
      </Tarjeta>
    </div>
  );
}
