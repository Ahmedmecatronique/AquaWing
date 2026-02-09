"""
WebSocket Handlers - Real-Time Telemetry Streaming with Authentication

This module implements WebSocket connections for real-time telemetry streaming.
Clients connect via /ws to receive continuous drone status updates.

Features:
- Real-time position tracking
- Session-based authentication
- Auto-reconnection support
- Broadcast to multiple clients
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Set
import json
import asyncio
import time

from backend import auth


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
    Extract session ID from cookie headers.

    Args:
        headers: WebSocket headers/cookies dict

    Returns:
        Session ID if found, empty string otherwise
    """
    cookies_header = headers.get("cookie", "")

    for cookie in cookies_header.split(";"):
        cookie = cookie.strip()
        if cookie.startswith("session_id="):
            return cookie.split("=", 1)[1]

    return ""


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

    try:
        while True:
            # Keep the connection alive; telemetry is broadcast by demo_telemetry_loop
            data = await websocket.receive_text()
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
