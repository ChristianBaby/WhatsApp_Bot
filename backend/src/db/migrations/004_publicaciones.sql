-- ============================================================
-- 004_publicaciones — Secciones 3.3, 3.4, 3.5: campanas y envio
-- ============================================================

CREATE TABLE publicaciones (
  id                          SERIAL PRIMARY KEY,
  nombre                      TEXT NOT NULL,
  lista_id                    INT NOT NULL REFERENCES listas_leads(id),
  -- Varias variantes del mismo texto: se elige una al azar por contacto (3.3).
  variantes_mensaje           TEXT[] NOT NULL,
  adjunto_ruta                TEXT,
  adjunto_tipo                TEXT CHECK (adjunto_tipo IN ('imagen', 'video')),
  adjunto_nombre_original     TEXT,
  catalogo_url                TEXT,
  -- Uno o mas numeros que envian esta campana; si son varios, se reparte
  -- la lista entre ellos (round-robin) al generar los destinatarios.
  numero_ids                  INT[] NOT NULL,
  programada_para             TIMESTAMPTZ NOT NULL,

  -- Overrides de ritmo anti-bloqueo (3.5). NULL = usa el valor global de
  -- "configuracion". Se resuelven al procesar, nunca se copian de antemano,
  -- asi un cambio en los valores por defecto tambien aplica a lo ya programado.
  pausa_min_segundos          INT,
  pausa_max_segundos          INT,
  tamano_lote                 INT,
  pausa_entre_lotes_minutos   INT,
  horario_inicio              TEXT,
  horario_fin                 TEXT,
  max_mensajes                INT,

  -- borrador: guardada, sin programar. programada: en cola, esperando su hora.
  -- en_curso: el worker la esta procesando ahora mismo. pausada: se detuvo
  -- sola (numero caido, limite alcanzado...) y espera que el usuario decida.
  -- completada: se proceso todos los destinatarios. cancelada: el usuario la canceló.
  estado                      TEXT NOT NULL DEFAULT 'borrador'
                                CHECK (estado IN ('borrador', 'programada', 'en_curso', 'pausada', 'completada', 'cancelada')),
  motivo_pausa                TEXT,
  -- Cuantos mensajes van en el lote actual desde la ultima pausa larga;
  -- persistido para que un reinicio del proceso no pierda la cuenta.
  enviados_lote_actual         INT NOT NULL DEFAULT 0,

  iniciada_en                 TIMESTAMPTZ,
  finalizada_en                TIMESTAMPTZ,
  creado_en                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER publicaciones_actualizar_timestamp
  BEFORE UPDATE ON publicaciones
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

CREATE INDEX publicaciones_estado_idx ON publicaciones (estado);
CREATE INDEX publicaciones_programada_para_idx ON publicaciones (programada_para);


CREATE TABLE publicacion_destinatarios (
  id               SERIAL PRIMARY KEY,
  publicacion_id   INT NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
  lead_id          INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  numero_id        INT REFERENCES numeros_whatsapp(id) ON DELETE SET NULL,
  estado           TEXT NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente', 'enviado', 'sin_whatsapp', 'fallido')),
  motivo_fallo     TEXT,
  mensaje_enviado  TEXT,
  enviado_en       TIMESTAMPTZ,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX publicacion_destinatarios_publicacion_id_idx ON publicacion_destinatarios (publicacion_id);
CREATE INDEX publicacion_destinatarios_estado_idx ON publicacion_destinatarios (estado);
-- El worker busca "el siguiente pendiente de esta publicacion" en cada paso.
CREATE INDEX publicacion_destinatarios_pendientes_idx
  ON publicacion_destinatarios (publicacion_id, id)
  WHERE estado = 'pendiente';
