# Multi-stage build para el proyecto Silos
FROM node:20-alpine AS frontend-builder

# Build del frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage final - Backend
FROM node:20-alpine

# Instalar dependencias del sistema para SQLite
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copiar y instalar dependencias del backend
COPY backend/package*.json ./
RUN npm ci

# Copiar código del backend
COPY backend/src ./src
COPY backend/tsconfig.json ./

# Compilar TypeScript
RUN npx tsc

# Copiar build del frontend al backend
COPY --from=frontend-builder /app/frontend/dist ./public

# Crear directorio para la base de datos SQLite
RUN mkdir -p /app/data

# Variables de entorno
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/database.sqlite

# Exponer puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Comando de inicio
CMD ["node", "dist/index.js"]
