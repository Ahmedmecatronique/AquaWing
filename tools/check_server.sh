#!/bin/bash
# tools/check_server.sh
# 
# DEBUG KIT: Server and Network Verification Script
# 
# Checks:
# - Current working directory
# - Python path and version
# - Installed pip packages
# - Virtual environment status
# - Port 8000 listening status
# - Health endpoint (/health)
# - API status endpoint (/api/status)

set -e

echo "=========================================="
echo "Server Status Check"
echo "=========================================="
echo ""

# Current working directory
echo "1. Current Working Directory:"
echo "   $(pwd)"
echo ""

# Python path and version
echo "2. Python Environment:"
echo "   Python path: $(which python3 2>/dev/null || echo 'NOT FOUND')"
echo "   Python version: $(python3 --version 2>/dev/null || echo 'NOT FOUND')"
echo ""

# Check if virtual environment is active
echo "3. Virtual Environment:"
if [ -n "$VIRTUAL_ENV" ]; then
    echo "   ✓ Virtual environment is ACTIVE"
    echo "   Path: $VIRTUAL_ENV"
else
    echo "   ✗ Virtual environment is NOT active"
    echo "   Expected: .venv in project root"
    if [ -d ".venv" ]; then
        echo "   .venv directory exists - activate with: source .venv/bin/activate"
    else
        echo "   .venv directory NOT found"
    fi
fi
echo ""

# Installed pip packages
echo "4. Installed Packages (FastAPI, uvicorn):"
if command -v pip3 &> /dev/null; then
    echo "   FastAPI: $(pip3 show fastapi 2>/dev/null | grep Version | awk '{print $2}' || echo 'NOT INSTALLED')"
    echo "   uvicorn: $(pip3 show uvicorn 2>/dev/null | grep Version | awk '{print $2}' || echo 'NOT INSTALLED')"
else
    echo "   pip3 not found"
fi
echo ""

# Check if port 8000 is listening
echo "5. Port 8000 Status:"
if command -v ss &> /dev/null; then
    PORT_CHECK=$(ss -ltnp 2>/dev/null | grep ':8000' || echo "")
    if [ -n "$PORT_CHECK" ]; then
        echo "   ✓ Port 8000 is LISTENING"
        echo "   Details:"
        echo "$PORT_CHECK" | sed 's/^/   /'
    else
        echo "   ✗ Port 8000 is NOT listening"
        echo "   Server may not be running"
    fi
else
    echo "   (ss command not available, skipping port check)"
fi
echo ""

# Test /health endpoint
echo "6. Health Endpoint (/health):"
HEALTH_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" http://localhost:8000/health 2>/dev/null || echo "ERROR")
if echo "$HEALTH_RESPONSE" | grep -q "HTTP_CODE:200"; then
    echo "   ✓ Health endpoint responding"
    echo "   Response:"
    echo "$HEALTH_RESPONSE" | grep -v "HTTP_CODE" | sed 's/^/   /'
else
    echo "   ✗ Health endpoint NOT responding"
    echo "   Response: $HEALTH_RESPONSE"
fi
echo ""

# Test /api/status endpoint
echo "7. API Status Endpoint (/api/status):"
STATUS_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" http://localhost:8000/api/status 2>/dev/null || echo "ERROR")
if echo "$STATUS_RESPONSE" | grep -q "HTTP_CODE:200"; then
    echo "   ✓ API status endpoint responding"
    echo "   Response:"
    echo "$STATUS_RESPONSE" | grep -v "HTTP_CODE" | sed 's/^/   /'
else
    echo "   ✗ API status endpoint NOT responding"
    echo "   Response: $STATUS_RESPONSE"
fi
echo ""

echo "=========================================="
echo "Check Complete"
echo "=========================================="

