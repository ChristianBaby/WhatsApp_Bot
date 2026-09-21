# Bot de WhatsApp — Universoft Systems

Panel web para armar campañas de WhatsApp, enviarlas con medidas anti-bloqueo,
atender las respuestas y hacerles seguimiento como mini-CRM.

Especificación funcional completa: [`REQUISITOS.md`](./REQUISITOS.md).
Maquetación de referencia: [`docs/Main-html/`](./docs/Main-html/).

---

## Estado del desarrollo

| Fase | Alcance | Estado |
|---|---|---|
| 0 | Fundaciones (estructura, Docker, base de datos, panel navegable) | ✅ Completa |
| 1 | Conexión de WhatsApp multi-número (QR en vivo) | ✅ Completa |
| 2 | Leads: carga de CSV/Excel, limpieza y validación | ⬜ Pendiente |
| 3 | Motor de envío, anti-baneo y cola de publicaciones | ⬜ Pendiente |
| 4 | Respuestas, chat integrado y mini-CRM | ⬜ Pendiente |
| 5 | IA: clasificación de respuestas y auto-responder | ⬜ Pendiente |
| 6 | Reportes y exportación | ⬜ Pendiente |
| 7 | Configuración e integraciones externas | ⬜ Pendiente |
| 8 | Seguridad, despliegue en Coolify y producción | ⬜ Pendiente |

---

## Cómo levantarlo en desarrollo

**Requisitos:** Docker Desktop y Node.js 20+.

```bash
# 1. Configuración (solo la primera vez)
cp .env.example .env        # y completa los valores que falten

# 2. Base de datos
docker compose up -d postgres

# 3. Backend  (aplica migraciones solo)
cd backend && npm install && npm run dev

# 4. Panel    (en otra terminal)
cd frontend && npm install && npm run dev
```

- Panel: http://localhost:5173
- API: http://localhost:3000/api/health

> El PostgreSQL del proyecto usa el puerto **5433** en tu PC, porque el 5432 ya
> lo ocupa un PostgreSQL instalado en Windows. Dentro de Docker sigue siendo 5432.

### Levantar todo como en producción

```bash
docker compose up --build     # app + postgres, igual que en el VPS
```

---

## Estructura

```
.
├── backend/              API Express + motor de WhatsApp
│   └── src/
│       ├── config/       Variables de entorno validadas al arrancar
│       ├── db/           Pool, runner de migraciones y migraciones SQL
│       ├── lib/          Logger, errores, canal de eventos en vivo (SSE)
│       ├── middleware/   Manejo central de errores
│       ├── routes/       Endpoints HTTP
│       └── services/     Lógica de negocio
├── frontend/             Panel web (React + Vite)
│   └── src/
│       ├── components/   Componentes reutilizables
│       ├── layout/       Sidebar y armazón
│       ├── pages/        Las 7 secciones del panel
│       └── styles/       Design tokens extraídos de la maquetación
├── docs/                 Maquetación de referencia
├── docker-compose.yml    app + postgres
└── Dockerfile            Imagen de producción
```

---

## Convenciones

- **Idioma:** nombres de tablas, columnas, funciones y variables en español, sin
  tildes ni ñ (SQL y varias herramientas no las manejan bien en identificadores).
  Los textos que ve el usuario sí llevan tildes.
- **Estilos:** todo color, tamaño y radio sale de `frontend/src/styles/tokens.css`.
  Ningún componente escribe un valor a mano.
- **Migraciones:** numeradas y nunca se editan una vez aplicadas. Para cambiar el
  esquema se agrega un archivo nuevo.
- **Datos persistentes:** `auth_sessions/`, `uploads/` y el volumen de Postgres
  nunca se versionan — las sesiones de WhatsApp son credenciales.

---

## Advertencia

Este sistema usa Baileys, una librería **no oficial**. Incumple los Términos de
Servicio de WhatsApp y el número puede ser bloqueado sin apelación. Las medidas
anti-bloqueo reducen el riesgo, no lo eliminan. Ver sección 6 de `REQUISITOS.md`.
