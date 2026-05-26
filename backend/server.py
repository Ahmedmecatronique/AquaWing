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
from fastapi.responses import FileResponse, RedirectResponse, Response
from pydantic import BaseModel

from backend import api, websocket, auth
from backend.src.streaming.rgb_camera_stream import _parse_resolution, get_rgb_streamer


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
    login_dir = Path(__file__).resolve().parent.parent / "frontend" / "login"
    electrical_wiring_dir = Path(__file__).resolve().parent.parent / "frontend" / "Electrical Wiring"
    missions_dir = Path(__file__).resolve().parent.parent / "frontend" / "Missions"
    _missions_nocache_headers = {"Cache-Control": "no-store, max-age=0, must-revalidate"}
    systems_dir = Path(__file__).resolve().parent.parent / "frontend" / "Systems"
    optical_dir = Path(__file__).resolve().parent.parent / "frontend" / "Optical"
    pid_settings_dir = Path(__file__).resolve().parent.parent / "frontend" / "PID Settings"
    heatmap_dir = Path(__file__).resolve().parent.parent / "frontend" / "Heatmap"
    settings_dir = Path(__file__).resolve().parent.parent / "frontend" / "Settings"
    dashboard_dir = Path(__file__).resolve().parent.parent / "frontend" / "Dashboard"

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
        rgb_cfg = get_rgb_streamer()
        print(
            f"📷 RGB camera: rpicam {rgb_cfg.width}×{rgb_cfg.height} "
            f"@ {rgb_cfg.fps}fps (on first /video request)"
        )
        try:
            from backend.src.ia_detection import get_rgb_detection_worker

            det = get_rgb_detection_worker()
            if det.enabled:
                det.start()
                print(f"🤖 RF-DETR detection: enabled (every {det.interval_s:.1f}s, class=person)")
            else:
                print("🤖 RF-DETR detection: disabled in config")
        except Exception as exc:
            print(f"🤖 RF-DETR detection: not started ({exc})")
        print("="*70 + "\n")
        
        # Demo telemetry loop is NOT started automatically.
        # It will be triggered by the frontend via WS command.

    @app.on_event("shutdown")
    async def shutdown_event():
        """Arrêter le flux caméra RGB et l'analyse IA."""
        try:
            from backend.src.ia_detection import get_rgb_detection_worker

            get_rgb_detection_worker().stop()
        except Exception:
            pass
        try:
            get_rgb_streamer().stop()
        except Exception:
            pass

    # ========================================================================
    # Authentication Routes
    # ========================================================================

    @app.get("/")
    async def root(session_id: str = Cookie(None)):
        """
        Root endpoint: redirect to /dashboard if authenticated, else /login.
        """
        if session_id and auth.validate_session(session_id):
            return RedirectResponse(url="/dashboard", status_code=302)
        return RedirectResponse(url="/login", status_code=302)

    @app.get("/login")
    async def login_page(session_id: str = Cookie(None)):
        """
        Serve login page if not already authenticated.
        """
        # If already logged in, redirect to map
        if session_id and auth.validate_session(session_id):
            return RedirectResponse(url="/dashboard", status_code=302)
        
        # Serve login.html
        login_path = login_dir / "login.html"
        if login_path.exists():
            return FileResponse(str(login_path))
        return {"error": "login.html not found"}

    @app.get("/login/login.css")
    async def login_css():
        """
        Serve login stylesheet from login folder.
        """
        css_path = login_dir / "login.css"
        if css_path.exists():
            return FileResponse(str(css_path), media_type="text/css")
        return {"error": "login.css not found"}

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

    @app.get("/dashboard")
    async def dashboard_page(session_id: str = Cookie(None)):
        """
        Serve dashboard page (protected: requires valid session).
        """
        # Check if user is authenticated
        if not session_id or not auth.validate_session(session_id):
            return RedirectResponse(url="/login", status_code=302)
        
        # Serve Dashboard.html
        dashboard_path = dashboard_dir / "Dashboard.html"
        if dashboard_path.exists():
            return FileResponse(str(dashboard_path))
        return {"error": "Dashboard.html not found"}

    @app.get("/dashboard.css")
    async def dashboard_css():
        """
        Serve dashboard stylesheet.
        """
        css_path = dashboard_dir / "Dashboard.css"
        if css_path.exists():
            return FileResponse(str(css_path), media_type="text/css")
        return {"error": "Dashboard.css not found"}

    @app.get("/dashboard-aquawing.css")
    async def dashboard_aquawing_css():
        path = dashboard_dir / "dashboard-aquawing.css"
        if path.exists():
            return FileResponse(str(path), media_type="text/css")
        return {"error": "dashboard-aquawing.css not found"}

    @app.get("/dashboard.js")
    async def dashboard_js():
        """
        Serve dashboard script.
        """
        js_path = dashboard_dir / "Dashboard.js"
        if js_path.exists():
            return FileResponse(str(js_path), media_type="application/javascript")
        return {"error": "Dashboard.js not found"}

    @app.get("/electrical-wiring")
    async def electrical_wiring_page(session_id: str = Cookie(None)):
        """
        Serve standalone electrical wiring page (protected).
        """
        if not session_id or not auth.validate_session(session_id):
            return RedirectResponse(url="/login", status_code=302)

        page_path = electrical_wiring_dir / "Electrical Wiring.html"
        if page_path.exists():
            return FileResponse(str(page_path), headers=_systems_nocache)
        return {"error": "Electrical Wiring.html not found"}

    @app.get("/electrical-wiring.css")
    async def electrical_wiring_css():
        """
        Serve standalone electrical wiring stylesheet.
        """
        css_path = electrical_wiring_dir / "Electrical Wiring.css"
        if css_path.exists():
            return FileResponse(str(css_path), media_type="text/css", headers=_systems_nocache)
        return {"error": "Electrical Wiring.css not found"}

    @app.get("/electrical-wiring.js")
    async def electrical_wiring_js():
        """
        Serve standalone electrical wiring script.
        """
        js_path = electrical_wiring_dir / "Electrical Wiring.js"
        if js_path.exists():
            return FileResponse(str(js_path), media_type="application/javascript", headers=_systems_nocache)
        return {"error": "Electrical Wiring.js not found"}

    @app.get("/missions-page")
    async def missions_page(session_id: str = Cookie(None)):
        """
        Serve standalone missions page (protected).
        """
        if not session_id or not auth.validate_session(session_id):
            return RedirectResponse(url="/login", status_code=302)

        page_path = missions_dir / "Missions.html"
        if page_path.exists():
            return FileResponse(str(page_path), headers=_missions_nocache_headers)
        return {"error": "Missions.html not found"}

    @app.get("/missions-page.css")
    async def missions_page_css():
        """
        Serve standalone missions stylesheet.
        """
        css_path = missions_dir / "Missions.css"
        if css_path.exists():
            return FileResponse(str(css_path), media_type="text/css", headers=_missions_nocache_headers)
        return {"error": "Missions.css not found"}

    @app.get("/missions-page.js")
    async def missions_page_js():
        """
        Serve standalone missions script.
        """
        js_path = missions_dir / "Missions.js"
        if js_path.exists():
            return FileResponse(str(js_path), media_type="application/javascript", headers=_missions_nocache_headers)
        return {"error": "Missions.js not found"}

    _systems_nocache = {"Cache-Control": "no-store, max-age=0, must-revalidate"}

    @app.get("/systems-page")
    async def systems_page(session_id: str = Cookie(None)):
        """
        Serve standalone systems page (protected).
        """
        if not session_id or not auth.validate_session(session_id):
            return RedirectResponse(url="/login", status_code=302)

        page_path = systems_dir / "Systems.html"
        if page_path.exists():
            return FileResponse(str(page_path), headers=_systems_nocache)
        return {"error": "Systems.html not found"}

    @app.get("/systems-page.css")
    async def systems_page_css():
        """
        Serve standalone systems stylesheet.
        """
        css_path = systems_dir / "Systems.css"
        if css_path.exists():
            return FileResponse(str(css_path), media_type="text/css", headers=_systems_nocache)
        return {"error": "Systems.css not found"}

    @app.get("/systems-page.js")
    async def systems_page_js():
        """
        Serve standalone systems script.
        """
        js_path = systems_dir / "Systems.js"
        if js_path.exists():
            return FileResponse(str(js_path), media_type="application/javascript", headers=_systems_nocache)
        return {"error": "Systems.js not found"}

    @app.get("/optical-page")
    async def optical_page(session_id: str = Cookie(None)):
        """
        Serve standalone optical page (protected).
        """
        if not session_id or not auth.validate_session(session_id):
            return RedirectResponse(url="/login", status_code=302)

        page_path = optical_dir / "Optical.html"
        if page_path.exists():
            return FileResponse(str(page_path), headers=_systems_nocache)
        return {"error": "Optical.html not found"}

    @app.get("/optical-page.css")
    async def optical_page_css():
        """
        Serve standalone optical stylesheet.
        """
        css_path = optical_dir / "Optical.css"
        if css_path.exists():
            return FileResponse(str(css_path), media_type="text/css", headers=_systems_nocache)
        return {"error": "Optical.css not found"}

    @app.get("/optical-page.js")
    async def optical_page_js():
        """
        Serve standalone optical script.
        """
        js_path = optical_dir / "Optical.js"
        if js_path.exists():
            return FileResponse(str(js_path), media_type="application/javascript", headers=_systems_nocache)
        return {"error": "Optical.js not found"}

    @app.get("/pid-page")
    async def pid_page(session_id: str = Cookie(None)):
        """
        Serve standalone PID settings page (protected).
        """
        if not session_id or not auth.validate_session(session_id):
            return RedirectResponse(url="/login", status_code=302)

        page_path = pid_settings_dir / "PID Settings.html"
        if page_path.exists():
            return FileResponse(str(page_path), headers=_systems_nocache)
        return {"error": "PID Settings.html not found"}

    @app.get("/pid-page.css")
    async def pid_page_css():
        """
        Serve standalone PID settings stylesheet.
        """
        css_path = pid_settings_dir / "PID Settings.css"
        if css_path.exists():
            return FileResponse(str(css_path), media_type="text/css", headers=_systems_nocache)
        return {"error": "PID Settings.css not found"}

    @app.get("/pid-page.js")
    async def pid_page_js():
        """
        Serve standalone PID settings script.
        """
        js_path = pid_settings_dir / "PID Settings.js"
        if js_path.exists():
            return FileResponse(str(js_path), media_type="application/javascript", headers=_systems_nocache)
        return {"error": "PID Settings.js not found"}

    @app.get("/heatmap-page")
    async def heatmap_page(session_id: str = Cookie(None)):
        """
        Serve standalone heatmap page (protected).
        """
        if not session_id or not auth.validate_session(session_id):
            return RedirectResponse(url="/login", status_code=302)

        page_path = heatmap_dir / "Heatmap.html"
        if page_path.exists():
            return FileResponse(str(page_path), headers=_systems_nocache)
        return {"error": "Heatmap.html not found"}

    @app.get("/heatmap-page.css")
    async def heatmap_page_css():
        """
        Serve standalone heatmap stylesheet.
        """
        css_path = heatmap_dir / "Heatmap.css"
        if css_path.exists():
            return FileResponse(str(css_path), media_type="text/css", headers=_systems_nocache)
        return {"error": "Heatmap.css not found"}

    @app.get("/heatmap-page.js")
    async def heatmap_page_js():
        """
        Serve standalone heatmap script.
        """
        js_path = heatmap_dir / "Heatmap.js"
        if js_path.exists():
            return FileResponse(str(js_path), media_type="application/javascript", headers=_systems_nocache)
        return {"error": "Heatmap.js not found"}

    @app.get("/settings-page")
    async def settings_page(session_id: str = Cookie(None)):
        """
        Serve standalone settings page (protected).
        """
        if not session_id or not auth.validate_session(session_id):
            return RedirectResponse(url="/login", status_code=302)

        page_path = settings_dir / "Settings.html"
        if page_path.exists():
            return FileResponse(str(page_path), headers=_systems_nocache)
        return {"error": "Settings.html not found"}

    @app.get("/settings-page.css")
    async def settings_page_css():
        """
        Serve standalone settings stylesheet.
        """
        css_path = settings_dir / "Settings.css"
        if css_path.exists():
            return FileResponse(str(css_path), media_type="text/css", headers=_systems_nocache)
        return {"error": "Settings.css not found"}

    @app.get("/settings-page.js")
    async def settings_page_js():
        """
        Serve standalone settings script.
        """
        js_path = settings_dir / "Settings.js"
        if js_path.exists():
            return FileResponse(str(js_path), media_type="application/javascript", headers=_systems_nocache)
        return {"error": "Settings.js not found"}

    # ========================================================================
    # RGB Camera (rpicam-vid → JPEG)
    # ========================================================================

    @app.get("/video")
    async def video_endpoint(res: str = "2304x1296"):
        """Dernière image JPEG de la caméra RGB (module Pi / rpicam)."""
        try:
            from backend.src.ia_detection import get_rgb_detection_worker

            worker = get_rgb_detection_worker()
            if worker.enabled and not worker._running:
                worker.start()
            width, height = _parse_resolution(res)
            jpeg = get_rgb_streamer().get_jpeg(width=width, height=height)
            return Response(
                content=jpeg,
                media_type="image/jpeg",
                headers={"Cache-Control": "no-store, max-age=0"},
            )
        except Exception as exc:
            svg = f"""<?xml version='1.0' encoding='UTF-8'?>
<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'>
    <rect width='100%' height='100%' fill='#111' />
    <text x='50%' y='45%' fill='#f55' font-family='monospace' font-size='16' text-anchor='middle'>RGB camera error</text>
    <text x='50%' y='60%' fill='#888' font-family='monospace' font-size='11' text-anchor='middle'>{str(exc)[:80]}</text>
</svg>"""
            return Response(content=svg, media_type="image/svg+xml")

    @app.get("/video/stats")
    async def video_stats_endpoint():
        """Stats du flux RGB (résolution, FPS, taille dernière frame)."""
        return get_rgb_streamer().get_stats()

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
            "dashboard": "/dashboard",
            "login": "/login"
        }

    return app


# ✅ IMPORTANT: this is what uvicorn expects
app = create_app()


# Development runner (optional)
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.server:app", host="0.0.0.0", port=8000, reload=True)
