# ============================================================
#  Imagen de produccion: API (Express). El panel ya no va aqui:
#  vive en el dashboard (frontend_universoft, /dashboard/admin/whatsapp)
#  y la API redirige las URLs viejas del panel hacia alla.
# ============================================================

# ---------- 1. Backend compilado ----------
FROM node:22-alpine AS backend

WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci --include=dev
COPY backend/ ./
RUN npm run build


# ---------- 2. Dependencias de produccion ----------
FROM node:22-alpine AS deps

WORKDIR /deps
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force


# ---------- 3. Imagen final ----------
FROM node:22-alpine AS runtime

# tini maneja bien las senales: sin el, un SIGTERM mataria el proceso de
# golpe y dejaria las sesiones de WhatsApp a medio cerrar.
# ffmpeg: convierte las notas de voz grabadas en el panel al Ogg/Opus que usa
# WhatsApp (ver services/conversaciones/notaVoz.ts).
RUN apk add --no-cache tini ffmpeg

ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps    /deps/node_modules          ./backend/node_modules
COPY --from=backend /build/backend/dist         ./backend/dist
COPY --from=backend /build/backend/package.json ./backend/package.json

# tsc no copia los .sql: el runner de migraciones los necesita junto al codigo.
COPY backend/src/db/migrations ./backend/dist/db/migrations

# Carpetas de datos persistentes (montadas como volumenes).
RUN mkdir -p /datos/auth_sessions /datos/uploads \
 && chown -R node:node /datos /app

USER node
WORKDIR /app/backend

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
