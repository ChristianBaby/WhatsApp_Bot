-- ============================================================
-- 015_chat_completo — El panel como un WhatsApp completo
-- ============================================================
-- Todos los chats individuales del numero (no solo leads), con el
-- historial reciente que WhatsApp envia al vincular, fotos, videos,
-- audios y documentos (descargados solo cuando se abren) y los
-- checks de entregado/leido de lo que enviamos.

ALTER TABLE mensajes_conversacion
  ADD COLUMN tipo TEXT NOT NULL DEFAULT 'texto'
    CHECK (tipo IN ('texto', 'imagen', 'video', 'audio', 'nota_voz', 'documento', 'sticker', 'ubicacion', 'contacto')),
  -- Datos para mostrar el adjunto sin descargarlo: mime, nombre, segundos, tamano.
  ADD COLUMN media JSONB,
  -- El mensaje original de WhatsApp (key + contenido, serializado) que hace
  -- falta para descargar el archivo de los servidores de WhatsApp despues.
  ADD COLUMN media_descarga JSONB,
  -- Nombre del archivo ya descargado (o enviado desde el panel) en uploads/.chats/.
  ADD COLUMN media_archivo TEXT,
  -- Solo para mensajes nuestros (yo/bot): el check de WhatsApp.
  ADD COLUMN estado_entrega TEXT CHECK (estado_entrega IN ('enviado', 'entregado', 'leido')),
  -- Importado del historial del telefono al vincular: nunca dispara avisos ni la IA.
  ADD COLUMN del_historial BOOLEAN NOT NULL DEFAULT false;

-- El nombre con el que el usuario guardo al contacto en su telefono.
ALTER TABLE conversaciones ADD COLUMN nombre_agenda TEXT;

-- La lista nueva solo muestra chats con fecha de ultimo mensaje (la usa el
-- cursor). Por si algun chat viejo tiene mensajes pero quedo sin ella.
UPDATE conversaciones c
SET ultimo_mensaje_en = m.creado_en,
    ultimo_mensaje_preview = COALESCE(c.ultimo_mensaje_preview, left(m.texto, 140))
FROM (
  SELECT DISTINCT ON (conversacion_id) conversacion_id, creado_en, texto
  FROM mensajes_conversacion
  ORDER BY conversacion_id, creado_en DESC, id DESC
) m
WHERE m.conversacion_id = c.id AND c.ultimo_mensaje_en IS NULL;

-- Lista de chats paginada por "mas reciente primero" (cursor fecha + id).
DROP INDEX IF EXISTS conversaciones_ultimo_mensaje_idx;
CREATE INDEX conversaciones_lista_idx ON conversaciones (ultimo_mensaje_en DESC, id DESC);

-- Mensajes de un chat paginados hacia atras (cursor fecha + id).
DROP INDEX IF EXISTS mensajes_conversacion_conversacion_id_idx;
CREATE INDEX mensajes_conversacion_pagina_idx ON mensajes_conversacion (conversacion_id, creado_en DESC, id DESC);
