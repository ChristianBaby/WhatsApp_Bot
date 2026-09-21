-- ============================================================
-- 005_conversaciones — Secciones 3.6, 3.9: respuestas y mini-CRM
-- ============================================================

-- Notas internas del lead (la Ficha del lead de la maquetacion las pide).
ALTER TABLE leads ADD COLUMN notas TEXT;


CREATE TABLE conversaciones (
  id                      SERIAL PRIMARY KEY,
  numero_id               INT NOT NULL REFERENCES numeros_whatsapp(id) ON DELETE CASCADE,
  -- NULL si quien escribe no calza con ningun lead cargado (numero desconocido).
  -- Esas conversaciones igual se guardan (las necesita el auto-responder de
  -- la Fase 5), pero no aparecen en la pantalla de Respuestas de esta fase,
  -- que es sobre "leads que contestaron tus campanas".
  lead_id                 INT REFERENCES leads(id) ON DELETE SET NULL,
  telefono                TEXT NOT NULL,
  -- El nombre de perfil de WhatsApp (pushName) de quien escribe, util cuando no hay lead.
  nombre_contacto         TEXT,
  no_leidos               INT NOT NULL DEFAULT 0,
  ultimo_mensaje_en       TIMESTAMPTZ,
  ultimo_mensaje_preview  TEXT,
  creado_en               TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (numero_id, telefono)
);

CREATE TRIGGER conversaciones_actualizar_timestamp
  BEFORE UPDATE ON conversaciones
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

CREATE INDEX conversaciones_lead_id_idx ON conversaciones (lead_id);
CREATE INDEX conversaciones_ultimo_mensaje_idx ON conversaciones (ultimo_mensaje_en DESC);


CREATE TABLE mensajes_conversacion (
  id               SERIAL PRIMARY KEY,
  conversacion_id  INT NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  -- 'bot' no se usa todavia (llega con el auto-responder en la Fase 5),
  -- pero se deja permitido desde ya para no tener que tocar esta tabla de nuevo.
  autor            TEXT NOT NULL CHECK (autor IN ('lead', 'yo', 'bot')),
  texto            TEXT NOT NULL,
  -- El id del mensaje en WhatsApp (key.id): evita guardar el mismo mensaje
  -- dos veces si Baileys reemite el evento (reconexion, sync...).
  whatsapp_id      TEXT,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX mensajes_conversacion_whatsapp_id_idx
  ON mensajes_conversacion (whatsapp_id) WHERE whatsapp_id IS NOT NULL;
CREATE INDEX mensajes_conversacion_conversacion_id_idx
  ON mensajes_conversacion (conversacion_id, creado_en);
