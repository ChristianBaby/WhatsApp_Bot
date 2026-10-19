-- ============================================================
-- 018_confirmar_lectura — Checks azules al leer desde el panel
-- ============================================================
-- El jid con el que escribe el contacto ("...@s.whatsapp.net" o "...@lid").
-- Al abrir el chat en el panel se le manda la confirmacion de lectura a ese
-- jid: con los contactos @lid, WhatsApp no la acepta si va al telefono.
-- Ver services/conversaciones/lectura.ts.

ALTER TABLE conversaciones ADD COLUMN IF NOT EXISTS jid_chat TEXT;
