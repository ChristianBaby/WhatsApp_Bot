-- ============================================================
-- 019_grupos — Los grupos de WhatsApp en el panel de chats
-- ============================================================
-- Un grupo es una conversacion mas: su "telefono" es el jid completo del
-- grupo ("120363...@g.us"), asi se le escribe igual que a un contacto. Los
-- grupos no son leads: el bot no responde ahi, no cuentan en el embudo ni en
-- los reportes. El nombre del grupo va en nombre_agenda y quien escribio
-- cada mensaje, en mensajes_conversacion.extra->'participante'.

ALTER TABLE conversaciones
  ADD COLUMN IF NOT EXISTS es_grupo BOOLEAN GENERATED ALWAYS AS (telefono LIKE '%@g.us') STORED;
