"""
Backend Server - FastAPI Application Factory with Authentication

This module creates and configures the FastAPI application with:
- Static file serving
- Login/Logout authentication
- Session-based access control
- Protected WebSocket
- REST API routing
- Health endpoints
"""

import asyncio
import json
import math
import time
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, HTTPException, Cookie, Response, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel

from backend import api, websocket, auth


# ============================================================================
# Pydantic Models for Auth
# ============================================================================

class LoginRequest(BaseModel):
    """Login request with username and password."""
    username: str
    password: str


# ============================================================================
# Demo Data - SIMULATED TELEMETRY
# ============================================================================

demo_counter = 0


async def demo_telemetry_loop(manager):
    """
    Background task: Simulate drone telemetry every 0.5 seconds.
    This sends demo data from Tunis area.
    """
    global demo_counter
    
    print("🚁 Demo telemetry loop started (Tunis data)")
    
    # Starting position: Tunis, Tunisia
    base_lat = 36.8065
    base_lon = 10.1815
    
    while True:
        demo_counter += 1
        
        # Simulate a circular flight path
        angle = (demo_counter * 2.0) % 360  # Degrees
        radius = 0.001 * (demo_counter % 100)  # km radius
        
        # Calculate new position
        lat = base_lat + radius * math.cos(math.radians(angle))
        lon = base_lon + radius * math.sin(math.radians(angle))
        
        # Create telemetry message
        telemetry = {
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "alt": round(10.0 + (demo_counter % 50) * 0.5, 1),
            "heading": round(angle, 1),
            "speed": round(2.5 + (demo_counter % 10) * 0.2, 2),
            "battery": round(85.0 - (demo_counter % 50) * 0.1, 1),
            "ts": int(time.time())
        }
        
        # Broadcast to all connected WebSocket clients
        await manager.broadcast(telemetry)
        
        # Send telemetry every 0.5 seconds
        await asyncio.sleep(0.5)


# ============================================================================
# Application Factory
# ============================================================================

def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application with authentication.

    Returns:
        FastAPI: Configured application instance
    """
    app = FastAPI(
        title="RPi Drone Control API",
        description="Backend API for Raspberry Pi drone control system with authentication",
        version="0.2.0",
    )

    # Include routers
    app.include_router(api.router, prefix="/api", tags=["API"])
    app.include_router(websocket.router, tags=["WebSocket"])

    # Frontend directory
    frontend_dir = Path(__file__).resolve().parent.parent / "frontend" / "static"

    # Serve static files (CSS/JS/images) under /static/
    if frontend_dir.exists():
        app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")

    # ========================================================================
    # Startup & Shutdown
    # ========================================================================

    @app.on_event("startup")
    async def startup_event():
        """Server startup — telemetry loop is NOT auto-started."""
        print("\n" + "="*70)
        print("🚀 RPi Drone Control Backend Starting")
        print("="*70)
        print(f"📍 Frontend: {frontend_dir}")
        print(f"🔐 Auth enabled: Yes")
        print(f"📡 WebSocket protected: Yes")
        print(f"✈️  Telemetry: waiting for START FLIGHT command")
        print("="*70 + "\n")
        
        # Demo telemetry loop is NOT started automatically.
        # It will be triggered by the frontend via WS command.

    # ========================================================================
    # Authentication Routes
    # ========================================================================

    @app.get("/")
    async def root(session_id: str = Cookie(None)):
        """
        Root endpoint: redirect to /map if authenticated, else /login.
        """
        if session_id and auth.validate_session(session_id):
            return RedirectResponse(url="/map", status_code=302)
        return RedirectResponse(url="/login", status_code=302)

    @app.get("/login")
    async def login_page(session_id: str = Cookie(None)):
        """
        Serve login page if not already authenticated.
        """
        # If already logged in, redirect to map
        if session_id and auth.validate_session(session_id):
            return RedirectResponse(url="/map", status_code=302)
        
        # Serve login.html
        login_path = frontend_dir / "login.html"
        if login_path.exists():
            return FileResponse(str(login_path))
        return {"error": "login.html not found"}

    @app.post("/login")
    async def login_post(request: LoginRequest, response: Response):
        """
        Handle login: verify credentials and set session cookie.
        """
        username = request.username.strip()
        password = request.password.strip()
        
        # Validate input
        if not username or not password:
            raise HTTPException(status_code=400, detail="Missing username or password")
        
        # Authenticate user
        if not auth.authenticate_user(username, password):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Create session
        session_id = auth.create_session(username)
        
        # Set session cookie
        auth.set_session_cookie(response, session_id)
        
        return {"success": True, "message": "Login successful"}

    @app.get("/logout")
    async def logout(response: Response, session_id: str = Cookie(None)):
        """
        Handle logout: destroy session and clear cookie.
        """
        if session_id:
            auth.destroy_session(session_id)
        
        # Delete cookie
        auth.delete_session_cookie(response)
        
        # Redirect to login
        return RedirectResponse(url="/login", status_code=302)

    @app.get("/map")
    async def map_page(session_id: str = Cookie(None)):
        """
        Serve map page (protected: requires valid session).
        """
        # Check if user is authenticated
        if not session_id or not auth.validate_session(session_id):
            return RedirectResponse(url="/login", status_code=302)
        
        # Serve map.html
        map_path = frontend_dir / "map.html"
        if map_path.exists():
            return FileResponse(str(map_path))
        return {"error": "map.html not found"}

    # ========================================================================
    # Health & Info Endpoints
    # ========================================================================

    @app.get("/health")
    async def health_check():
        """
        Health check endpoint (no authentication required).
        """
        return {
            "ok": True,
            "version": "0.2.0",
            "service": "RPi Drone Control API",
            "ws": "/ws",
            "map": "/map",
            "login": "/login"
        }

    return app


# ✅ IMPORTANT: this is what uvicorn expects
app = create_app()


# Development runner (optional)
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.server:app", host="0.0.0.0", port=8000, reload=True)
