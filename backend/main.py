from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Cookie, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from pathlib import Path
import asyncio
import time
import secrets
import math
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel

# ============================================================================
# CONFIGURATION
# ============================================================================

SESSION_TIMEOUT = 86400  # 24 hours
BASE_LATITUDE = 36.8065  # Tunis
BASE_LONGITUDE = 10.1815
STATIC_DIR = Path(__file__).parent.parent / "frontend" / "static"

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
DEMO_USERS = {
    "admin": "admin123",
    "user": "password123"
}

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
    return DEMO_USERS.get(username) == password

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

# Mount static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# ============================================================================
# HTTP ROUTES
# ============================================================================

@app.get("/")
def root(session_id: str = Cookie(None)):
    """Root endpoint - redirect to map or login."""
    if session_id and validate_session(session_id):
        return RedirectResponse(url="/map", status_code=302)
    return RedirectResponse(url="/login", status_code=302)

@app.get("/login")
def login_page(session_id: str = Cookie(None)):
    """Serve login page."""
    if session_id and validate_session(session_id):
        return RedirectResponse(url="/map", status_code=302)
    
    login_path = STATIC_DIR / "login.html"
    if login_path.exists():
        return FileResponse(str(login_path))
    return {"error": "login.html not found"}

@app.post("/login")
def login_post(request: LoginRequest):
    """Handle login POST request."""
    if not authenticate_user(request.username, request.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    session_id = create_session(request.username)
    
    return {
        "success": True,
        "session_id": session_id,
        "username": request.username
    }

@app.get("/logout")
def logout(session_id: str = Cookie(None)):
    """Handle logout."""
    if session_id:
        destroy_session(session_id)
    return RedirectResponse(url="/login", status_code=302)

@app.get("/map")
def map_page(session_id: str = Cookie(None)):
    """Serve map page (protected)."""
    if not session_id or not validate_session(session_id):
        return RedirectResponse(url="/login", status_code=302)
    
    map_path = STATIC_DIR / "map.html"
    if map_path.exists():
        return FileResponse(str(map_path))
    return {"error": "map.html not found"}

@app.get("/health")
def health():
    """Health check endpoint."""
    return {
        "ok": True,
        "ws": "/ws",
        "map": "/map",
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
        if item.startswith("session_id="):
            return item.split("=", 1)[1]
    return None

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Protected WebSocket endpoint for telemetry."""
    session_id = get_session_from_headers(dict(websocket.headers))
    
    if not session_id:
        await websocket.close(code=1008, reason="No session cookie")
        return
    
    username = validate_session(session_id)
    if not username:
        await websocket.close(code=1008, reason="Invalid session")
        return
    
    await manager.connect(websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)

# ============================================================================
# DEMO TELEMETRY LOOP
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Start demo telemetry loop on startup."""
    asyncio.create_task(demo_telemetry_loop())

async def demo_telemetry_loop():
    """Demo loop: broadcast telemetry every 0.5 seconds."""
    counter = 0
    radius = 0.005
    
    while True:
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
