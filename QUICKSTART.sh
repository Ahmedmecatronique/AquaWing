#!/bin/bash
# Quick Start Script for RPi Drone Control System
# 
# This script sets up and runs the backend server locally for testing
# Usage: bash QUICKSTART.sh

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   RPi High-Level Drone Control - Quick Start              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check Python version
echo "🔍 Checking Python version..."
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "   Python $python_version found ✓"

# Check if venv exists, create if needed
echo ""
echo "📦 Setting up virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "   Virtual environment created ✓"
else
    echo "   Virtual environment already exists ✓"
fi

# Activate venv
echo ""
echo "🔌 Activating virtual environment..."
source venv/bin/activate
echo "   Virtual environment activated ✓"

# Install/upgrade pip
echo ""
echo "📚 Installing dependencies..."
pip install --upgrade pip > /dev/null 2>&1
pip install -r requirements.txt > /dev/null 2>&1
echo "   Dependencies installed ✓"

# Show summary
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    SETUP COMPLETE ✓                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Project Structure:"
echo "   Backend:   backend/server.py (FastAPI + static files)"
echo "   Frontend:  frontend/index.html (Login + Dashboard)"
echo "   Config:    config/system.yaml (System settings)"
echo ""
echo "📋 Available endpoints:"
echo "   http://localhost:8000           → Dashboard"
echo "   http://localhost:8000/health    → Health check"
echo "   http://localhost:8000/api/*     → REST API"
echo "   ws://localhost:8000/ws/*        → WebSocket"
echo ""
echo "🔐 Login Credentials (demo):"
echo "   Username: drone"
echo "   Password: password"
echo ""
echo "🚀 To start the server, run:"
echo "   python main.py"
echo ""
echo "📖 Documentation:"
echo "   - README.md                      → Project overview"
echo "   - PROJECT_SUMMARY.md             → Complete feature list"
echo "   - IMPLEMENTATION_CHECKLIST.md    → Development tasks"
echo "   - deploy/cloudflare/README_*.md  → Tunnel setup guide"
echo ""
echo "🌐 For remote access (Cloudflare Tunnel):"
echo "   bash deploy/cloudflare/install_cloudflared.sh"
echo "   See: deploy/cloudflare/README_CLOUDFLARE_TUNNEL.md"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
