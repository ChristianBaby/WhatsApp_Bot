-- ============================================================
-- 013 — Fase 3: IA con contexto y base de conocimiento en documentos
-- ============================================================

-- La base de conocimiento deja de ser un solo texto de 8000 caracteres:
-- son documentos (.md) que se suben, se activan/desactivan y se editan.
CREATE TABLE documentos_conocimiento (
  id             SERIAL PRIMARY KEY,
  nombre         TEXT NOT NULL,
  contenido      TEXT NOT NULL,
  activo         BOOLEAN NOT NULL DEFAULT true,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER documentos_conocimiento_actualizar_timestamp
  BEFORE UPDATE ON documentos_conocimiento
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

-- Lo que ya estaba escrito en el texto unico pasa a ser el primer documento.
INSERT INTO documentos_conocimiento (nombre, contenido)
SELECT 'Base de conocimiento anterior.md', valor #>> '{}'
FROM configuracion
WHERE clave = 'base_conocimiento' AND btrim(valor #>> '{}') <> '';

INSERT INTO configuracion (clave, valor) VALUES
  -- Con quien habla el cliente ("Soy el asistente de ...").
  ('nombre_negocio',  '""'),
  -- Reglas propias para la IA (ej. "no des precios exactos", "ofrece una llamada").
  ('instrucciones_ia', '""')
ON CONFLICT (clave) DO NOTHING;
