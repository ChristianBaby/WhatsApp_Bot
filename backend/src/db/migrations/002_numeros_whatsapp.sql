-- ============================================================
-- 002_numeros_whatsapp — Seccion 3.1: conexion multi-numero
-- ============================================================

CREATE TABLE numeros_whatsapp (
  id             SERIAL PRIMARY KEY,
  etiqueta       TEXT NOT NULL,
  telefono       TEXT,
  -- esperando_qr: sesion creada, aun no se escanea el QR.
  -- conectado:    sesion activa y funcionando.
  -- desconectado: cerrada por el usuario (o logout remoto); requiere nuevo QR.
  -- pausado_error: se cayo sola varias veces seguidas; requiere reconexion manual.
  estado         TEXT NOT NULL DEFAULT 'esperando_qr'
                   CHECK (estado IN ('esperando_qr', 'conectado', 'desconectado', 'pausado_error')),
  ultimo_error   TEXT,
  conectado_en   TIMESTAMPTZ,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER numeros_whatsapp_actualizar_timestamp
  BEFORE UPDATE ON numeros_whatsapp
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

CREATE INDEX numeros_whatsapp_estado_idx ON numeros_whatsapp (estado);
