-- ============================================================
-- 023_leads_apify.sql
-- ============================================================
-- Carga directa del export de Apify (Google Maps Scraper): los negocios
-- cerrados (temporal o permanentemente) se descartan con su propio motivo.
-- Y una campana puede limitarse a parte de una lista (por prioridad, web,
-- categoria, zona, calificacion...): el filtro se guarda con la campana.
-- ============================================================

ALTER TABLE leads_excluidos DROP CONSTRAINT IF EXISTS leads_excluidos_motivo_check;
ALTER TABLE leads_excluidos ADD CONSTRAINT leads_excluidos_motivo_check
  CHECK (motivo IN ('sin_telefono', 'telefono_invalido', 'sin_empresa', 'duplicado', 'cerrado'));

-- NULL = toda la lista.
ALTER TABLE publicaciones ADD COLUMN IF NOT EXISTS filtro_leads JSONB;
