-- ============================================================
-- 006_auto_respuestas — Secciones 3.9 (IA), 3.10 (auto-responder)
-- ============================================================

-- Interruptor por numero (ademas del global en "configuracion"): seccion
-- 3.10 permite desactivar el auto-responder en un numero puntual sin
-- tocar la configuracion general.
ALTER TABLE numeros_whatsapp ADD COLUMN auto_respuestas_activo BOOLEAN NOT NULL DEFAULT true;


ALTER TABLE conversaciones
  -- bot: el auto-responder puede contestar aqui. manual: el usuario esta
  -- al mando (por su propia decision o por un escalamiento) y el bot no
  -- se mete, para que nunca se pisen (seccion 3.10).
  ADD COLUMN modo TEXT NOT NULL DEFAULT 'bot' CHECK (modo IN ('bot', 'manual')),
  -- Por que paso a manual solo (si fue automatico): palabra clave o baja
  -- confianza de la IA. NULL si el usuario lo tomo el mismo a proposito.
  ADD COLUMN escalado_motivo TEXT CHECK (escalado_motivo IN ('palabra_clave', 'baja_confianza')),
  -- Ultima sugerencia de la IA sobre la etapa del lead (interesado /
  -- no_interesado / duda_precio). Es solo una sugerencia: nunca se aplica
  -- a leads.etapa_pipeline sin que el usuario la confirme o corrija.
  ADD COLUMN ia_sugerencia TEXT,
  ADD COLUMN ia_sugerencia_en TIMESTAMPTZ,
  -- Para saber si ya se le mando el mensaje de bienvenida (no se puede
  -- inferir del conteo de mensajes: una campana puede haber mandado el
  -- primer mensaje de la conversacion antes de que el lead responda).
  ADD COLUMN bienvenida_enviada_en TIMESTAMPTZ;
