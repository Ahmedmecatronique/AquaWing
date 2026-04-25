from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Cookie, HTTPException, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse, Response
from pathlib import Path
# Note: FastAPI Form parsing requires python-multipart
# Install with: pip install python-multipart
import json
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

# Default demo users; persisted users.json will be used/merged
DEMO_USERS = {
    "admin": "admin123",
    "user": "password123",
    "ahmed": "ahmed22k22",
    "amin":"amin123"
}

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
    return session_id

def validate_session(session_id: Optional[str]) -> Optional[str]:
    """Validate a session and return username if valid."""
    if not session_id or session_id not in ACTIVE_SESSIONS:
        return None
    
    session = ACTIVE_SESSIONS[session_id]
    age = datetime.now() - session["created_at"]
    
    if age.total_seconds() > SESSION_TIMEOUT:
        del ACTIVE_SESSIONS[session_id]
        return None
    
    return session["username"]

def destroy_session(session_id: str):
    """Destroy a session."""
    if session_id in ACTIVE_SESSIONS:
        del ACTIVE_SESSIONS[session_id]

def authenticate_user(username: str, password: str) -> bool:
    """Authenticate a user with username/password."""
    return USERS.get(username) == password

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
    # Accept form OR JSON body to avoid 422 from clients
    if not username or not password:
        try:
            data = await request.json()
            username = data.get('username')
            password = data.get('password')
        except Exception:
            return RedirectResponse(url="/login?err=1", status_code=302)

    if not username or not password or not authenticate_user(username, password):
        return RedirectResponse(url="/login?err=1", status_code=302)

    session_id = create_session(username)
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

    USERS[username] = password
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
        return FileResponse(str(page_path))
    return {"error": "Electrical Wiring.html not found"}


@app.get("/electrical-wiring.css")
def electrical_wiring_css():
    """Serve standalone Electrical Wiring CSS."""
    css_path = ELECTRICAL_WIRING_DIR / "Electrical Wiring.css"
    if css_path.exists():
        return FileResponse(str(css_path), media_type="text/css")
    return {"error": "Electrical Wiring.css not found"}


@app.get("/electrical-wiring.js")
def electrical_wiring_js():
    """Serve standalone Electrical Wiring JS."""
    js_path = ELECTRICAL_WIRING_DIR / "Electrical Wiring.js"
    if js_path.exists():
        return FileResponse(str(js_path), media_type="application/javascript")
    return {"error": "Electrical Wiring.js not found"}


@app.get("/missions-page")
def missions_page(sid: str = Cookie(None), guest: Optional[str] = None):
    """Serve standalone Missions page."""
    if not DEV_BYPASS_AUTH and guest != "1":
        if not sid or not validate_session(sid):
            return RedirectResponse(url="/login", status_code=302)

    page_path = MISSIONS_DIR / "Missions.html"
    if page_path.exists():
        return FileResponse(str(page_path))
    return {"error": "Missions.html not found"}


@app.get("/missions-page.css")
def missions_page_css():
    """Serve standalone Missions CSS."""
    css_path = MISSIONS_DIR / "Missions.css"
    if css_path.exists():
        return FileResponse(str(css_path), media_type="text/css")
    return {"error": "Missions.css not found"}


@app.get("/missions-page.js")
def missions_page_js():
    """Serve standalone Missions JS."""
    js_path = MISSIONS_DIR / "Missions.js"
    if js_path.exists():
        return FileResponse(str(js_path), media_type="application/javascript")
    return {"error": "Missions.js not found"}


@app.get("/systems-page")
def systems_page(sid: str = Cookie(None), guest: Optional[str] = None):
    """Serve standalone Systems page."""
    if not DEV_BYPASS_AUTH and guest != "1":
        if not sid or not validate_session(sid):
            return RedirectResponse(url="/login", status_code=302)

    page_path = SYSTEMS_DIR / "Systems.html"
    if page_path.exists():
        return FileResponse(str(page_path))
    return {"error": "Systems.html not found"}


