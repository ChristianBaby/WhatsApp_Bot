# ============================================================
#  Imagen de produccion: panel (Vite) + API (Express) en un
#  solo contenedor, como espera Coolify.
# ============================================================

# ---------- 1. Panel web ----------
FROM node:22-alpine AS panel

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build


# ---------- 2. Backend compilado ----------
FROM node:22-alpine AS backend

WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build


# ---------- 3. Dependencias de produccion ----------
FROM node:22-alpine AS deps

WORKDIR /deps
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force


# ---------- 4. Imagen final ----------
FROM node:22-alpine AS runtime

# tini maneja bien las senales: sin el, un SIGTERM mataria el proceso de
# golpe y dejaria las sesiones de WhatsApp a medio cerrar.
RUN apk add --no-cache tini

ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps    /deps/node_modules          ./backend/node_modules
COPY --from=backend /build/backend/dist         ./backend/dist
COPY --from=backend /build/backend/package.json ./backend/package.json
COPY --from=panel   /build/frontend/dist        ./frontend/dist

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
