from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Cookie, HTTPException, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse, Response, JSONResponse
from pathlib import Path
import os
import sys

# Project root + backend/ + backend/src on sys.path (ia_prediction lives under backend/src/)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_backend_dir = os.path.dirname(os.path.abspath(__file__))
_src_dir = os.path.join(_backend_dir, "src")
for _p in (_backend_dir, _src_dir):
    if _p not in sys.path:
        sys.path.insert(0, _p)
# Note: FastAPI Form parsing requires python-multipart
# Install with: pip install python-multipart
import json
import bcrypt as _bcrypt
import asyncio
import time
import secrets
import math
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel
from backend.src.streaming.vedio_heatmap_stream import HeatmapStreamer

try:
    from config.cablage import GPS, FLIGHT_CONTROLLER as _CABLAGE_FC
except Exception:
    _CABLAGE_FC = None
    GPS = None

# ============================================================================
# CONFIGURATION
# ============================================================================

SESSION_TIMEOUT = 86400  # 24 hours
SESSION_COOKIE_NAME = "sid"
BASE_LATITUDE = 36.8065  # Tunis
BASE_LONGITUDE = 10.1815
STATIC_DIR = Path(__file__).parent.parent / "frontend" / "static"
LOGIN_DIR = Path(__file__).parent.parent / "frontend" / "login"
ELECTRICAL_WIRING_DIR = Path(__file__).parent.parent / "frontend" / "Electrical Wiring"
MISSIONS_DIR = Path(__file__).parent.parent / "frontend" / "Missions"
SYSTEMS_DIR = Path(__file__).parent.parent / "frontend" / "Systems"
OPTICAL_DIR = Path(__file__).parent.parent / "frontend" / "Optical"
PID_SETTINGS_DIR = Path(__file__).parent.parent / "frontend" / "PID Settings"
HEATMAP_DIR = Path(__file__).parent.parent / "frontend" / "Heatmap"
SETTINGS_DIR = Path(__file__).parent.parent / "frontend" / "Settings"
DASHBOARD_DIR = Path(__file__).parent.parent / "frontend" / "Dashboard"

_MISSIONS_NO_CACHE_HEADERS = {"Cache-Control": "no-store, max-age=0, must-revalidate"}

# Development flag: when True, bypass auth for /dashboard to simplify local testing.
# IMPORTANT: set to False in production.
DEV_BYPASS_AUTH = False

# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class LoginRequest(BaseModel):
    username: str
    password: str

# ============================================================================
# SESSION & AUTH MANAGEMENT
# ============================================================================

ACTIVE_SESSIONS = {}
USERS_FILE = Path(__file__).parent.parent / "users.json"  # AquaWing/users.json
SESSIONS_FILE = Path(__file__).parent.parent / "sessions.json"

# Default demo users; persisted users.json will be used/merged
DEMO_USERS = {}  # passwords managed via users.json (bcrypt hashed)

USERS = {}

def load_users():
    global USERS
    try:
        if USERS_FILE.exists():
            with open(USERS_FILE, "r") as f:
                USERS = json.load(f)
        else:
            USERS = DEMO_USERS.copy()
            save_users()
    except Exception:
        USERS = DEMO_USERS.copy()

def save_users():
    try:
        with open(USERS_FILE, "w") as f:
            json.dump(USERS, f, indent=2)
    except Exception:
        pass

def create_session(username: str) -> str:
    """Create a new session for the user."""
    session_id = secrets.token_urlsafe(32)
    ACTIVE_SESSIONS[session_id] = {
        "username": username,
        "created_at": datetime.now(),
    }
    _save_sessions()
    return session_id

def validate_session(session_id: Optional[str]) -> Optional[str]:
    """Validate a session and return username if valid."""
    if not session_id or session_id not in ACTIVE_SESSIONS:
        return None
    
    session = ACTIVE_SESSIONS[session_id]
    age = datetime.now() - session["created_at"]
    
    if age.total_seconds() > SESSION_TIMEOUT:
        del ACTIVE_SESSIONS[session_id]
        _save_sessions()
        return None
    
    return session["username"]

def destroy_session(session_id: str):
    """Destroy a session."""
    if session_id in ACTIVE_SESSIONS:
        del ACTIVE_SESSIONS[session_id]
        _save_sessions()


def _load_sessions() -> None:
    """Load sessions from disk so restarts don't invalidate dashboard iframes."""
    global ACTIVE_SESSIONS
    try:
        if not SESSIONS_FILE.exists():
            return
        with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f) or {}
        restored = {}
        now = datetime.now()
        for sid, sess in (raw.items() if isinstance(raw, dict) else []):
            if not isinstance(sess, dict):
                continue
            username = sess.get("username")
            created_at = sess.get("created_at")
            if not username or not created_at:
                continue
            try:
                dt = datetime.fromisoformat(created_at)
            except Exception:
                continue
            if (now - dt).total_seconds() > SESSION_TIMEOUT:
                continue
            restored[str(sid)] = {"username": str(username), "created_at": dt}
        ACTIVE_SESSIONS = restored
    except Exception:
        # if sessions file is corrupted, ignore and start fresh
        ACTIVE_SESSIONS = {}