@app.get("/systems-page.css")
def systems_page_css():
    """Serve standalone Systems CSS."""
    css_path = SYSTEMS_DIR / "Systems.css"
    if css_path.exists():
        return FileResponse(str(css_path), media_type="text/css")
    return {"error": "Systems.css not found"}


@app.get("/systems-page.js")
def systems_page_js():
    """Serve standalone Systems JS."""
    js_path = SYSTEMS_DIR / "Systems.js"
    if js_path.exists():
        return FileResponse(str(js_path), media_type="application/javascript")
    return {"error": "Systems.js not found"}


@app.get("/optical-page")
def optical_page(sid: str = Cookie(None), guest: Optional[str] = None):
    """Serve standalone Optical page."""
    if not DEV_BYPASS_AUTH and guest != "1":
        if not sid or not validate_session(sid):
            return RedirectResponse(url="/login", status_code=302)

    page_path = OPTICAL_DIR / "Optical.html"
    if page_path.exists():
        return FileResponse(str(page_path))
    return {"error": "Optical.html not found"}


@app.get("/optical-page.css")
def optical_page_css():
    """Serve standalone Optical CSS."""
    css_path = OPTICAL_DIR / "Optical.css"
    if css_path.exists():
        return FileResponse(str(css_path), media_type="text/css")
    return {"error": "Optical.css not found"}


@app.get("/optical-page.js")
def optical_page_js():
    """Serve standalone Optical JS."""
    js_path = OPTICAL_DIR / "Optical.js"
    if js_path.exists():
        return FileResponse(str(js_path), media_type="application/javascript")
    return {"error": "Optical.js not found"}


@app.get("/pid-page")
def pid_page(sid: str = Cookie(None), guest: Optional[str] = None):
    """Serve standalone PID Settings page."""
    if not DEV_BYPASS_AUTH and guest != "1":
        if not sid or not validate_session(sid):
            return RedirectResponse(url="/login", status_code=302)

    page_path = PID_SETTINGS_DIR / "PID Settings.html"
    if page_path.exists():
        return FileResponse(str(page_path))
    return {"error": "PID Settings.html not found"}


@app.get("/pid-page.css")
def pid_page_css():
    """Serve standalone PID Settings CSS."""
    css_path = PID_SETTINGS_DIR / "PID Settings.css"
    if css_path.exists():
        return FileResponse(str(css_path), media_type="text/css")
    return {"error": "PID Settings.css not found"}


@app.get("/pid-page.js")
def pid_page_js():
    """Serve standalone PID Settings JS."""
    js_path = PID_SETTINGS_DIR / "PID Settings.js"
    if js_path.exists():
        return FileResponse(str(js_path), media_type="application/javascript")
    return {"error": "PID Settings.js not found"}


@app.get("/heatmap-page")
def heatmap_page(sid: str = Cookie(None), guest: Optional[str] = None):
    """Serve standalone Heatmap page."""
    if not DEV_BYPASS_AUTH and guest != "1":
        if not sid or not validate_session(sid):
            return RedirectResponse(url="/login", status_code=302)

    page_path = HEATMAP_DIR / "Heatmap.html"
    if page_path.exists():
        return FileResponse(str(page_path))
    return {"error": "Heatmap.html not found"}


@app.get("/heatmap-page.css")
def heatmap_page_css():
    """Serve standalone Heatmap CSS."""
    css_path = HEATMAP_DIR / "Heatmap.css"
    if css_path.exists():
        return FileResponse(str(css_path), media_type="text/css")
    return {"error": "Heatmap.css not found"}


@app.get("/heatmap-page.js")
def heatmap_page_js():
    """Serve standalone Heatmap JS."""
    js_path = HEATMAP_DIR / "Heatmap.js"
    if js_path.exists():
        return FileResponse(str(js_path), media_type="application/javascript")
    return {"error": "Heatmap.js not found"}


@app.get("/settings-page")
def settings_page(sid: str = Cookie(None), guest: Optional[str] = None):
    """Serve standalone Settings page."""
    if not DEV_BYPASS_AUTH and guest != "1":
        if not sid or not validate_session(sid):
            return RedirectResponse(url="/login", status_code=302)

    page_path = SETTINGS_DIR / "Settings.html"
    if page_path.exists():
        return FileResponse(str(page_path))
    return {"error": "Settings.html not found"}


