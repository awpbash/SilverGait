#!/bin/bash
# ==============================================
# SilverPhysio - Development Runner Script
# Starts both backend (FastAPI) and frontend (Vite)
# ==============================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
VENV_DIR="$BACKEND_DIR/venv"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  SilverPhysio Development Server${NC}"
echo -e "${GREEN}========================================${NC}"

# Check for .env file
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${YELLOW}Warning: .env file not found!${NC}"
    echo -e "Creating from .env.example..."
    if [ -f "$PROJECT_ROOT/.env.example" ]; then
        cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
        echo -e "${YELLOW}Please edit .env with your actual API keys before running.${NC}"
        exit 1
    else
        echo -e "${RED}Error: .env.example not found!${NC}"
        exit 1
    fi
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "\n${GREEN}Checking prerequisites...${NC}"

if ! command_exists python3; then
    echo -e "${RED}Error: python3 not found. Please install Python 3.10+${NC}"
    exit 1
fi

if ! command_exists node; then
    echo -e "${RED}Error: node not found. Please install Node.js 18+${NC}"
    exit 1
fi

if ! command_exists npm; then
    echo -e "${RED}Error: npm not found. Please install npm${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites OK${NC}"

# Setup Python virtual environment
echo -e "\n${GREEN}Setting up Python environment...${NC}"
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

# Activate venv
source "$VENV_DIR/bin/activate"

# Install Python dependencies
echo "Installing Python dependencies..."
pip install --upgrade pip -q
pip install -r "$BACKEND_DIR/requirements.txt" -q
echo -e "${GREEN}✓ Python dependencies installed${NC}"

# Setup frontend
echo -e "\n${GREEN}Setting up frontend...${NC}"
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo "Installing npm dependencies..."
    cd "$FRONTEND_DIR"
    npm install
fi
echo -e "${GREEN}✓ Frontend dependencies installed${NC}"

# Copy .env to backend
cp "$PROJECT_ROOT/.env" "$BACKEND_DIR/.env"

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down servers...${NC}"
    kill $(jobs -p) 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start backend
echo -e "\n${GREEN}Starting backend server...${NC}"
cd "$BACKEND_DIR"
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo -e "Backend PID: $BACKEND_PID"

# Wait for backend to start
sleep 2

# Start frontend
echo -e "\n${GREEN}Starting frontend server...${NC}"
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!
echo -e "Frontend PID: $FRONTEND_PID"

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Servers Running:${NC}"
echo -e "${GREEN}  Backend:  http://localhost:8000${NC}"
echo -e "${GREEN}  API Docs: http://localhost:8000/api/docs${NC}"
echo -e "${GREEN}  Frontend: http://localhost:5173${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}\n"

# Wait for processes
wait