def _save_sessions() -> None:
    """Persist sessions to disk (best-effort)."""
    try:
        data = {sid: {"username": s["username"], "created_at": s["created_at"].isoformat()} for sid, s in ACTIVE_SESSIONS.items()}
        with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass

def authenticate_user(username: str, password: str) -> bool:
    """Authenticate a user with username/password (bcrypt)."""
    stored = USERS.get(username)
    if not stored:
        return False
    try:
        return _bcrypt.checkpw(password.encode(), stored.encode())
    except Exception:
        return False

# ============================================================================
# FASTAPI APPLICATION
# ============================================================================

app = FastAPI(title="RPi Drone Control", version="0.2.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include REST API router (/api/status, /api/telemetry, /api/pid, etc.)
from backend import api
app.include_router(api.router, prefix="/api", tags=["API"])

# Mount static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# ============================================================================
# HTTP ROUTES
# ============================================================================

@app.get("/")
def root(sid: str = Cookie(None)):
    """Root endpoint - redirect to dashboard or login."""
    if sid and validate_session(sid):
        return RedirectResponse(url="/dashboard", status_code=302)
    return RedirectResponse(url="/login", status_code=302)

@app.get("/login")
def login_page(sid: str = Cookie(None)):
    """Serve login page."""
    if sid and validate_session(sid):
        return RedirectResponse(url="/dashboard", status_code=302)
    
    login_path = LOGIN_DIR / "login.html"
    if login_path.exists():
        return FileResponse(str(login_path))
    return {"error": "login.html not found"}


@app.get("/login/login.css")
def login_css():
    """Serve login stylesheet from login folder."""
    css_path = LOGIN_DIR / "login.css"
    if css_path.exists():
        return FileResponse(str(css_path), media_type="text/css")
    return {"error": "login.css not found"}

@app.post("/login")
async def login_post(request: Request, username: str = Form(None), password: str = Form(None)):
    """Handle login POST from form submission or JSON payload. Redirects and sets cookie on success."""
    wants_json = "application/json" in (request.headers.get("content-type") or "").lower()

    # Accept form OR JSON body to avoid 422 from clients
    if not username or not password:
        try:
            data = await request.json()
            username = data.get("username")
            password = data.get("password")
            wants_json = True
        except Exception:
            if wants_json:
                return JSONResponse({"ok": False, "error": "missing_credentials"}, status_code=400)
            return RedirectResponse(url="/login?err=1", status_code=302)

    if not username or not password or not authenticate_user(username, password):
        if wants_json:
            return JSONResponse({"ok": False, "error": "invalid_credentials"}, status_code=401)
        return RedirectResponse(url="/login?err=1", status_code=302)

    session_id = create_session(username)
    if wants_json:
        resp = JSONResponse({"ok": True, "redirect": "/dashboard"})
    else:
        resp = RedirectResponse(url="/dashboard", status_code=302)
    resp.set_cookie(key=SESSION_COOKIE_NAME, value=session_id, httponly=True, max_age=SESSION_TIMEOUT, path="/")
    return resp


@app.post("/register")
async def register_post(request: Request, username: str = Form(None), password: str = Form(None)):
    """Create a new user (simple, persisted to users.json). Accepts form or JSON."""
    if not username or not password:
        try:
            data = await request.json()
            username = data.get('username')
            password = data.get('password')
        except Exception:
            return RedirectResponse(url="/login?err=1", status_code=302)

    if not username or not password:
        return RedirectResponse(url="/login?err=1", status_code=302)

    if username in USERS:
        return RedirectResponse(url="/login?err=1", status_code=302)

    USERS[username] = _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()
    save_users()
    return RedirectResponse(url="/login?registered=1", status_code=302)

@app.get("/logout")
def logout(sid: str = Cookie(None)):
    """Handle logout."""
    if sid:
        destroy_session(sid)
    resp = RedirectResponse(url="/login", status_code=302)
    resp.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return resp

@app.get("/dashboard")
def dashboard_page(request: Request, sid: str = Cookie(None), guest: Optional[str] = None):
    """Serve dashboard page (protected). Guest allowed via ?guest=1."""
    # Development bypass: serve dashboard without session check when flagged
    if DEV_BYPASS_AUTH:
        dashboard_path = DASHBOARD_DIR / "Dashboard.html"
        if dashboard_path.exists():
            return FileResponse(str(dashboard_path))
        return {"error": "Dashboard.html not found"}

    # Normal behavior: allow guest via ?guest=1, otherwise require valid session
    if guest == "1":
        pass
    else:
        if not sid or not validate_session(sid):
            return RedirectResponse(url="/login", status_code=302)

    dashboard_path = DASHBOARD_DIR / "Dashboard.html"
    if dashboard_path.exists():
        return FileResponse(str(dashboard_path))
    return {"error": "Dashboard.html not found"}


@app.get("/dashboard.css")
def dashboard_css():
    """Serve dashboard stylesheet."""
    css_path = DASHBOARD_DIR / "Dashboard.css"
    if css_path.exists():
        return FileResponse(str(css_path), media_type="text/css")
    return {"error": "Dashboard.css not found"}


@app.get("/dashboard-aquawing.css")
def dashboard_aquawing_css():
    """Contenu tableau de bord AquaWing (layout 3 colonnes), sans sidebar."""
    path = DASHBOARD_DIR / "dashboard-aquawing.css"
    if path.exists():
        return FileResponse(str(path), media_type="text/css")
    return {"error": "dashboard-aquawing.css not found"}


@app.get("/dashboard.js")
def dashboard_js():
    """Serve dashboard script."""
    js_path = DASHBOARD_DIR / "Dashboard.js"
    if js_path.exists():
        return FileResponse(str(js_path), media_type="application/javascript")
    return {"error": "Dashboard.js not found"}


@app.get("/electrical-wiring")
def electrical_wiring_page(sid: str = Cookie(None), guest: Optional[str] = None):
    """Serve standalone Electrical Wiring page."""
    if not DEV_BYPASS_AUTH and guest != "1":
        if not sid or not validate_session(sid):
            return RedirectResponse(url="/login", status_code=302)

    page_path = ELECTRICAL_WIRING_DIR / "Electrical Wiring.html"
    if page_path.exists():
        return FileResponse(str(page_path), headers=_ELECTRICAL_NO_CACHE_HEADERS)
    return {"error": "Electrical Wiring.html not found"}


@app.get("/electrical-wiring.css")
def electrical_wiring_css():
    """Serve standalone Electrical Wiring CSS."""
    css_path = ELECTRICAL_WIRING_DIR / "Electrical Wiring.css"
    if css_path.exists():
        return FileResponse(str(css_path), media_type="text/css", headers=_ELECTRICAL_NO_CACHE_HEADERS)
    return {"error": "Electrical Wiring.css not found"}


@app.get("/electrical-wiring.js")
def electrical_wiring_js():
    """Serve standalone Electrical Wiring JS."""
    js_path = ELECTRICAL_WIRING_DIR / "Electrical Wiring.js"
    if js_path.exists():
        return FileResponse(str(js_path), media_type="application/javascript", headers=_ELECTRICAL_NO_CACHE_HEADERS)
    return {"error": "Electrical Wiring.js not found"}


@app.get("/missions-page")
def missions_page(sid: str = Cookie(None), guest: Optional[str] = None):
    """Serve standalone Missions page."""
    if not DEV_BYPASS_AUTH and guest != "1":
        if not sid or not validate_session(sid):
            return RedirectResponse(url="/login", status_code=302)

    page_path = MISSIONS_DIR / "Missions.html"
    if page_path.exists():
        return FileResponse(str(page_path), headers=_MISSIONS_NO_CACHE_HEADERS)
    return {"error": "Missions.html not found"}


@app.get("/missions-page.css")
def missions_page_css():
    """Serve standalone Missions CSS."""
    css_path = MISSIONS_DIR / "Missions.css"
    if css_path.exists():
        return FileResponse(str(css_path), media_type="text/css", headers=_MISSIONS_NO_CACHE_HEADERS)
    return {"error": "Missions.css not found"}


@app.get("/missions-page.js")
def missions_page_js():
    """Serve standalone Missions JS."""
    js_path = MISSIONS_DIR / "Missions.js"
    if js_path.exists():
        return FileResponse(str(js_path), media_type="application/javascript", headers=_MISSIONS_NO_CACHE_HEADERS)
    return {"error": "Missions.js not found"}


_SYSTEMS_NO_CACHE_HEADERS = {"Cache-Control": "no-store, max-age=0, must-revalidate"}
_OPTICAL_NO_CACHE_HEADERS = {"Cache-Control": "no-store, max-age=0, must-revalidate"}
_PID_NO_CACHE_HEADERS = {"Cache-Control": "no-store, max-age=0, must-revalidate"}
_HEATMAP_NO_CACHE_HEADERS = {"Cache-Control": "no-store, max-age=0, must-revalidate"}
_SETTINGS_NO_CACHE_HEADERS = {"Cache-Control": "no-store, max-age=0, must-revalidate"}
_ELECTRICAL_NO_CACHE_HEADERS = {"Cache-Control": "no-store, max-age=0, must-revalidate"}


@app.get("/systems-page")
def systems_page(sid: str = Cookie(None), guest: Optional[str] = None):
    """Serve standalone Systems page."""
    if not DEV_BYPASS_AUTH and guest != "1":
        if not sid or not validate_session(sid):
            return RedirectResponse(url="/login", status_code=302)

    page_path = SYSTEMS_DIR / "Systems.html"
    if page_path.exists():
        return FileResponse(str(page_path), headers=_SYSTEMS_NO_CACHE_HEADERS)
    return {"error": "Systems.html not found"}


@app.get("/systems-page.css")
def systems_page_css():
    """Serve standalone Systems CSS."""
    css_path = SYSTEMS_DIR / "Systems.css"
    if css_path.exists():
        return FileResponse(str(css_path), media_type="text/css", headers=_SYSTEMS_NO_CACHE_HEADERS)
    return {"error": "Systems.css not found"}


@app.get("/systems-page.js")
def systems_page_js():
    """Serve standalone Systems JS."""
    js_path = SYSTEMS_DIR / "Systems.js"
    if js_path.exists():
        return FileResponse(str(js_path), media_type="application/javascript", headers=_SYSTEMS_NO_CACHE_HEADERS)
    return {"error": "Systems.js not found"}


@app.get("/optical-page")
def optical_page(sid: str = Cookie(None), guest: Optional[str] = None):
    """Serve standalone Optical page."""
    if not DEV_BYPASS_AUTH and guest != "1":
        if not sid or not validate_session(sid):
            return RedirectResponse(url="/login", status_code=302)

    page_path = OPTICAL_DIR / "Optical.html"
    if page_path.exists():
        return FileResponse(str(page_path), headers=_OPTICAL_NO_CACHE_HEADERS)
    return {"error": "Optical.html not found"}


@app.get("/optical-page.css")
def optical_page_css():
    """Serve standalone Optical CSS."""
    css_path = OPTICAL_DIR / "Optical.css"
    if css_path.exists():
        return FileResponse(str(css_path), media_type="text/css", headers=_OPTICAL_NO_CACHE_HEADERS)
    return {"error": "Optical.css not found"}


@app.get("/optical-page.js")
def optical_page_js():
    """Serve standalone Optical JS."""
    js_path = OPTICAL_DIR / "Optical.js"
    if js_path.exists():
        return FileResponse(str(js_path), media_type="application/javascript", headers=_OPTICAL_NO_CACHE_HEADERS)
    return {"error": "Optical.js not found"}


@app.get("/pid-page")
def pid_page(sid: str = Cookie(None), guest: Optional[str] = None):
    """Serve standalone PID Settings page."""
    if not DEV_BYPASS_AUTH and guest != "1":
        if not sid or not validate_session(sid):
            return RedirectResponse(url="/login", status_code=302)

    page_path = PID_SETTINGS_DIR / "PID Settings.html"
    if page_path.exists():
        return FileResponse(str(page_path), headers=_PID_NO_CACHE_HEADERS)
    return {"error": "PID Settings.html not found"}


@app.get("/pid-page.css")
def pid_page_css():
    """Serve standalone PID Settings CSS."""
    css_path = PID_SETTINGS_DIR / "PID Settings.css"
    if css_path.exists():
        return FileResponse(str(css_path), media_type="text/css", headers=_PID_NO_CACHE_HEADERS)
    return {"error": "PID Settings.css not found"}


@app.get("/pid-page.js")
def pid_page_js():
    """Serve standalone PID Settings JS."""
    js_path = PID_SETTINGS_DIR / "PID Settings.js"
    if js_path.exists():
        return FileResponse(str(js_path), media_type="application/javascript", headers=_PID_NO_CACHE_HEADERS)
    return {"error": "PID Settings.js not found"}


@app.get("/heatmap-page")
def heatmap_page(sid: str = Cookie(None), guest: Optional[str] = None):
    """Serve standalone Heatmap page."""
    if not DEV_BYPASS_AUTH and guest != "1":
        if not sid or not validate_session(sid):
            return RedirectResponse(url="/login", status_code=302)

    page_path = HEATMAP_DIR / "Heatmap.html"
    if page_path.exists():
        return FileResponse(str(page_path), headers=_HEATMAP_NO_CACHE_HEADERS)
    return {"error": "Heatmap.html not found"}


@app.get("/heatmap-page.css")
def heatmap_page_css():
    """Serve standalone Heatmap CSS."""
    css_path = HEATMAP_DIR / "Heatmap.css"
    if css_path.exists():
        return FileResponse(str(css_path), media_type="text/css", headers=_HEATMAP_NO_CACHE_HEADERS)
    return {"error": "Heatmap.css not found"}


@app.get("/heatmap-page.js")
def heatmap_page_js():
    """Serve standalone Heatmap JS."""
    js_path = HEATMAP_DIR / "Heatmap.js"
    if js_path.exists():
        return FileResponse(str(js_path), media_type="application/javascript", headers=_HEATMAP_NO_CACHE_HEADERS)
    return {"error": "Heatmap.js not found"}


@app.get("/settings-page")
def settings_page(sid: str = Cookie(None), guest: Optional[str] = None):
    """Serve standalone Settings page."""
    if not DEV_BYPASS_AUTH and guest != "1":
        if not sid or not validate_session(sid):
            return RedirectResponse(url="/login", status_code=302)

    page_path = SETTINGS_DIR / "Settings.html"
    if page_path.exists():
        return FileResponse(str(page_path), headers=_SETTINGS_NO_CACHE_HEADERS)
    return {"error": "Settings.html not found"}


@app.get("/settings-page.css")
def settings_page_css():
    """Serve standalone Settings CSS."""
    css_path = SETTINGS_DIR / "Settings.css"
    if css_path.exists():
        return FileResponse(str(css_path), media_type="text/css", headers=_SETTINGS_NO_CACHE_HEADERS)
    return {"error": "Settings.css not found"}


@app.get("/settings-page.js")
def settings_page_js():
    """Serve standalone Settings JS."""
    js_path = SETTINGS_DIR / "Settings.js"
    if js_path.exists():
        return FileResponse(str(js_path), media_type="application/javascript", headers=_SETTINGS_NO_CACHE_HEADERS)
    return {"error": "Settings.js not found"}


@app.get("/video")
def video_endpoint():
        """Dernière image JPEG (résolution/FPS = mode rpicam actuel sur le Pi)."""
        from backend.src.streaming.rgb_camera_stream import get_rgb_streamer
        try:
            jpeg = get_rgb_streamer().get_jpeg(wait_s=6.0)
            if not jpeg or not jpeg.startswith(b"\xff\xd8"):
                raise RuntimeError("invalid or empty JPEG from camera")
            return Response(
                content=jpeg,
                media_type="image/jpeg",
                headers={"Cache-Control": "no-store, max-age=0"},
            )
        except Exception as e:
            svg = f"""<?xml version='1.0' encoding='UTF-8'?>
<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'>
    <rect width='100%' height='100%' fill='#111' />
    <text x='50%' y='45%' fill='#f55' font-family='monospace' font-size='16' text-anchor='middle'>RGB camera error</text>
    <text x='50%' y='60%' fill='#888' font-family='monospace' font-size='11' text-anchor='middle'>{str(e)[:80]}</text>
</svg>"""
            return Response(content=svg, media_type="image/svg+xml")


@app.get("/video/stats")
def video_stats_endpoint():
    """Stats du flux RGB (résolution, FPS, taille dernière frame)."""
    from backend.src.streaming.rgb_camera_stream import get_rgb_streamer

    return get_rgb_streamer().get_stats()


@app.post("/video/restart")
def video_restart_endpoint():
    """Force restart de la caméra RGB (utile si 'device busy')."""
    from backend.src.streaming.rgb_camera_stream import get_rgb_streamer

    get_rgb_streamer().restart()
    return {"ok": True, "stats": get_rgb_streamer().get_stats()}


@app.get("/video/annotated")
def video_annotated_endpoint():
    """Dernière image RGB avec overlay IA (mode capture rpicam actuel)."""
    from backend.src.streaming.rgb_camera_stream import get_rgb_streamer

    try:
        import numpy as np
        import cv2
        from ia_prediction.pipeline import process_frame

        jpeg = get_rgb_streamer().get_jpeg()
        img = cv2.imdecode(np.frombuffer(jpeg, dtype=np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise RuntimeError("could not decode jpeg")
        result = process_frame(img, frame_id=0)
        annotated = result.annotated_frame if result.annotated_frame is not None else img
        ok, out = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if not ok:
            raise RuntimeError("jpeg encode failed")
        return Response(content=out.tobytes(), media_type="image/jpeg", headers={"Cache-Control": "no-store"})
    except Exception as e:
        svg = f"""<?xml version='1.0' encoding='UTF-8'?>
<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'>
    <rect width='100%' height='100%' fill='#111' />
    <text x='50%' y='45%' fill='#f55' font-family='monospace' font-size='16' text-anchor='middle'>Annotated video error</text>
    <text x='50%' y='60%' fill='#888' font-family='monospace' font-size='11' text-anchor='middle'>{str(e)[:80]}</text>
</svg>"""
        return Response(content=svg, media_type="image/svg+xml")


# ============================================================================
# THERMAL HEATMAP STREAM (AMG8833)
# ============================================================================

_heatmap_streamer = HeatmapStreamer(output_size=320, temp_min=18.0, temp_max=45.0)

@app.get("/thermal")
def thermal_endpoint():
    """Retourne une image heatmap JPEG de la caméra thermique AMG8833."""
    try:
        jpeg = _heatmap_streamer.get_jpeg(quality=85)
        return Response(content=jpeg, media_type="image/jpeg")
    except Exception as e:
        svg = f"""<?xml version='1.0' encoding='UTF-8'?>
<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'>
    <rect width='100%' height='100%' fill='#111' />
    <text x='50%' y='45%' fill='#f55' font-family='monospace' font-size='14' text-anchor='middle'>Thermal error</text>
    <text x='50%' y='60%' fill='#888' font-family='monospace' font-size='11' text-anchor='middle'>{str(e)[:60]}</text>
</svg>"""
        return Response(content=svg, media_type="image/svg+xml")

@app.get("/thermal/stats")
def thermal_stats_endpoint():
    """Retourne les stats de température (min, max, avg, pixels)."""
    try:
        return _heatmap_streamer.get_stats()
    except Exception as e:
        return {"error": str(e)}

@app.get("/health")
def health():
    """Health check endpoint."""
    return {
        "ok": True,
        "ws": "/ws",
        "dashboard": "/dashboard",
        "active_sessions": len(ACTIVE_SESSIONS)
    }

# ============================================================================
# WEBSOCKET MANAGEMENT
# ============================================================================

class ConnectionManager:
    """Manage WebSocket connections."""
    def __init__(self):
        self.active_connections: set = set()
    
    async def connect(self, websocket: WebSocket):
        """Accept and register a new connection."""
        await websocket.accept()
        self.active_connections.add(websocket)
    
    async def disconnect(self, websocket: WebSocket):
        """Remove a disconnected client."""
        self.active_connections.discard(websocket)
    
    async def broadcast(self, data: dict):
        """Broadcast data to all connected clients."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception:
                disconnected.append(connection)
        
        for connection in disconnected:
            await self.disconnect(connection)

manager = ConnectionManager()

def get_session_from_headers(headers: dict) -> Optional[str]:
    """Extract session_id from Cookie header."""
    cookie_header = headers.get("cookie", "")
    for item in cookie_header.split(";"):
        item = item.strip()
        if item.startswith(f"{SESSION_COOKIE_NAME}="):
            return item.split("=", 1)[1]
    return None

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Protected WebSocket endpoint for telemetry + commands.

    Telemetry is broadcast to all clients by demo_telemetry_loop.
    Incoming messages are treated as JSON commands:
      { "cmd": "send_route",  "points": [...] }
      { "cmd": "start_flight" }
      { "cmd": "abort" }
      { "cmd": "set_speed", "value": 5.0 }
    """
    session_id = get_session_from_headers(dict(websocket.headers))
    
    if not session_id:
        await websocket.close(code=1008, reason="No session cookie")
        return
    
    username = validate_session(session_id)
    if not username:
        await websocket.close(code=1008, reason="Invalid session")
        return
    
    print(f"✓ WS connected: {username}")
    await manager.connect(websocket)
    
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "msg": "Invalid JSON"})
                continue

            cmd = msg.get("cmd", "")
            print(f"⇠ WS cmd from {username}: {cmd}")

            if cmd == "send_route":
                points = msg.get("points", [])
                name = msg.get("name", f"mission_{int(time.time())}")
                print(f"  Route '{name}' with {len(points)} waypoints")
                mission_ok = False
                if _MM_OK and points:
                    try:
                        _mm.create(name, waypoints=points, takeoff_alt=15.0,
                                   home_lat=BASE_LATITUDE, home_lon=BASE_LONGITUDE)
                        mission_ok = True
                    except Exception as e:
                        print(f"Mission create error: {e}")
                await websocket.send_json({
                    "type": "ack",
                    "cmd": "send_route",
                    "status": "ok" if mission_ok else "stored",
                    "name": name,
                    "count": len(points)
                })

            elif cmd == "start_flight":
                print(f"  ▶ START FLIGHT requested by {username}")
                _flight_active = True
                mission_name = msg.get("mission", None)
                if _MM_OK and mission_name:
                    try:
                        _mm.start(mission_name)
                    except Exception as e:
                        print(f"Mission start error: {e}")
                elif _FC_OK:
                    try:
                        _fc.arm()
                        _fc.takeoff(float(msg.get("altitude", 15.0)))
                    except Exception as e:
                        print(f"FC arm/takeoff error: {e}")
                asyncio.create_task(demo_telemetry_loop())
                await websocket.send_json({"type": "ack", "cmd": "start_flight", "status": "ok"})

            elif cmd == "abort":
                print(f"  ■ ABORT requested by {username}")
                _flight_active = False
                if _MM_OK:
                    try:
                        _mm.abort()
                    except Exception:
                        pass
                if _FC_OK:
                    try:
                        _fc.rtl()
                    except Exception:
                        pass
                await websocket.send_json({"type": "ack", "cmd": "abort", "status": "ok"})

            elif cmd == "rtl":
                print(f"  ↩ RTL (Return To Launch) requested by {username}")
                _flight_active = False
                if _FC_OK:
                    try:
                        _fc.rtl()
                    except Exception as e:
                        print(f"RTL error: {e}")
                if _MM_OK:
                    try:
                        _mm.abort()
                    except Exception:
                        pass
                await websocket.send_json({"type": "ack", "cmd": "rtl", "status": "ok"})

            elif cmd == "set_speed":
                value = msg.get("value", 0)
                print(f"  Speed → {value} m/s")
                if _FC_OK:
                    try:
                        _fc.set_speed(float(value))
                    except Exception as e:
                        print(f"set_speed error: {e}")
                await websocket.send_json({"type": "ack", "cmd": "set_speed", "value": value})

            else:
                await websocket.send_json({"type": "error", "msg": f"Unknown cmd: {cmd}"})

    except WebSocketDisconnect:
        await manager.disconnect(websocket)
        print(f"✓ WS disconnected: {username}")

# ============================================================================
# DEMO TELEMETRY LOOP
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Load users on startup. Telemetry loop is NOT auto-started."""
    load_users()
    _load_sessions()
    # IA RGB: démarrée à la demande (/api/detect/rgb ou /video), pas au boot (évite crash/lenteur login)
    print("🤖 RF-DETR: lazy start (on first detect/video request)")
    # Log UART assignment (RPi 5: GPS = miniUART, FC = PL011)
    if GPS:
        print(f"GPS configured on {GPS['port']} (miniUART)")
    if _CABLAGE_FC:
        print(f"Flight Controller configured on {_CABLAGE_FC['port']} (PL011)")
    # Demo telemetry loop is disabled by default.
    # It starts only when the frontend sends a 'start_flight' command.
    if _GPS_MODULE_OK:
        try:
            _get_gps()
            print("GPS module started (hardware or simulation)")
        except Exception as e:
            print(f"GPS start error: {e}")
    if _SAFETY_OK:
        print("Safety supervisor active")
    if _FC_OK:
        print("Flight controller ready")
    if _MM_OK:
        print(f"Mission manager ready ({len(_mm.list_missions())} missions loaded)")


# ── Hardware modules (lazy: fall back to simulation if hardware absent) ──
try:
    from backend.src.navigation.gps import get_gps_module as _get_gps
    _GPS_MODULE_OK = True
except Exception:
    _GPS_MODULE_OK = False

try:
    from backend.src.control.flight_controller import flight_controller as _fc
    _FC_OK = True
except Exception:
    _FC_OK = False

try:
    from backend.src.mission.mission_manager import mission_manager as _mm, WayPoint, MissionState
    _MM_OK = True
except Exception:
    _MM_OK = False

try:
    from backend.src.safety.supervisor import safety_supervisor as _safety
    _SAFETY_OK = True
except Exception:
    _SAFETY_OK = False

# Global flag to control backend telemetry broadcast
_flight_active = False

async def demo_telemetry_loop():
    """Telemetry loop — uses real GPS when hardware present, simulation otherwise."""
    global _flight_active
    counter = 0
    radius = 0.005

    gps_mod = _get_gps() if _GPS_MODULE_OK else None
    if _SAFETY_OK:
        _safety.set_airborne(True)

    while _flight_active:
        counter += 1

        if gps_mod:
            fix = gps_mod.get_fix()
            lat, lon, alt = fix.lat, fix.lon, fix.altitude
            heading, speed, gps_ok, sats = fix.heading, fix.speed_mps, fix.valid, fix.satellites
        else:
            angle = (counter * 2.0) % 360
            lat = BASE_LATITUDE  + radius * math.cos(math.radians(angle))
            lon = BASE_LONGITUDE + radius * math.sin(math.radians(angle))
            alt     = 15.0 + 5.0 * math.sin(math.radians(counter))
            heading = angle
            speed   = 2.5
            gps_ok  = False
            sats    = 0

        mission_status = None
        if _MM_OK:
            try:
                mission_status = _mm.update(lat, lon, alt, heading)
            except Exception:
                pass

        safety_state = "ok"
        if _SAFETY_OK:
            try:
                safety_state = _safety.check({"lat": lat, "lon": lon, "alt": alt,
                                               "speed": speed, "battery": 85.0})
                if safety_state == "failsafe" and _flight_active:
                    _flight_active = False
            except Exception:
                pass

        if _FC_OK:
            try:
                _fc.send_heartbeat()
            except Exception:
                pass

        telemetry = {
            "lat": lat, "lon": lon, "alt": round(alt, 2),
            "heading": round(heading, 1), "speed": round(speed, 2),
            "battery": 85.0, "ts": int(time.time()),
            "gps_ok": gps_ok, "satellites": sats, "safety": safety_state,
        }
        if mission_status:
            telemetry["mission"] = mission_status

        await manager.broadcast(telemetry)
        await asyncio.sleep(0.5)

    if _SAFETY_OK:
        _safety.set_airborne(False)



# ============================================================================
# MISSION API
# ============================================================================

@app.get("/api/missions")
def api_list_missions(sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    if not _MM_OK:
        return JSONResponse({"missions": [], "error": "MissionManager unavailable"})
    return JSONResponse({"missions": _mm.list_missions()})


@app.post("/api/missions")
async def api_create_mission(request: Request, sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    body = await request.json()
    name = body.get("name", f"mission_{int(time.time())}")
    waypoints = body.get("waypoints", [])
    takeoff_alt = float(body.get("takeoff_alt", 15.0))
    if not _MM_OK:
        return JSONResponse({"ok": False, "error": "MissionManager unavailable"})
    m = _mm.create(name, waypoints=waypoints, takeoff_alt=takeoff_alt,
                   home_lat=BASE_LATITUDE, home_lon=BASE_LONGITUDE)
    return JSONResponse({"ok": True, "mission": m.to_dict()})


@app.post("/api/missions/{name}/start")
def api_start_mission(name: str, sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    if not _MM_OK:
        return JSONResponse({"ok": False, "error": "MissionManager unavailable"})
    ok = _mm.start(name)
    return JSONResponse({"ok": ok})


@app.post("/api/missions/{name}/delete")
def api_delete_mission(name: str, sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    if not _MM_OK:
        return JSONResponse({"ok": False})
    ok = _mm.delete(name)
    return JSONResponse({"ok": ok})


@app.post("/api/missions/abort")
def api_abort_mission(sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    if _MM_OK:
        _mm.abort()
    if _FC_OK:
        _fc.rtl()
    return JSONResponse({"ok": True})


@app.get("/api/missions/status")
def api_mission_status(sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    if not _MM_OK:
        return JSONResponse({"active": False})
    return JSONResponse(_mm.status())


# ============================================================================
# FLIGHT CONTROL API
# ============================================================================

@app.post("/api/drone/arm")
def api_arm(sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    if not _FC_OK:
        return JSONResponse({"ok": False, "sim": True, "msg": "FC not available"})
    ok = _fc.arm()
    return JSONResponse({"ok": ok})


@app.post("/api/drone/disarm")
def api_disarm(sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    if not _FC_OK:
        return JSONResponse({"ok": False})
    ok = _fc.disarm()
    return JSONResponse({"ok": ok})


@app.post("/api/drone/takeoff")
async def api_takeoff(request: Request, sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    body = await request.json()
    alt = float(body.get("altitude", 10.0))
    if not _FC_OK:
        return JSONResponse({"ok": False, "sim": True})
    ok = _fc.takeoff(alt)
    return JSONResponse({"ok": ok, "altitude": alt})


@app.post("/api/drone/land")
def api_land(sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    if not _FC_OK:
        return JSONResponse({"ok": False})
    ok = _fc.land()
    return JSONResponse({"ok": ok})


@app.post("/api/drone/rtl")
def api_rtl(sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    if _FC_OK:
        _fc.rtl()
    if _MM_OK:
        _mm.abort()
    return JSONResponse({"ok": True})


@app.get("/api/drone/status")
def api_drone_status(sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    gps_fix = None
    if _GPS_MODULE_OK:
        try:
            fix = _get_gps().get_fix()
            gps_fix = {"lat": fix.lat, "lon": fix.lon, "alt": fix.altitude,
                       "speed": fix.speed_mps, "heading": fix.heading,
                       "sats": fix.satellites, "valid": fix.valid}
        except Exception:
            pass
    fc_state = {}
    if _FC_OK:
        fc_state = {"armed": _fc.armed, "mode": _fc.mode, "setpoints": _fc.setpoints}
    return JSONResponse({
        "gps": gps_fix,
        "fc": fc_state,
        "safety": _safety.violations if _SAFETY_OK else [],
        "flight_active": _flight_active,
    })


# ============================================================================
# PID API
# ============================================================================

@app.get("/api/pid")
def api_pid_get(sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    if not _FC_OK:
        return JSONResponse({"pid_gains": {}})
    return JSONResponse({"pid_gains": _fc.pid_gains})


@app.post("/api/pid/{axis}")
async def api_pid_set(axis: str, request: Request, sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    body = await request.json()
    kp = float(body.get("kp", 1.0))
    ki = float(body.get("ki", 0.0))
    kd = float(body.get("kd", 0.0))
    if not _FC_OK:
        return JSONResponse({"ok": False})
    ok = _fc.set_pid_gains(axis, kp, ki, kd)
    return JSONResponse({"ok": ok, "axis": axis, "kp": kp, "ki": ki, "kd": kd})


# ============================================================================
# GPS API
# ============================================================================

@app.get("/api/gps")
def api_gps(sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    if not _GPS_MODULE_OK:
        return JSONResponse({"valid": False, "sim": True,
                             "lat": BASE_LATITUDE, "lon": BASE_LONGITUDE})
    fix = _get_gps().get_fix()
    return JSONResponse({
        "valid": fix.valid, "lat": fix.lat, "lon": fix.lon,
        "alt": fix.altitude, "speed": fix.speed_mps,
        "heading": fix.heading, "satellites": fix.satellites,
        "hdop": fix.hdop, "ts": fix.timestamp,
    })


# ============================================================================
# SAFETY API
# ============================================================================

@app.get("/api/safety")
def api_safety_status(sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    if not _SAFETY_OK:
        return JSONResponse({"ok": True, "violations": []})
    return JSONResponse({
        "violations": _safety.violations,
        "constraints": _safety.constraints,
        "geofence_points": len(_safety.geofence),
    })


@app.post("/api/safety/constraint")
async def api_set_constraint(request: Request, sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    body = await request.json()
    name = body.get("name")
    value = float(body.get("value", 0))
    if not _SAFETY_OK:
        return JSONResponse({"ok": False})
    ok = _safety.set_constraint(name, value)
    return JSONResponse({"ok": ok})


@app.post("/api/safety/geofence")
async def api_set_geofence(request: Request, sid: str = Cookie(None)):
    if not validate_session(sid):
        raise HTTPException(status_code=401)
    body = await request.json()
    points = [(float(p["lat"]), float(p["lon"])) for p in body.get("points", [])]
    if not _SAFETY_OK:
        return JSONResponse({"ok": False})
    _safety.set_geofence(points)
    return JSONResponse({"ok": True, "points": len(points)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
