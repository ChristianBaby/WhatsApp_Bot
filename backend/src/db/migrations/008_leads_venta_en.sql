-- ============================================================
-- 008_leads_venta_en — completa lo que 007 dejo a medias
-- (venta_concretada_en se agrego al archivo 007 despues de que ya se
-- habia aplicado en desarrollo; las migraciones no se editan una vez
-- aplicadas, así que se completa aca en vez de tocar el 007).
-- ============================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS venta_concretada_en TIMESTAMPTZ;
