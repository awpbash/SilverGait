#!/bin/bash
# ==============================================
# Share SilverPhysio publicly via localtunnel
# Alternative to ngrok - no signup required!
# ==============================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if localtunnel is installed
if ! command -v lt &> /dev/null; then
    echo -e "${YELLOW}Installing localtunnel...${NC}"
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}Error: npm not found. Please install Node.js first.${NC}"
        exit 1
    fi
    npm install -g localtunnel
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  SilverPhysio - Public Share${NC}"
echo -e "${GREEN}  (Using LocalTunnel)${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Make sure the app is running first:${NC}"
echo "  ./run.sh"
echo ""
echo -e "${GREEN}Creating public link...${NC}"
echo -e "${YELLOW}Note: First access may show a warning page - click Continue${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop sharing${NC}"
echo ""

# Start localtunnel
lt --port 5173
