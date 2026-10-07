from __future__ import annotations
import math
import threading
import time
from typing import Optional, Tuple


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.asin(min(1.0, math.sqrt(a)))


def bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlam = math.radians(lon2 - lon1)
    x = math.sin(dlam) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlam)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def _angle_diff(target: float, current: float) -> float:
    diff = (target - current + 180.0) % 360.0 - 180.0
    return diff


class GuidanceController:
    ARRIVAL_RADIUS_M = 3.0      # within 3m → waypoint reached
    MAX_PITCH = 0.35            # max pitch correction
    MAX_ROLL = 0.35
    MAX_YAW_RATE = 0.5

    def __init__(self) -> None:
        self.target_lat = 0.0
        self.target_lon = 0.0
        self.target_altitude = 10.0
        self.cruise_speed_mps = 5.0
        self.enabled = False
        self._lock = threading.Lock()

    def set_target(self, lat: float, lon: float, altitude: float) -> None:
        with self._lock:
            self.target_lat = lat
            self.target_lon = lon
            self.target_altitude = altitude

    def enable(self) -> None:
        self.enabled = True

    def disable(self) -> None:
        self.enabled = False

    def compute_control(
        self,
        current_lat: float,
        current_lon: float,
        current_alt: float,
        current_heading: float,
    ) -> dict:
        if not self.enabled:
            return {"pitch": 0.0, "roll": 0.0, "yaw": 0.0, "throttle": 0.0, "distance_m": 0.0}

        with self._lock:
            t_lat = self.target_lat
            t_lon = self.target_lon
            t_alt = self.target_altitude

        dist = haversine(current_lat, current_lon, t_lat, t_lon)
        target_bearing = bearing(current_lat, current_lon, t_lat, t_lon)
        heading_error = _angle_diff(target_bearing, current_heading)
        alt_error = t_alt - current_alt

        # Yaw correction: proportional to heading error
        yaw = max(-self.MAX_YAW_RATE, min(self.MAX_YAW_RATE, heading_error / 90.0 * self.MAX_YAW_RATE))

        # Pitch forward when aligned with target and not yet arrived
        alignment = max(0.0, 1.0 - abs(heading_error) / 45.0)
        if dist > self.ARRIVAL_RADIUS_M:
            pitch = alignment * self.MAX_PITCH * min(1.0, dist / 20.0)
        else:
            pitch = 0.0

        # Roll stays 0 (yaw-then-pitch strategy)
        roll = 0.0

        # Throttle based on altitude error
        throttle_correction = max(-0.3, min(0.3, alt_error / 10.0 * 0.3))
        throttle = 0.55 + throttle_correction

        return {
            "pitch": round(pitch, 4),
            "roll": round(roll, 4),
            "yaw": round(yaw, 4),
            "throttle": round(throttle, 4),
            "distance_m": round(dist, 2),
            "bearing": round(target_bearing, 1),
            "heading_error": round(heading_error, 1),
            "altitude_error": round(alt_error, 2),
            "arrived": dist <= self.ARRIVAL_RADIUS_M,
        }


guidance_controller = GuidanceController()
