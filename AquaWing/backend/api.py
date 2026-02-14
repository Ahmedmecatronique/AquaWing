"""
REST API Endpoints - Drone Status, Telemetry, and Command Control

This module defines the REST API endpoints for:
- /api/status - Current drone status
- /api/telemetry - Latest telemetry data
- /api/command - Send control commands to drone

TODO: Implement real status queries from drone hardware
TODO: Implement command validation and transmission
TODO: Add authentication checks to all endpoints
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import json
from datetime import datetime

router = APIRouter()


# ============================================================================
# Pydantic Models for Request/Response
# ============================================================================

class DroneStatus(BaseModel):
    """Drone operational status."""
    armed: bool = False
    mode: str = "STABILIZE"  # STABILIZE, GUIDED, AUTO, etc.
    battery_percent: float = 85.0
    gps_fix: bool = False
    num_satellites: int = 0


class TelemetryData(BaseModel):
    """Real-time telemetry from the drone."""
    timestamp: str = datetime.now().isoformat()
    position_lat: float = 0.0
    position_lon: float = 0.0
    altitude_m: float = 0.0
    velocity_mps: float = 0.0
    heading_deg: float = 0.0
    roll_deg: float = 0.0
    pitch_deg: float = 0.0
    yaw_deg: float = 0.0
    battery_voltage_v: float = 12.0
    battery_percent: float = 85.0


class Command(BaseModel):
    """Command to send to the drone."""
    command: str  # e.g., "arm", "disarm", "takeoff", "land", "move"
    params: Optional[dict] = None


class CommandResponse(BaseModel):
    """Response from command execution."""
    success: bool
    message: str
    command_id: Optional[str] = None


class MissionWaypoint(BaseModel):
    """Waypoint in a mission."""
    seq: int
    lat: float
    lon: float
    alt: float = 20.0


class Mission(BaseModel):
    """Mission definition."""
    name: str
    points: list[MissionWaypoint]


# ============================================================================
# API Endpoints
# ============================================================================

# TODO: In-memory storage - replace with real hardware queries
_drone_status = DroneStatus()
_telemetry_data = TelemetryData()
_missions = {}  # {mission_name: Mission}


@router.get("/status", response_model=DroneStatus)
async def get_status():
    """
    Get current drone status.
    
    Returns:
        DroneStatus: Current operational status
        
    TODO: Query actual drone status from hardware
    TODO: Add authentication check
    """
    return _drone_status


@router.get("/telemetry", response_model=TelemetryData)
async def get_telemetry():
    """
    Get latest telemetry data.
    
    Returns:
        TelemetryData: Latest sensor readings
        
    TODO: Query actual telemetry from drone hardware/sensors
    TODO: Add authentication check
    TODO: Implement caching to avoid excessive queries
    """
    return _telemetry_data


# ---------------------------------------------------------------------------
# PID tuning endpoints (frontend -> backend -> optional MCU forward)
# ---------------------------------------------------------------------------
from pydantic import BaseModel as _BaseModel

# Import flight controller (required)
try:
    from backend.src.control.flight_controller import flight_controller as _fc
except ImportError as e:
    print(f"Warning: Could not import flight_controller: {e}")
    # Create a minimal fallback
    class _FakeFC:
        pid_gains = {
            "pitch": {"kp": 1.0, "ki": 0.0, "kd": 0.0},
            "roll": {"kp": 1.0, "ki": 0.0, "kd": 0.0},
            "yaw": {"kp": 1.0, "ki": 0.0, "kd": 0.0},
            "altitude": {"kp": 1.0, "ki": 0.0, "kd": 0.0},
        }
        def set_pid_gains(self, axis, kp, ki, kd):
            if axis in self.pid_gains:
                self.pid_gains[axis] = {"kp": float(kp), "ki": float(ki), "kd": float(kd)}
                return True
            return False
    _fc = _FakeFC()

# Import UART modules (optional - may fail if hardware not available)
_UARTLink = None
_encode_message = None
_MsgType = None
try:
    from backend.src.uart.uart_link import UARTLink as _UARTLink
    from backend.src.uart.protocol import encode_message as _encode_message, MessageType as _MsgType
except ImportError as e:
    print(f"Info: UART modules not available (hardware simulation mode): {e}")


class PIDUpdate(_BaseModel):
    axis: str
    kp: float
    ki: float
    kd: float


@router.get("/pid")
async def get_pid():
    """Return current PID gains for all axes (in-memory)."""
    try:
        return _fc.pid_gains
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pid")
async def update_pid(p: PIDUpdate):
    """Update PID gains (applies in-memory and forwards to MCU via UART if available)."""
    axis = p.axis
    ok = _fc.set_pid_gains(axis, p.kp, p.ki, p.kd)
    if not ok:
        raise HTTPException(status_code=400, detail=f"Unknown axis: {axis}")

    # forward to MCU (simulated when UART not present)
    if _UARTLink and _encode_message and _MsgType:
        try:
            uart = _UARTLink()
            payload = { 'axis': axis, 'kp': p.kp, 'ki': p.ki, 'kd': p.kd }
            data = _encode_message(_MsgType.PID_UPDATE, payload)
            sent = uart.send(data)
            return { 'success': True, 'sent_to_mcu': bool(sent), 'pid': _fc.pid_gains[axis] }
        except Exception as e:
            return { 'success': True, 'sent_to_mcu': False, 'pid': _fc.pid_gains[axis], 'warning': str(e) }
    else:
        # UART not available, just update in-memory
        return { 'success': True, 'sent_to_mcu': False, 'pid': _fc.pid_gains[axis], 'warning': 'UART not available' }


@router.post("/command", response_model=CommandResponse)
async def send_command(cmd: Command):
    """
    Send a command to the drone.

    Placeholder implementation: validates and returns a queued command response.
    """
    try:
        valid_commands = ["arm", "disarm", "takeoff", "land", "move", "rtl", "hover"]
        if cmd.command not in valid_commands:
            return CommandResponse(success=False, message=f"Unknown command: {cmd.command}")

        # TODO: Implement actual command transmission via UART
        return CommandResponse(success=True, message=f"Command '{cmd.command}' queued", command_id="cmd_001")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/status/update")
async def update_status(status: DroneStatus):
    """
    Update stored drone status (for testing/simulation).
    
    Args:
        status: New status values
        
    TODO: Remove this endpoint in production
    """
    global _drone_status
    _drone_status = status
    return {"message": "Status updated"}


@router.post("/telemetry/update")
async def update_telemetry(telemetry: TelemetryData):
    """
    Update stored telemetry data (for testing/simulation).
    
    Args:
        telemetry: New telemetry values
        
    TODO: Remove this endpoint in production
    """
    global _telemetry_data
    _telemetry_data = telemetry
    return {"message": "Telemetry updated"}


@router.post("/missions")
async def create_mission(mission: Mission):
    """
    Create and store a new mission with waypoints.
    
    Args:
        mission: Mission object with name and waypoints
        
    Returns:
        dict: Success message and mission details
    """
    try:
        if not mission.name:
            raise HTTPException(status_code=400, detail="Mission name required")
        
        if not mission.points or len(mission.points) < 2:
            raise HTTPException(status_code=400, detail="Mission requires at least 2 waypoints")
        
        # Store mission
        _missions[mission.name] = mission
        
        return {
            "success": True,
            "message": f"Mission '{mission.name}' saved with {len(mission.points)} waypoints",
            "mission_name": mission.name,
            "waypoint_count": len(mission.points)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/missions")
async def list_missions():
    """
    List all stored missions.
    
    Returns:
        dict: Dictionary of missions
    """
    return {
        "missions": list(_missions.keys()),
        "count": len(_missions)
    }


@router.get("/missions/{mission_name}")
async def get_mission(mission_name: str):
    """
    Get a specific mission by name.
    
    Args:
        mission_name: Name of the mission
        
    Returns:
        Mission: Mission object with waypoints
    """
    if mission_name not in _missions:
        raise HTTPException(status_code=404, detail=f"Mission '{mission_name}' not found")
    
    return _missions[mission_name]
