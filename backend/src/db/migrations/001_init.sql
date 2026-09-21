-- ============================================================
-- 001_init — Cimientos del esquema
-- Tablas transversales que usan todas las fases siguientes.
--
-- Convencion: nombres en espanol, sin tildes ni enie (SQL y varias
-- herramientas no las manejan bien en identificadores).
-- ============================================================

-- Funcion reutilizable: mantiene actualizado_en al dia en cualquier tabla.
CREATE OR REPLACE FUNCTION actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- configuracion — Ajustes generales del sistema (seccion 3.8).
-- Clave/valor con JSONB para poder agregar opciones nuevas sin
-- una migracion por cada una.
-- ------------------------------------------------------------
CREATE TABLE configuracion (
  clave          TEXT PRIMARY KEY,
  valor          JSONB NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER configuracion_actualizar_timestamp
  BEFORE UPDATE ON configuracion
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

-- Valores por defecto (los mismos que muestra la maquetacion).
INSERT INTO configuracion (clave, valor) VALUES
  ('telefono_propietario',        '""'),
  ('horario_inicio',              '"09:00"'),
  ('horario_fin',                 '"19:00"'),
  ('pausa_min_segundos',          '45'),
  ('pausa_max_segundos',          '150'),
  ('tamano_lote',                 '25'),
  ('pausa_entre_lotes_minutos',   '20'),
  ('max_mensajes_por_ejecucion',  '200'),
  ('catalogo_url',                '""'),
  ('autorespuestas_activo',       'false'),
  ('mensaje_bienvenida',          '""'),
  ('base_conocimiento',           '""'),
  ('palabras_escalamiento',       '["asesor","hablar con alguien","persona real","humano"]'),
  ('dias_lead_enfriandose',       '7'),
  -- Telegram y correo quedan apagados: los avisos salen por panel y WhatsApp.
  ('canales_notificacion',        '{"nueva_respuesta":["panel","whatsapp"],"lead_caliente":["panel","whatsapp"],"resumen_pipeline":[],"campana_terminada":["panel","whatsapp"]}'),
  ('telegram_token',              '""'),
  ('telegram_chat_id',            '""'),
  ('smtp',                        '{"host":"","puerto":587,"usuario":"","contrasena":"","desde":"","hacia":""}');


-- ------------------------------------------------------------
-- usuarios — Login del panel (seccion 8.5).
-- Un solo administrador en la v1; la tabla ya soporta mas por si
-- mas adelante se agregan roles.
-- ------------------------------------------------------------
CREATE TABLE usuarios (
  id              SERIAL PRIMARY KEY,
  usuario         TEXT NOT NULL UNIQUE,
  contrasena_hash TEXT NOT NULL,
  ultimo_acceso   TIMESTAMPTZ,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER usuarios_actualizar_timestamp
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();


-- ------------------------------------------------------------
-- registro_auditoria — Auditoria simple (seccion 8.5).
-- Que se hizo, cuando y con que configuracion. Sirve para saber
-- por que salio una campana que nadie recuerda haber programado.
-- ------------------------------------------------------------
CREATE TABLE registro_auditoria (
  id           BIGSERIAL PRIMARY KEY,
  accion       TEXT NOT NULL,
  entidad_tipo TEXT,
  entidad_id   TEXT,
  detalle      JSONB,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX registro_auditoria_creado_en_idx ON registro_auditoria (creado_en DESC);
CREATE INDEX registro_auditoria_entidad_idx   ON registro_auditoria (entidad_tipo, entidad_id);
