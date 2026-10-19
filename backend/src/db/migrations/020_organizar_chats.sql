-- ============================================================
-- 020_organizar_chats — Fijar, archivar, destacar y fotos de perfil
-- ============================================================
-- Fijado, archivado y destacado se sincronizan con el telefono, como en
-- WhatsApp Web (ver services/conversaciones/organizar.ts). La foto de perfil
-- se guarda en disco y se vuelve a pedir a WhatsApp una vez al dia:
-- foto_revisada_en es cuando se pregunto por ultima vez (foto_archivo NULL
-- con fecha = el contacto no tiene foto o la oculta).

ALTER TABLE conversaciones
  ADD COLUMN IF NOT EXISTS fijado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archivado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS foto_archivo TEXT,
  ADD COLUMN IF NOT EXISTS foto_revisada_en TIMESTAMPTZ;

ALTER TABLE mensajes_conversacion ADD COLUMN IF NOT EXISTS destacado BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS mensajes_destacados_idx
  ON mensajes_conversacion (conversacion_id, creado_en DESC) WHERE destacado;

-- Galeria del chat: fotos/videos, documentos.
CREATE INDEX IF NOT EXISTS mensajes_tipo_idx ON mensajes_conversacion (conversacion_id, tipo, creado_en DESC);
