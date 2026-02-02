#!/bin/bash
# ============================================================================
# 🚁 RPi Drone Control - Complete Start Script
# ============================================================================
# 
# Usage:
#   bash launch_server.sh
#
# This script will:
# 1. Navigate to the project directory
# 2. Activate the virtual environment
# 3. Start the backend server with Uvicorn
#
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}🚁 RPi Drone Control Backend${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Navigate to project directory
PROJECT_DIR="/home/ahmed/drone/rpi_high_level"
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}❌ Project directory not found: $PROJECT_DIR${NC}"
    exit 1
fi

cd "$PROJECT_DIR"
echo -e "${GREEN}✓ Working directory: $(pwd)${NC}\n"

# Check if venv exists
VENV_PATH="/home/ahmed/drone/rpi_high_level/.venv"
if [ ! -d "$VENV_PATH" ]; then
    echo -e "${RED}❌ Virtual environment not found at: $VENV_PATH${NC}"
    echo -e "${YELLOW}Please create it first:${NC}"
    echo -e "  python3 -m venv /home/ahmed/drone/rpi_high_level/.venv"
    echo -e "  source /home/ahmed/drone/rpi_high_level/.venv/bin/activate"
    echo -e "  pip install -r requirements.txt"
    exit 1
fi

# Activate virtual environment
echo -e "${YELLOW}Activating virtual environment...${NC}"
source "$VENV_PATH/bin/activate"
echo -e "${GREEN}✓ Virtual environment activated${NC}\n"

# Display environment info
echo -e "${BLUE}Environment:${NC}"
echo "  Python: $(python --version)"
echo "  Pip:    $(pip --version | cut -d' ' -f2)"
echo "  FastAPI: $(pip show fastapi | grep Version | cut -d' ' -f2)"
echo ""

# Start the server
echo -e "${YELLOW}Starting backend server...${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "🌐 Frontend:  http://172.20.10.5:8000"
echo "🌐 Frontend:  http://localhost:8000"
echo "📍 Login:     http://172.20.10.5:8000/login"
echo "🗺️  Map:       http://172.20.10.5:8000/map"
echo "💚 WebSocket: ws://172.20.10.5:8000/ws"
echo "❤️  Health:    http://172.20.10.5:8000/health"
echo ""
echo "📝 Demo Credentials:"
echo "   Username: admin"
echo "   Password: admin123"
echo ""
echo -e "${BLUE}========================================${NC}\n"

# Run the server
python -m uvicorn backend.server:app \
    --host 0.0.0.0 \
    --port 8000 \
    --reload

deactivate
