#!/bin/bash
# ==============================================
# Share SilverPhysio publicly via localtunnel
# No signup required!
# ==============================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if localtunnel is installed
if ! command -v lt &> /dev/null; then
    echo -e "${YELLOW}Installing localtunnel...${NC}"
    npm install -g localtunnel
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  SilverPhysio - Public Share${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Make sure the app is running first:${NC}"
echo "  ./run.sh"
echo ""
echo -e "${GREEN}Creating public link...${NC}"
echo ""

# Start localtunnel with a custom subdomain
lt --port 5173 --subdomain silverphysio-demo
