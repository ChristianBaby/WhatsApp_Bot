-- ============================================================
-- 021_crm_chats — Etapa 4: el chat como CRM
-- ============================================================
-- Asesores (quien entro al panel), asignar chats, etiquetas (sincronizadas
-- con WhatsApp Business cuando el numero lo es), notas internas,
-- respuestas rapidas, ficha del cliente y recordatorios.

-- Las personas que usan el panel: la identidad la da el Gateway (micro_login);
-- aca solo se recuerda quien entro, para poder asignarle chats.
CREATE TABLE IF NOT EXISTS usuarios_panel (
  id              TEXT PRIMARY KEY,
  email           TEXT,
  rol             TEXT,
  ultimo_acceso   TIMESTAMPTZ NOT NULL DEFAULT now(),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE conversaciones
  ADD COLUMN IF NOT EXISTS asignado_a TEXT REFERENCES usuarios_panel(id) ON DELETE SET NULL,
  -- Ficha del cliente (sirve tambien para chats que no son leads).
  ADD COLUMN IF NOT EXISTS ficha_nombre TEXT,
  ADD COLUMN IF NOT EXISTS ficha_empresa TEXT,
  ADD COLUMN IF NOT EXISTS ficha_correo TEXT;

CREATE INDEX IF NOT EXISTS conversaciones_asignado_idx ON conversaciones (asignado_a) WHERE asignado_a IS NOT NULL;

-- WhatsApp Business se reconoce al conectar: solo ahi existen las etiquetas del telefono.
ALTER TABLE numeros_whatsapp ADD COLUMN IF NOT EXISTS es_business BOOLEAN NOT NULL DEFAULT false;

-- color: indice de la paleta de etiquetas de WhatsApp (0-19).
CREATE TABLE IF NOT EXISTS etiquetas (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL,
  color      INT NOT NULL DEFAULT 0,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS etiquetas_nombre_idx ON etiquetas (lower(nombre));

-- La misma etiqueta en cada numero Business tiene su propio id de WhatsApp.
CREATE TABLE IF NOT EXISTS etiquetas_whatsapp (
  etiqueta_id  INT NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE,
  numero_id    INT NOT NULL REFERENCES numeros_whatsapp(id) ON DELETE CASCADE,
  wa_id        TEXT NOT NULL,
  PRIMARY KEY (numero_id, wa_id),
  UNIQUE (etiqueta_id, numero_id)
);

CREATE TABLE IF NOT EXISTS conversacion_etiquetas (
  conversacion_id  INT NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  etiqueta_id      INT NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversacion_id, etiqueta_id)
);
CREATE INDEX IF NOT EXISTS conversacion_etiquetas_etiqueta_idx ON conversacion_etiquetas (etiqueta_id);

CREATE TABLE IF NOT EXISTS notas_conversacion (
  id               SERIAL PRIMARY KEY,
  conversacion_id  INT NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  autor_id         TEXT,
  autor_email      TEXT,
  texto            TEXT NOT NULL,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notas_conversacion_idx ON notas_conversacion (conversacion_id, creado_en DESC);

-- Las notas que ya tenian los leads pasan a ser la primera nota de su chat.
INSERT INTO notas_conversacion (conversacion_id, autor_email, texto, creado_en)
SELECT c.id, NULL, l.notas, l.actualizado_en
FROM conversaciones c JOIN leads l ON l.id = c.lead_id
WHERE NULLIF(trim(l.notas), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM notas_conversacion n WHERE n.conversacion_id = c.id);

-- atajo: lo que se escribe despues de "/" en el chat (ej. /precios).
CREATE TABLE IF NOT EXISTS respuestas_rapidas (
  id              SERIAL PRIMARY KEY,
  atajo           TEXT NOT NULL,
  texto           TEXT NOT NULL,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS respuestas_rapidas_atajo_idx ON respuestas_rapidas (lower(atajo));

CREATE TABLE IF NOT EXISTS recordatorios (
  id               SERIAL PRIMARY KEY,
  conversacion_id  INT NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  texto            TEXT NOT NULL,
  vence_en         TIMESTAMPTZ NOT NULL,
  creado_por       TEXT,
  creado_por_email TEXT,
  -- Ya se aviso que vencio (panel + WhatsApp al dueño), una sola vez.
  avisado_en       TIMESTAMPTZ,
  hecho_en         TIMESTAMPTZ,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recordatorios_pendientes_idx ON recordatorios (vence_en) WHERE hecho_en IS NULL;
CREATE INDEX IF NOT EXISTS recordatorios_conversacion_idx ON recordatorios (conversacion_id);
