#!/bin/bash
# ==============================================
# Share SilverGait publicly via localtunnel
# No signup required!
# ==============================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
export COREPACK_HOME="$PROJECT_ROOT/.corepack"
mkdir -p "$COREPACK_HOME"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

if command_exists pnpm; then
    PNPM_CMD=(pnpm)
elif command_exists corepack; then
    PNPM_CMD=(corepack pnpm)
else
    echo -e "${RED}Error: pnpm not found. Install pnpm or use Node.js with corepack enabled.${NC}"
    exit 1
fi

pnpm_exec() {
    "${PNPM_CMD[@]}" "$@"
}

if ! pnpm_exec --version >/dev/null 2>&1; then
    echo -e "${RED}Error: pnpm is unavailable. Run 'corepack enable' and try again.${NC}"
    exit 1
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  SilverGait - Public Share${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Make sure the app is running first:${NC}"
echo "  ./run.sh"
echo ""
echo -e "${GREEN}Creating public link...${NC}"
echo ""

# Start localtunnel with a custom subdomain
pnpm_exec dlx localtunnel --port 5173 --subdomain SilverGait-demo
