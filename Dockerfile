# ── Stage 1: Build frontend ──
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY frontend/ frontend/
COPY vite.config.ts tsconfig.json ./
RUN npm run build

# ── Stage 2: Runtime ──
FROM python:3.12-slim
WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install Python dependencies
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --no-dev --no-install-project

# Copy backend code
COPY backend/src/ src/
COPY backend/run/conf/ run/conf/

# Copy frontend build output
COPY --from=frontend-build /app/dist/ static/

# Create data directory
RUN mkdir -p /data

ENV NEXUS_ENV=production
ENV NEXUS_DB_PATH=/data/nexus.db
EXPOSE 8000

CMD ["uv", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
