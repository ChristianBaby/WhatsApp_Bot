-- ============================================================
-- 003_leads — Seccion 3.2: listas de contactos
-- ============================================================

CREATE TABLE listas_leads (
  id                       SERIAL PRIMARY KEY,
  nombre                   TEXT NOT NULL,
  nombre_archivo_original  TEXT,
  total_filas              INT NOT NULL DEFAULT 0,
  validas                  INT NOT NULL DEFAULT 0,
  invalidas                INT NOT NULL DEFAULT 0,
  duplicadas               INT NOT NULL DEFAULT 0,
  -- Encabezados libres del archivo (ni telefono, ni empresa, ni rubro):
  -- quedan disponibles como variables {placeholder} al armar una publicacion.
  columnas_extra           TEXT[] NOT NULL DEFAULT '{}',
  creado_en                TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER listas_leads_actualizar_timestamp
  BEFORE UPDATE ON listas_leads
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();


CREATE TABLE leads (
  id             SERIAL PRIMARY KEY,
  lista_id       INT NOT NULL REFERENCES listas_leads(id) ON DELETE CASCADE,
  telefono       TEXT NOT NULL,
  empresa        TEXT NOT NULL,
  -- Se toma directo de la columna "rubro" del archivo (sin adivinar con IA);
  -- sirve para filtrar reportes (seccion 3.7) y segmentar campanas (8.1).
  rubro          TEXT,
  -- Resto de columnas libres del archivo (contacto, ciudad, etc.), como
  -- placeholders para personalizar el mensaje: {contacto}, {ciudad}...
  datos_extra    JSONB NOT NULL DEFAULT '{}',
  -- Mini-CRM (seccion 3.9): nuevo -> contactado -> respondio -> en_conversacion
  -- -> interesado/no_interesado/duda_precio -> venta_concretada/descartado.
  -- Por ahora todo entra en 'nuevo'; las demas transiciones llegan en fases
  -- posteriores (envio de campanas, respuestas, IA).
  etapa_pipeline TEXT NOT NULL DEFAULT 'nuevo',
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER leads_actualizar_timestamp
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

CREATE INDEX leads_lista_id_idx ON leads (lista_id);
CREATE INDEX leads_telefono_idx ON leads (telefono);
CREATE INDEX leads_etapa_pipeline_idx ON leads (etapa_pipeline);
CREATE INDEX leads_rubro_idx ON leads (rubro);


-- Filas que no pasaron la validacion al subir el archivo (seccion 3.2: hay
-- que poder mostrarle al usuario cuales fueron y por que, para que corrija
-- el archivo origen si quiere).
CREATE TABLE leads_excluidos (
  id               SERIAL PRIMARY KEY,
  lista_id         INT NOT NULL REFERENCES listas_leads(id) ON DELETE CASCADE,
  fila_numero      INT NOT NULL,
  motivo           TEXT NOT NULL
                     CHECK (motivo IN ('sin_telefono', 'telefono_invalido', 'sin_empresa', 'duplicado')),
  dato_referencia  TEXT,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX leads_excluidos_lista_id_idx ON leads_excluidos (lista_id);
