-- ============================================================
-- 012 — Fase 2: archivar numeros/listas, archivo original y metricas reales
-- ============================================================

-- Archivar en vez de borrar: el historial de chats y las metricas se
-- conservan (conversaciones.numero_id tiene ON DELETE CASCADE: borrar un
-- numero borraria todos sus chats).
ALTER TABLE numeros_whatsapp ADD COLUMN archivado_en TIMESTAMPTZ;

-- Una lista usada en campanas se archiva (no se puede borrar sin romper
-- reportes); una nunca usada se borra de verdad.
ALTER TABLE listas_leads ADD COLUMN archivada_en TIMESTAMPTZ;
-- Copia del Excel/CSV que se subio, para poder descargarlo despues.
ALTER TABLE listas_leads ADD COLUMN archivo_ruta TEXT;

-- Metricas por envio: antes la "tasa de respuesta" salia de la etapa ACTUAL
-- del lead (inflada: contaba respuestas a otras campanas).
ALTER TABLE publicacion_destinatarios
  ADD COLUMN whatsapp_id     TEXT,
  ADD COLUMN variante_indice INT,
  ADD COLUMN entregado_en    TIMESTAMPTZ,
  ADD COLUMN leido_en        TIMESTAMPTZ,
  ADD COLUMN respondio_en    TIMESTAMPTZ;

CREATE INDEX publicacion_destinatarios_whatsapp_id_idx
  ON publicacion_destinatarios (whatsapp_id) WHERE whatsapp_id IS NOT NULL;

-- Historico: la primera respuesta del lead dentro de los 30 dias posteriores
-- a cada envio ya hecho. Asi las campanas pasadas tambien tienen metricas reales.
UPDATE publicacion_destinatarios pd
SET respondio_en = (
  SELECT MIN(mc.creado_en)
  FROM mensajes_conversacion mc
  JOIN conversaciones c ON c.id = mc.conversacion_id
  WHERE c.telefono = l.telefono AND mc.autor = 'lead'
    AND mc.creado_en > pd.enviado_en AND mc.creado_en < pd.enviado_en + interval '30 days'
)
FROM leads l
WHERE l.id = pd.lead_id AND pd.estado = 'enviado' AND pd.enviado_en IS NOT NULL;

-- Ritmo por defecto: ahora se edita desde Configuracion (antes no habia pantalla).
INSERT INTO configuracion (clave, valor) VALUES
  ('pausa_min_segundos',          '45'),
  ('pausa_max_segundos',          '150'),
  ('tamano_lote',                 '25'),
  ('pausa_entre_lotes_minutos',   '20'),
  ('max_mensajes_por_ejecucion',  '200'),
  ('horario_inicio',              '"09:00"'),
  ('horario_fin',                 '"19:00"')
ON CONFLICT (clave) DO NOTHING;
