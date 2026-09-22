-- ============================================================
-- 009_sesiones — Seccion 8.5: login del panel
-- Tabla que espera connect-pg-simple para guardar las sesiones en
-- Postgres (asi un reinicio del contenedor no desloguea a nadie).
-- ============================================================

CREATE TABLE session (
  sid    VARCHAR NOT NULL COLLATE "default",
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

ALTER TABLE session ADD CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX idx_session_expire ON session (expire);
