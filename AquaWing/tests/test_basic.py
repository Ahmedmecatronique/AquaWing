"""
AquaWing - Basic Test Suite
"""
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))


def test_imports():
    """Test that all modules can be imported."""
    from backend.src.mission.mission_manager import MissionManager, Mission, WayPoint
    from backend.src.navigation.guidance import GuidanceController
    from backend.src.perception.detector import ObjectDetector
    from backend.src.perception.cameras.rgb_camera import RGBCamera
    from backend.src.perception.cameras.thermal_camera import ThermalCamera
    from backend.src.safety.supervisor import SafetySupervisor
    from backend.src.control.flight_controller import FlightController
    from backend.src.streaming.video_stream import VideoStreamProcessor
    from backend.src.uart.protocol import MessageType, encode_message, decode_message
    from backend.src.uart.uart_link import UARTLink
    from backend.src.utils.logger import setup_logger, log_event
    print("All imports OK")


def test_mission_manager():
    """Test mission creation and management."""
    from backend.src.mission.mission_manager import MissionManager, WayPoint

    mgr = MissionManager()
    mission = mgr.create_mission("test_mission")
    mission.add_waypoint(WayPoint(36.8065, 10.1815, 20.0))
    mission.add_waypoint(WayPoint(36.8070, 10.1820, 25.0))

    assert len(mission.waypoints) == 2
    assert mgr.load_mission("test_mission") is True
    print("Mission manager OK")


def test_safety_supervisor():
    """Test safety constraint checking."""
    from backend.src.safety.supervisor import SafetySupervisor

    supervisor = SafetySupervisor()

    # Normal state
    safe_state = {"altitude_m": 50, "speed_mps": 10, "battery_percent": 80}
    assert supervisor.check_constraints(safe_state) is True

    # Altitude violation
    bad_state = {"altitude_m": 150, "speed_mps": 10, "battery_percent": 80}
    assert supervisor.check_constraints(bad_state) is False
    print("Safety supervisor OK")


def test_flight_controller():
    """Test flight controller."""
    from backend.src.control.flight_controller import FlightController

    fc = FlightController()
    assert fc.armed is False
    fc.arm()
    assert fc.armed is True
    assert fc.set_mode("GUIDED") is True
    assert fc.set_mode("INVALID") is False
    fc.disarm()
    assert fc.armed is False
    print("Flight controller OK")


def test_guidance():
    """Test guidance controller."""
    from backend.src.navigation.guidance import GuidanceController

    gc = GuidanceController()
    gc.set_target(36.8065, 10.1815, 20.0)
    assert gc.target_position == (36.8065, 10.1815, 20.0)
    result = gc.compute_control()
    assert "pitch" in result
    assert "roll" in result
    print("Guidance controller OK")


if __name__ == "__main__":
    test_imports()
    test_mission_manager()
    test_safety_supervisor()
    test_flight_controller()
    test_guidance()
    print("\n All tests passed!")
