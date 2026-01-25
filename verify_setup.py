#!/usr/bin/env python3
"""
Configuration Verification Script
Verifies that all necessary files and dependencies are in place.
"""

import os
import sys
from pathlib import Path

# Colors
RED = '\033[91m'
GREEN = '\033[92m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def print_header(text):
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}{text:^60}{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")

def check_file(path, description=""):
    """Check if a file exists."""
    exists = os.path.exists(path)
    status = f"{GREEN}✓{RESET}" if exists else f"{RED}✗{RESET}"
    desc = f" ({description})" if description else ""
    print(f"  {status} {path}{desc}")
    return exists

def check_directory(path, description=""):
    """Check if a directory exists."""
    exists = os.path.isdir(path)
    status = f"{GREEN}✓{RESET}" if exists else f"{RED}✗{RESET}"
    desc = f" ({description})" if description else ""
    print(f"  {status} {path}/{desc}")
    return exists

def check_import(module_name):
    """Check if a Python module can be imported."""
    try:
        __import__(module_name)
        print(f"  {GREEN}✓{RESET} {module_name}")
        return True
    except ImportError:
        print(f"  {RED}✗{RESET} {module_name} (not installed)")
        return False

def main():
    print_header("🚁 RPi Drone Control - Configuration Verification")
    
    base_path = Path(__file__).parent
    all_ok = True
    
    # ====================================================================
    # Backend Files
    # ====================================================================
    
    print(f"{BLUE}Backend Files:{RESET}")
    backend_files = [
        ("backend/server.py", "FastAPI app + auth routes"),
        ("backend/auth.py", "Session management"),
        ("backend/websocket.py", "Protected WebSocket"),
        ("backend/api.py", "REST API"),
        ("backend/__init__.py", "Package init"),
        ("main.py", "Entry point"),
    ]
    
    for file_path, desc in backend_files:
        full_path = base_path / file_path
        if not check_file(full_path, desc):
            all_ok = False
    
    # ====================================================================
    # Frontend Files
    # ====================================================================
    
    print(f"\n{BLUE}Frontend Files:{RESET}")
    frontend_files = [
        ("frontend/login.html", "Login page"),
        ("frontend/map.html", "Map page"),
        ("frontend/map.js", "Map controller"),
        ("frontend/map.css", "Map styling"),
    ]
    
    for file_path, desc in frontend_files:
        full_path = base_path / file_path
        if not check_file(full_path, desc):
            all_ok = False
    
    # ====================================================================
    # Directories
    # ====================================================================
    
    print(f"\n{BLUE}Directories:{RESET}")
    directories = [
        ("backend", "Backend module"),
        ("frontend", "Frontend assets"),
        ("logs", "Log files"),
        ("config", "Configuration"),
    ]
    
    for dir_path, desc in directories:
        full_path = base_path / dir_path
        if not check_directory(full_path, desc):
            all_ok = False
    
    # ====================================================================
    # Python Dependencies
    # ====================================================================
    
    print(f"\n{BLUE}Python Dependencies:{RESET}")
    dependencies = [
        "fastapi",
        "uvicorn",
        "pydantic",
        "starlette",
    ]
    
    for dep in dependencies:
        if not check_import(dep):
            all_ok = False
    
    # ====================================================================
    # File Content Verification
    # ====================================================================
    
    print(f"\n{BLUE}Content Verification:{RESET}")
    
    # Check if server.py has authentication routes
    server_path = base_path / "backend/server.py"
    if server_path.exists():
        content = server_path.read_text()
        checks = [
            ("POST /login route", "/login" in content and "POST" in content),
            ("Session management", "auth.create_session" in content),
            ("Protected /map route", "@app.get(\"/map\")" in content),
            ("Demo telemetry loop", "demo_telemetry_loop" in content),
            ("WebSocket manager import", "from backend import" in content),
        ]
        
        for check_name, result in checks:
            status = f"{GREEN}✓{RESET}" if result else f"{RED}✗{RESET}"
            print(f"  {status} {check_name}")
            if not result:
                all_ok = False
    
    # Check if map.js has WebSocket protection
    map_js_path = base_path / "frontend/map.js"
    if map_js_path.exists():
        content = map_js_path.read_text()
        checks = [
            ("WS auto-protocol detection", "location.protocol" in content),
            ("Auto-reconnection", "setTimeout(connectWebSocket" in content),
            ("HUD updates", "updateHUD" in content),
            ("Map initialization", "L.map" in content),
        ]
        
        for check_name, result in checks:
            status = f"{GREEN}✓{RESET}" if result else f"{RED}✗{RESET}"
            print(f"  {status} {check_name}")
            if not result:
                all_ok = False
    
    # Check if auth.py has session validation
    auth_path = base_path / "backend/auth.py"
    if auth_path.exists():
        content = auth_path.read_text()
        checks = [
            ("authenticate_user function", "def authenticate_user" in content),
            ("validate_session function", "def validate_session" in content),
            ("create_session function", "def create_session" in content),
            ("Session storage", "ACTIVE_SESSIONS" in content),
        ]
        
        for check_name, result in checks:
            status = f"{GREEN}✓{RESET}" if result else f"{RED}✗{RESET}"
            print(f"  {status} {check_name}")
            if not result:
                all_ok = False
    
    # ====================================================================
    # Summary
    # ====================================================================
    
    print()
    if all_ok:
        print(f"{GREEN}{'='*60}{RESET}")
        print(f"{GREEN}✓ ALL CHECKS PASSED - System is ready!{RESET}")
        print(f"{GREEN}{'='*60}{RESET}")
        print(f"\n{YELLOW}Next steps:{RESET}")
        print(f"  1. Activate venv: source .venv/bin/activate")
        print(f"  2. Run server: python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000")
        print(f"  3. Visit: http://172.20.10.5:8000/login")
        print(f"  4. Login: admin / admin123\n")
        return 0
    else:
        print(f"{RED}{'='*60}{RESET}")
        print(f"{RED}✗ SOME CHECKS FAILED - See errors above{RESET}")
        print(f"{RED}{'='*60}{RESET}\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())
