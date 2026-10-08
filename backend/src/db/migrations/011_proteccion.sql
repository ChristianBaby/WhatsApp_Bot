-- ============================================================
-- 011 — Fase 1: proteger el numero, los contactos y los datos
-- ============================================================

-- Contactos que pidieron no recibir mas mensajes (o que se bloquean a mano).
-- Por telefono, no por lead: aplica aunque ese telefono este en varias listas
-- o escriba sin estar en ninguna.
CREATE TABLE contactos_bloqueados (
  telefono      TEXT PRIMARY KEY,
  motivo        TEXT NOT NULL CHECK (motivo IN ('pidio_baja', 'manual')),
  texto_origen  TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Destinatarios que la campana NO debe contactar (baja, cliente, asesor,
-- contactado hace poco, repetido): quedan registrados con su motivo en vez
-- de desaparecer, para que se vean en el progreso y en el log.
ALTER TABLE publicacion_destinatarios DROP CONSTRAINT publicacion_destinatarios_estado_check;
ALTER TABLE publicacion_destinatarios ADD CONSTRAINT publicacion_destinatarios_estado_check
  CHECK (estado IN ('pendiente', 'enviado', 'sin_whatsapp', 'fallido', 'excluido'));

-- Nuevos motivos de paso a modo manual.
ALTER TABLE conversaciones DROP CONSTRAINT conversaciones_escalado_motivo_check;
ALTER TABLE conversaciones ADD CONSTRAINT conversaciones_escalado_motivo_check
  CHECK (escalado_motivo IN ('palabra_clave', 'baja_confianza', 'limite_respuestas', 'pidio_baja'));

-- El limite "max mensajes" es por ejecucion: se cuenta desde que la campana
-- arranco o se reanudo por ultima vez, no el total historico (antes, al
-- reanudar se volvia a pausar en el acto, para siempre).
ALTER TABLE publicaciones ADD COLUMN ejecucion_iniciada_en TIMESTAMPTZ;

-- Celulares peruanos cargados sin codigo de pais (9 digitos, empiezan con 9):
-- WhatsApp no los reconocia y quedaban como "sin WhatsApp".
UPDATE leads SET telefono = '51' || telefono WHERE telefono ~ '^9[0-9]{8}$';

INSERT INTO configuracion (clave, valor) VALUES
  ('dias_sin_recontactar',          '30'),
  ('limite_respuestas_bot_hora',    '4'),
  ('limite_respuestas_bot_dia',     '10'),
  ('mensaje_confirmacion_baja',     '"Entendido, no volveremos a escribirte. Disculpa las molestias."')
ON CONFLICT (clave) DO NOTHING;