@app.get("/settings-page.css")
def settings_page_css():
    """Serve standalone Settings CSS."""
    css_path = SETTINGS_DIR / "Settings.css"
    if css_path.exists():
        return FileResponse(str(css_path), media_type="text/css")
    return {"error": "Settings.css not found"}


@app.get("/settings-page.js")
def settings_page_js():
    """Serve standalone Settings JS."""
    js_path = SETTINGS_DIR / "Settings.js"
    if js_path.exists():
        return FileResponse(str(js_path), media_type="application/javascript")
    return {"error": "Settings.js not found"}


@app.get("/video")
def video_endpoint():
        """Return a placeholder video image (JPEG) if present, otherwise return an SVG placeholder."""
        placeholder = STATIC_DIR / "video_placeholder.jpg"
        if placeholder.exists():
                return FileResponse(str(placeholder), media_type="image/jpeg")

        # Return a simple SVG placeholder when no camera is available
        svg = """<?xml version='1.0' encoding='UTF-8'?>
<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'>
    <rect width='100%' height='100%' fill='#111' />
    <g fill='none' stroke='#0ff' stroke-opacity='0.25' stroke-width='2'>
        <rect x='10' y='10' width='620' height='340' />
    </g>
    <text x='50%' y='45%' fill='#0ff' font-family='monospace' font-size='20' text-anchor='middle'>Video stream not available</text>
    <text x='50%' y='60%' fill='#0ff' font-family='monospace' font-size='14' text-anchor='middle'>Use /video to serve MJPEG or an image refresh stream</text>
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
                # TODO: forward to flight controller via UART
                await websocket.send_json({
                    "type": "ack",
                    "cmd": "send_route",
                    "status": "ok",
                    "name": name,
                    "count": len(points)
                })

            elif cmd == "start_flight":
                print(f"  ▶ START FLIGHT requested by {username}")
                _flight_active = True
                asyncio.create_task(demo_telemetry_loop())
                await websocket.send_json({"type": "ack", "cmd": "start_flight", "status": "ok"})

            elif cmd == "abort":
                print(f"  ■ ABORT requested by {username}")
                _flight_active = False
                await websocket.send_json({"type": "ack", "cmd": "abort", "status": "ok"})

            elif cmd == "rtl":
                print(f"  ↩ RTL (Return To Launch) requested by {username}")
                _flight_active = False
                # TODO: forward to flight controller via UART
                await websocket.send_json({"type": "ack", "cmd": "rtl", "status": "ok"})

            elif cmd == "set_speed":
                value = msg.get("value", 0)
                print(f"  Speed → {value} m/s")
                # TODO: forward to flight controller
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
    # Log UART assignment (RPi 5: GPS = miniUART, FC = PL011)
    if GPS:
        print(f"GPS configured on {GPS['port']} (miniUART)")
    if _CABLAGE_FC:
        print(f"Flight Controller configured on {_CABLAGE_FC['port']} (PL011)")
    # Demo telemetry loop is disabled by default.
    # It starts only when the frontend sends a 'start_flight' command.

# Global flag to control backend telemetry broadcast
_flight_active = False

async def demo_telemetry_loop():
    """Demo loop: broadcast telemetry every 0.5 seconds while flight is active."""
    global _flight_active
    counter = 0
    radius = 0.005
    
    while _flight_active:
        counter += 1
        angle = (counter * 2.0) % 360
        
        lat = BASE_LATITUDE + radius * math.cos(math.radians(angle))
        lon = BASE_LONGITUDE + radius * math.sin(math.radians(angle))
        
        telemetry = {
            "lat": lat,
            "lon": lon,
            "alt": 15.0 + 5.0 * math.sin(math.radians(counter)),
            "heading": angle,
            "speed": 2.5,
            "battery": 85.0,
            "ts": int(time.time())
        }
        
        await manager.broadcast(telemetry)
        await asyncio.sleep(0.5)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
