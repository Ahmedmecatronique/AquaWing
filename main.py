#!/usr/bin/env python3
"""
AquaWing - Drone Control System - Main Entry Point
"""
import sys
import os
from pathlib import Path

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

import uvicorn
from backend.server import create_app


def main():
    app = create_app()
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")


if __name__ == "__main__":
    main()
