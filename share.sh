#!/bin/bash
# ==============================================
# Share SilverPhysio publicly via ngrok
# Requires ngrok installed and configured
# ==============================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo -e "${RED}Error: ngrok not found${NC}"
    echo -e "${YELLOW}Install ngrok:${NC}"
    echo "  1. Download from: https://ngrok.com/download"
    echo "  2. Or use snap: sudo snap install ngrok"
    echo "  3. Or use apt: curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null && echo \"deb https://ngrok-agent.s3.amazonaws.com buster main\" | sudo tee /etc/apt/sources.list.d/ngrok.list && sudo apt update && sudo apt install ngrok"
    echo ""
    echo -e "${YELLOW}After installation, configure with your authtoken:${NC}"
    echo "  ngrok config add-authtoken <your-token>"
    echo "  Get your token from: https://dashboard.ngrok.com/get-started/your-authtoken"
    exit 1
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  SilverPhysio - Public Share${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Make sure the app is running first:${NC}"
echo "  ./run.sh"
echo ""
echo -e "${GREEN}Creating public link with ngrok...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop sharing${NC}"
echo ""

# Start ngrok
ngrok http 5173
