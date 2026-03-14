#!/bin/bash
# Render build script — installs backend + builds frontend
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

# 1. Python dependencies
echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r "$PROJECT_ROOT/backend/requirements.txt"

# 2. Frontend build
echo "Building frontend..."
cd "$PROJECT_ROOT/frontend"
npm install -g pnpm
pnpm install --frozen-lockfile
pnpm run build

echo "Build complete. frontend/dist ready."
