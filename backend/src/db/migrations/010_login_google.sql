-- Registro abierto (nombre, apellido, correo, contraseña) y login con
-- Google como metodo adicional (seccion 8.5). El correo pasa a ser el
-- identificador de inicio de sesion para todas las cuentas — el
-- "usuario" (nombre de usuario) que tenia el admin original queda como
-- dato heredado, ya no se usa para entrar. Una cuenta creada solo por
-- Google no tiene contraseña hasta que la persona configure una.

ALTER TABLE usuarios ALTER COLUMN usuario DROP NOT NULL;
ALTER TABLE usuarios ALTER COLUMN contrasena_hash DROP NOT NULL;
ALTER TABLE usuarios ADD COLUMN nombre TEXT;
ALTER TABLE usuarios ADD COLUMN apellido TEXT;
ALTER TABLE usuarios ADD COLUMN email TEXT;
ALTER TABLE usuarios ADD COLUMN google_id TEXT;

CREATE UNIQUE INDEX usuarios_email_idx ON usuarios (LOWER(email));
CREATE UNIQUE INDEX usuarios_google_id_idx ON usuarios (google_id);
