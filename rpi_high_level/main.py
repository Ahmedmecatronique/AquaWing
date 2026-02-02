#!/usr/bin/env python3
"""
RPi High-Level Drone Control System - Main Entry Point

This module initializes and runs the FastAPI backend server.
The server hosts both the REST API and serves the static frontend dashboard.
Remote access is provided via Cloudflare Tunnel.

Usage:
    python main.py
    
The server will start on http://localhost:8000
"""

import sys
import os
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

import uvicorn
from backend.server import create_app


def main():
    """
    Main entry point: create and run the FastAPI application.
    
    TODO: Load configuration from config/system.yaml
    TODO: Set up logging to logs/
    """
    app = create_app()
    
    # Run the server
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )


if __name__ == "__main__":
    main()
