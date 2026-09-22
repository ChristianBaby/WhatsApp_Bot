-- ============================================================
-- 007_reportes — Seccion 3.7: reportes y exportacion
-- ============================================================

-- Que palabra especifica disparo el escalamiento (seccion 3.7: "que
-- palabras clave de escalamiento se usaron mas"). Solo se llena cuando
-- escalado_motivo = 'palabra_clave'.
ALTER TABLE conversaciones ADD COLUMN escalado_palabra TEXT;

-- Duracion real del envio (seccion 3.7) = finalizada_en - iniciada_en, ya
-- estan las dos columnas desde la Fase 3; no hace falta nada nuevo ahi.

-- Cuando se marco la venta como concretada (seccion 3.7: "evolucion de
-- ventas concretadas en el tiempo"). No sirve actualizado_en: se pisa con
-- cualquier cambio al lead (una nota, otra etapa...), no solo con la venta.
ALTER TABLE leads ADD COLUMN venta_concretada_en TIMESTAMPTZ;

-- Indices para las agregaciones de reportes (fecha de creacion de leads,
-- fecha de envio de destinatarios) que hasta ahora no se consultaban por rango.
CREATE INDEX leads_creado_en_idx ON leads (creado_en);
CREATE INDEX publicacion_destinatarios_enviado_en_idx ON publicacion_destinatarios (enviado_en);
