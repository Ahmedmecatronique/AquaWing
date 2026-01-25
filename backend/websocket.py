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
                print(f"❌ Error broadcasting: {e}")
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
    cookies_header = headers.get('cookie', '')
    
    for cookie in cookies_header.split(';'):
        cookie = cookie.strip()
        if cookie.startswith('session_id='):
            return cookie.split('=', 1)[1]
    
    return ''


# ============================================================================
# WebSocket Endpoints
# ============================================================================

@router.websocket("/ws")
async def websocket_telemetry(websocket: WebSocket):
    """
    WebSocket endpoint for real-time drone telemetry streaming.
    
    **Authentication Required**: Must have valid session cookie
    
    Format of messages sent:
    {
        "lat": float,      # Latitude (decimal degrees)
        "lon": float,      # Longitude (decimal degrees)
        "alt": float,      # Altitude in meters
        "heading": float,  # Heading in degrees (0-360)
        "speed": float,    # Speed in m/s
        "battery": float,  # Battery percentage (0-100)
        "ts": int          # Unix timestamp
    }
    
    Usage:
        const ws = new WebSocket("ws://localhost:8000/ws");
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log(`Drone: ${data.lat}, ${data.lon}, Alt: ${data.alt}m`);
        };
    
    Closes with code 1008 if:
    - Session cookie is missing
    - Session has expired
    - Not authenticated
    """
    
    # ====================================================================
    # AUTHENTICATION CHECK
    # ====================================================================
    
    session_id = get_session_from_headers(dict(websocket.headers))
    
    if not session_id:
        print("❌ WebSocket: No session cookie provided")
        await websocket.close(code=1008, reason="Authentication required: no session cookie")
        return
    
    username = auth.validate_session(session_id)
    if not username:
        print("❌ WebSocket: Invalid or expired session")
        await websocket.close(code=1008, reason="Authentication required: invalid session")
        return
    
    print(f"✓ WebSocket: User authenticated: {username}")
    
    # ====================================================================
    # CONNECTION ESTABLISHED
    # ====================================================================
    
    await manager.connect(websocket)
    
    try:
        while True:
            # Just keep the connection alive
            # (The main telemetry loop is managed by the demo_telemetry_loop in server.py)
            data = await websocket.receive_text()
            # Clients typically don't send data, but we can handle it if needed
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print(f"✓ WebSocket client disconnected: {username}")
    except Exception as e:
        print(f"❌ WebSocket error: {e}")
        manager.disconnect(websocket)


# ============================================================================
# Legacy Endpoints (Deprecated - kept for compatibility)
# ============================================================================

@router.websocket("/ws/telemetry")
async def websocket_telemetry_legacy(websocket: WebSocket):
    """
    Deprecated: Use /ws instead.
    This endpoint is kept for backward compatibility.
    """
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
            
            print(f"📋 Command received: {command} with params {params}")
            # TODO: Route command to drone hardware
            
    except WebSocketDisconnect:
        print("Command WebSocket disconnected")
    except Exception as e:
        print(f"Command WebSocket error: {e}")



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
    cookies_header = headers.get('cookie', '')
    
    for cookie in cookies_header.split(';'):
        cookie = cookie.strip()
        if cookie.startswith('session_id='):
            return cookie.split('=', 1)[1]
    
    return ''


# ============================================================================
# WebSocket Endpoints
# ============================================================================

@router.websocket("/ws")
async def websocket_telemetry(websocket: WebSocket):
    """
    WebSocket endpoint for real-time drone telemetry streaming.
    
    **Authentication Required**: Must have valid session cookie
    
    Format of messages sent:
    {
        "lat": float,      # Latitude (decimal degrees)
        "lon": float,      # Longitude (decimal degrees)
        "alt": float,      # Altitude in meters
        "heading": float,  # Heading in degrees (0-360)
        "speed": float,    # Speed in m/s
        "battery": float,  # Battery percentage (0-100)
        "ts": int          # Unix timestamp
    }
    
    Usage:
        const ws = new WebSocket("ws://localhost:8000/ws");
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log(`Drone: ${data.lat}, ${data.lon}, Alt: ${data.alt}m`);
        };
    
    Closes with code 1008 if:
    - Session cookie is missing
    - Session has expired
    - Not authenticated
    """
    
    # ====================================================================
    # AUTHENTICATION CHECK
    # ====================================================================
    
    session_id = get_session_from_headers(dict(websocket.headers))
    
    if not session_id:
        print("❌ WebSocket: No session cookie provided")
        await websocket.close(code=1008, reason="Authentication required: no session cookie")
        return
    
    username = auth.validate_session(session_id)
    if not username:
        print("❌ WebSocket: Invalid or expired session")
        await websocket.close(code=1008, reason="Authentication required: invalid session")
        return
    
    print(f"✓ WebSocket: User authenticated: {username}")
    
    # ====================================================================
    # CONNECTION ESTABLISHED
    # ====================================================================
    
    await manager.connect(websocket)
    
    try:
        while True:
            # Just keep the connection alive
            # (The main telemetry loop is managed by the demo_telemetry_loop in server.py)
            data = await websocket.receive_text()
            # Clients typically don't send data, but we can handle it if needed
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print(f"✓ WebSocket client disconnected: {username}")
    except Exception as e:
        print(f"❌ WebSocket error: {e}")
        manager.disconnect(websocket)


# ============================================================================
# Legacy Endpoints (Deprecated - kept for compatibility)
# ============================================================================

@router.websocket("/ws/telemetry")
async def websocket_telemetry_legacy(websocket: WebSocket):
    """
    Deprecated: Use /ws instead.
    This endpoint is kept for backward compatibility.
    """
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
            
            print(f"📋 Command received: {command} with params {params}")
            # TODO: Route command to drone hardware
            
    except WebSocketDisconnect:
        print("Command WebSocket disconnected")
    except Exception as e:
        print(f"Command WebSocket error: {e}")


# ============================================================================
# Helper Functions for Broadcasting
# ============================================================================

async def broadcast_telemetry(telemetry_data: dict):
    """
    Broadcast telemetry data to all connected WebSocket clients.
    
    Args:
        telemetry_data: Dictionary containing telemetry values
    """
    message = {
        "type": "telemetry",
        "timestamp": datetime.now().isoformat(),
        "data": telemetry_data
    }
    await manager.broadcast(message)


async def broadcast_status(status_data: dict):
    """
    Broadcast drone status to all connected clients.
    
    Args:
        status_data: Dictionary containing status values
    """
    message = {
        "type": "status",
        "timestamp": datetime.now().isoformat(),
        "data": status_data
    }
    await manager.broadcast(message)
