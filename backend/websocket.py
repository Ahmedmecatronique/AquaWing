"""
WebSocket Handlers - Real-Time Telemetry Streaming with Authentication

This module implements WebSocket connections for real-time telemetry streaming.
Clients connect via /ws to receive continuous drone status updates and send commands.

Features:
- Real-time position tracking (broadcast when start_flight is sent)
- Command handling: send_route, start_flight, abort, rtl, set_speed
- Session-based authentication (cookie session_id)
- Broadcast to multiple clients
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Set
import json
import asyncio
import time
import math

from backend import auth

# Demo telemetry base (Tunis)
_BASE_LAT = 36.8065
_BASE_LON = 10.1815
_flight_active = False


router = APIRouter()


# ============================================================================
# WebSocket Connection Management
# ============================================================================

class ConnectionManager:
    """
    Manages active WebSocket connections for telemetry streaming.

    Allows broadcasting telemetry data to all authenticated connected clients.
    """

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        self.active_connections.add(websocket)
        print(f"✓ WebSocket connected. Active connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        """Unregister a closed WebSocket connection."""
        self.active_connections.discard(websocket)
        print(f"✓ WebSocket disconnected. Active connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """
        Broadcast a message to all connected clients.

        Args:
            message: Dictionary to send as JSON
        """
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"Error broadcasting: {e}")
                disconnected.append(connection)

        # Clean up disconnected clients
        for connection in disconnected:
            self.disconnect(connection)


# Global connection manager instance
manager = ConnectionManager()


# ============================================================================
# Helper Functions
# ============================================================================

def get_session_from_headers(headers: dict) -> str:
    """
    Extract session ID from cookie headers (auth.COOKIE_NAME = session_id).
    """
    cookies_header = headers.get("cookie", "")
    prefix = auth.COOKIE_NAME + "="
    for cookie in cookies_header.split(";"):
        cookie = cookie.strip()
        if cookie.startswith(prefix):
            return cookie.split("=", 1)[1]
    return ""


async def _demo_telemetry_loop():
    """Broadcast demo telemetry every 0.5 s while flight is active."""
    global _flight_active
    counter = 0
    radius = 0.005
    while _flight_active:
        counter += 1
        angle = (counter * 2.0) % 360
        lat = _BASE_LAT + radius * math.cos(math.radians(angle))
        lon = _BASE_LON + radius * math.sin(math.radians(angle))
        telemetry = {
            "lat": lat,
            "lon": lon,
            "alt": 15.0 + 5.0 * math.sin(math.radians(counter)),
            "heading": angle,
            "speed": 2.5,
            "battery": 85.0,
            "ts": int(time.time()),
        }
        await manager.broadcast(telemetry)
        await asyncio.sleep(0.5)


# ============================================================================
# WebSocket Endpoints
# ============================================================================

@router.websocket("/ws")
async def websocket_telemetry(websocket: WebSocket):
    """
    WebSocket endpoint for real-time drone telemetry streaming.

    **Authentication Required**: Must have valid session cookie.

    Message format:
    {
        "lat": float,      # Latitude (decimal degrees)
        "lon": float,      # Longitude (decimal degrees)
        "alt": float,      # Altitude in meters
        "heading": float,  # Heading in degrees (0-360)
        "speed": float,    # Speed in m/s
        "battery": float,  # Battery percentage (0-100)
        "ts": int          # Unix timestamp
    }

    Closes with code 1008 if session is missing or invalid.
    """

    # Authentication check
    session_id = get_session_from_headers(dict(websocket.headers))

    if not session_id:
        await websocket.close(code=1008, reason="Authentication required: no session cookie")
        return

    username = auth.validate_session(session_id)
    if not username:
        await websocket.close(code=1008, reason="Authentication required: invalid session")
        return

    print(f"✓ WebSocket: User authenticated: {username}")
    await manager.connect(websocket)

    global _flight_active
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
                await websocket.send_json({
                    "type": "ack", "cmd": "send_route", "status": "ok",
                    "name": name, "count": len(points),
                })
            elif cmd == "start_flight":
                print(f"  ▶ START FLIGHT requested by {username}")
                _flight_active = True
                asyncio.create_task(_demo_telemetry_loop())
                await websocket.send_json({"type": "ack", "cmd": "start_flight", "status": "ok"})
            elif cmd == "abort":
                print(f"  ■ ABORT requested by {username}")
                _flight_active = False
                await websocket.send_json({"type": "ack", "cmd": "abort", "status": "ok"})
            elif cmd == "rtl":
                print(f"  ↩ RTL requested by {username}")
                _flight_active = False
                await websocket.send_json({"type": "ack", "cmd": "rtl", "status": "ok"})
            elif cmd == "set_speed":
                value = msg.get("value", 0)
                print(f"  Speed → {value} m/s")
                await websocket.send_json({"type": "ack", "cmd": "set_speed", "value": value})
            else:
                await websocket.send_json({"type": "error", "msg": f"Unknown cmd: {cmd}"})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print(f"✓ WebSocket client disconnected: {username}")
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)


# ============================================================================
# Legacy Endpoints (kept for compatibility)
# ============================================================================

@router.websocket("/ws/telemetry")
async def websocket_telemetry_legacy(websocket: WebSocket):
    """Deprecated: Use /ws instead."""
    await websocket.close(code=1000, reason="Deprecated endpoint. Use /ws instead.")


@router.websocket("/ws/commands")
async def websocket_commands(websocket: WebSocket):
    """
    WebSocket endpoint for drone commands.

    TODO: Implement command routing and validation.
    """
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_json()
            command = data.get("command")
            params = data.get("params", {})
            print(f"Command received: {command} with params {params}")
            # TODO: Route command to drone hardware
    except WebSocketDisconnect:
        print("Command WebSocket disconnected")
    except Exception as e:
        print(f"Command WebSocket error: {e}")
