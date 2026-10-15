-- ============================================================
-- 016_limpieza_archivos — Que los archivos de los chats no llenen el disco
-- ============================================================
-- Las fotos/videos/audios/documentos se bajan de WhatsApp recien cuando
-- alguien los abre y quedan guardados en el servidor. Esta limpieza borra
-- la copia guardada de lo que nadie abrio en N dias (si se vuelve a abrir,
-- se pide de nuevo a WhatsApp). Ver services/conversaciones/limpiezaArchivos.ts.

-- Ultima vez que alguien abrio (o envio) el archivo en el panel.
ALTER TABLE mensajes_conversacion ADD COLUMN media_usado_en TIMESTAMPTZ;

UPDATE mensajes_conversacion SET media_usado_en = now() WHERE media_archivo IS NOT NULL;

CREATE INDEX mensajes_conversacion_media_guardada_idx
  ON mensajes_conversacion (media_usado_en) WHERE media_archivo IS NOT NULL;

INSERT INTO configuracion (clave, valor) VALUES
  -- 0 = no borrar nunca por antiguedad (la limpieza de emergencia sigue activa).
  ('dias_conservar_archivos', '30'),
  -- Los documentos (cotizaciones, contratos...) no se borran.
  ('conservar_documentos',    'true')
ON CONFLICT (clave) DO NOTHING;
