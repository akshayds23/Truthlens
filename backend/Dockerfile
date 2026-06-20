# TruthLens Backend - Consolidated (Express API + FastAPI AI)

FROM node:20-slim AS node-builder

WORKDIR /app

# Install all dependencies to allow building TS
COPY package.json package-lock.json ./
RUN npm ci

# Copy and build TypeScript API
COPY api ./api
COPY api-tsconfig.json ./
RUN npm run build
# Prune dev dependencies after build
RUN npm prune --production

# Python runtime stage
FROM python:3.11-slim

WORKDIR /app

# Install only essential system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
  curl \
  libpq-dev \
  nodejs \
  && rm -rf /var/lib/apt/lists/*

# Copy Node.js app and built code
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/package.json ./package.json
COPY --from=node-builder /app/dist ./dist

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy FastAPI AI code
COPY ai ./ai

# Expose ports
EXPOSE 5000 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
   CMD curl -f http://localhost:5000/health || exit 1

# Startup: Express API Gateway + FastAPI AI Service
CMD ["sh", "-c", "node dist/server.js & uvicorn ai.main:app --host 0.0.0.0 --port 8000 & wait"]
