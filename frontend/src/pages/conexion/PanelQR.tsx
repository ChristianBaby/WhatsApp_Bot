import estilos from './PanelQR.module.css';

/** Bloque de vinculacion: imagen del QR + pasos, igual que en la maquetacion. */
export function PanelQR({ qr }: { qr: string | null }) {
  return (
    <div className={estilos.panel}>
      <div className={estilos.marco}>
        {qr ? (
          <img src={qr} alt="Código QR para vincular WhatsApp" className={estilos.imagen} />
        ) : (
          <div className={estilos.cargando}>Generando código…</div>
        )}
      </div>

      <div className={estilos.instrucciones}>
        <div className={estilos.titulo}>Escanea este código para vincular el número</div>
        <ol className={estilos.pasos}>
          <li>Abre WhatsApp en el teléfono que quieres conectar</li>
          <li>Ve a Ajustes → Dispositivos vinculados</li>
          <li>Toca "Vincular un dispositivo" y apunta la cámara aquí</li>
        </ol>
        <div className={estilos.esperando}>
          <span className={estilos.puntoPulso} />
          Esperando escaneo… el código se renueva automáticamente
        </div>
      </div>
    </div>
  );
}
