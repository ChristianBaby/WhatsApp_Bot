-- ============================================================
-- 017_mensajes_completos — Ver los mensajes como en WhatsApp
-- ============================================================
-- Respuestas citadas, reacciones, mensajes editados y eliminados,
-- ubicaciones, contactos, encuestas, vista previa de enlaces, reenviados
-- y llamadas. Ver services/whatsapp/socket.ts (describirMensaje).

ALTER TABLE mensajes_conversacion
  DROP CONSTRAINT IF EXISTS mensajes_conversacion_tipo_check;
ALTER TABLE mensajes_conversacion
  ADD CONSTRAINT mensajes_conversacion_tipo_check
    CHECK (tipo IN ('texto', 'imagen', 'video', 'audio', 'nota_voz', 'documento', 'sticker', 'ubicacion',
                    'contacto', 'encuesta', 'llamada'));

ALTER TABLE mensajes_conversacion
  -- Datos propios de cada tipo: cita, reenviado, ubicacion, contactos,
  -- encuesta, vista previa de enlace, llamada (ver tipos.ts, ExtraMensaje).
  ADD COLUMN extra JSONB,
  -- { "yo": "👍", "lead": "❤️" }: en un chat 1:1 reacciona cada lado una vez.
  ADD COLUMN reacciones JSONB,
  ADD COLUMN editado_en TIMESTAMPTZ,
  -- Se conserva el texto original: el panel muestra "Se eliminó este mensaje"
  -- y deja verlo a pedido (es un CRM: lo que el cliente escribio importa).
  ADD COLUMN eliminado BOOLEAN NOT NULL DEFAULT false;
