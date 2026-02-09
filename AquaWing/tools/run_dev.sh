#!/bin/bash
# tools/run_dev.sh
# 
# Development Server Runner
# 
# Activates virtual environment and runs uvicorn with:
# - host: 0.0.0.0 (accessible from network)
# - port: 8000
# - reload: enabled (auto-reload on code changes)

set -e

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=========================================="
echo "Starting Development Server"
echo "=========================================="
echo "Project root: $PROJECT_ROOT"
echo ""

# Change to project root
cd "$PROJECT_ROOT"

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "ERROR: .venv directory not found!"
    echo "Create virtual environment with:"
    echo "  python3 -m venv .venv"
    exit 1
fi

# Activate virtual environment
echo "Activating virtual environment..."
source .venv/bin/activate

# Check if required packages are installed
if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "ERROR: FastAPI not installed!"
    echo "Install dependencies with:"
    echo "  pip install -r requirements.txt"
    exit 1
fi

if ! python3 -c "import uvicorn" 2>/dev/null; then
    echo "ERROR: uvicorn not installed!"
    echo "Install dependencies with:"
    echo "  pip install -r requirements.txt"
    exit 1
fi

echo ""
echo "Starting uvicorn server..."
echo "Access at: http://localhost:8000 or http://<PI_IP>:8000"
echo "Press Ctrl+C to stop"
echo ""

# Run uvicorn
python3 -m uvicorn backend.server:app --host 0.0.0.0 --port 8000 --reload

