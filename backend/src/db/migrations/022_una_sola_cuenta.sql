-- ============================================================
-- 022_una_sola_cuenta.sql
-- ============================================================
-- El sistema tiene una sola cuenta, la del administrador, y no tiene roles
-- (los permisos se agregaran cuando hagan falta). Se olvidan los accesos de
-- otras personas; los chats que tenian asignados quedan sin asignar (la llave
-- de conversaciones.asignado_a es ON DELETE SET NULL). Las notas internas
-- conservan su autor como texto.
-- ============================================================

DELETE FROM usuarios_panel WHERE lower(COALESCE(email, '')) <> 'christianfx08@gmail.com';

ALTER TABLE usuarios_panel DROP COLUMN IF EXISTS rol;
