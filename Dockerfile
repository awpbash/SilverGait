FROM python:3.11-slim

WORKDIR /app

# Install Node.js 20 + pnpm
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    corepack enable && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Python deps (cached layer — only rebuilds when requirements.txt changes)
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Frontend build (separate layer for caching)
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/
RUN cd frontend && pnpm install --frozen-lockfile

COPY frontend/ frontend/
RUN cd frontend && pnpm run build && rm -rf node_modules .corepack

# Copy backend + education docs
COPY backend/ backend/

# Port from Railway env
ENV PORT=8000
EXPOSE ${PORT}

WORKDIR /app/backend
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
