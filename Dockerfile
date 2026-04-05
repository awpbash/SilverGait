FROM python:3.11-slim AS backend

WORKDIR /app

# Install Node.js 20 + pnpm
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    corepack enable && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Python deps
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Frontend build
COPY frontend/ frontend/
RUN cd frontend && pnpm install --frozen-lockfile && pnpm run build

# Copy backend + education docs
COPY backend/ backend/

# Port from Railway env
ENV PORT=8000
EXPOSE ${PORT}

CMD cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
