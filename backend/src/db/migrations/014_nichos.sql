-- ============================================================
-- 014 — Conocimiento por nicho
-- ============================================================
-- Cada documento es General (nicho_id NULL: vale para todos) o de un nicho.
-- Cada lista de leads tiene su nicho: cuando un lead responde, la IA usa los
-- documentos generales + los de su nicho (a una agencia no se le habla de
-- menus de restaurante).

CREATE TABLE nichos (
  id        SERIAL PRIMARY KEY,
  nombre    TEXT NOT NULL UNIQUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO nichos (nombre) VALUES
  ('Agencias de turismo'),
  ('Restaurantes'),
  ('Empresas y automatización ERP');

ALTER TABLE documentos_conocimiento ADD COLUMN nicho_id INT REFERENCES nichos(id) ON DELETE SET NULL;
ALTER TABLE listas_leads ADD COLUMN nicho_id INT REFERENCES nichos(id) ON DELETE SET NULL;

INSERT INTO configuracion (clave, valor) VALUES
  -- Nombre con el que se presenta la IA (ej. "Christian"); vacio = no se presenta con nombre.
  ('nombre_asistente', '""')
ON CONFLICT (clave) DO NOTHING;
