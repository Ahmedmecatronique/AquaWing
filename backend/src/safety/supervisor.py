from __future__ import annotations
import math
import threading
import time
from typing import List, Optional, Tuple


def _point_in_polygon(lat: float, lon: float, polygon: List[Tuple[float, float]]) -> bool:
    if len(polygon) < 3:
        return True
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > lon) != (yj > lon)) and (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


class SafetySupervisor:
    WATCHDOG_TIMEOUT_S = 5.0

    def __init__(self) -> None:
        self.enabled = True
        self.constraints = {
            "max_altitude_m":          100.0,
            "max_speed_mps":           15.0,
            "min_battery_percent":     15.0,
            "max_time_airborne_s":     3600.0,
        }
        self.geofence: List[Tuple[float, float]] = []  # empty = disabled
        self.violations: List[str] = []
        self._watchdog_last = time.monotonic()
        self._airborne_start: Optional[float] = None
        self._lock = threading.Lock()
        self._failsafe_sent = False
        self._watchdog_thread = threading.Thread(target=self._watchdog_loop, daemon=True)
        self._watchdog_thread.start()

    def feed_watchdog(self) -> None:
        with self._lock:
            self._watchdog_last = time.monotonic()

    def set_airborne(self, airborne: bool) -> None:
        with self._lock:
            if airborne and self._airborne_start is None:
                self._airborne_start = time.monotonic()
            elif not airborne:
                self._airborne_start = None

    def set_geofence(self, polygon: List[Tuple[float, float]]) -> None:
        with self._lock:
            self.geofence = polygon[:]

    def set_constraint(self, name: str, value: float) -> bool:
        if name in self.constraints:
            self.constraints[name] = value
            return True
        return False

    def check(self, drone_state: dict) -> str:
        if not self.enabled:
            return "ok"

        self.violations.clear()
        alt = drone_state.get("altitude_m", drone_state.get("alt", 0.0))
        speed = drone_state.get("speed_mps", drone_state.get("speed", 0.0))
        battery = drone_state.get("battery_percent", drone_state.get("battery", 100.0))
        lat = drone_state.get("lat", None)
        lon = drone_state.get("lon", None)

        if alt > self.constraints["max_altitude_m"]:
            self.violations.append(f"Altitude {alt:.1f}m > max {self.constraints['max_altitude_m']}m")

        if speed > self.constraints["max_speed_mps"]:
            self.violations.append(f"Speed {speed:.1f}m/s > max {self.constraints['max_speed_mps']}m/s")

        if battery < self.constraints["min_battery_percent"]:
            self.violations.append(f"Battery {battery:.1f}% < min {self.constraints['min_battery_percent']}%")

        with self._lock:
            if self._airborne_start is not None:
                elapsed = time.monotonic() - self._airborne_start
                if elapsed > self.constraints["max_time_airborne_s"]:
                    self.violations.append(f"Airborne {elapsed/60:.1f} min > max {self.constraints['max_time_airborne_s']/60:.0f} min")

            if lat is not None and lon is not None and len(self.geofence) >= 3:
                if not _point_in_polygon(lat, lon, self.geofence):
                    self.violations.append("GEOFENCE BREACH")

        self.feed_watchdog()

        if self.violations:
            print(f"[Safety] Violations: {self.violations}")
            self.trigger_failsafe()
            return "failsafe"
        return "ok"

    def trigger_failsafe(self) -> bool:
        with self._lock:
            if self._failsafe_sent:
                return True
            self._failsafe_sent = True
        print("[Safety] FAILSAFE — triggering RTL")
        try:
            from backend.src.control.flight_controller import flight_controller
            flight_controller.rtl()
        except Exception as e:
            print(f"[Safety] RTL command error: {e}")
        return True

    def reset_failsafe(self) -> None:
        with self._lock:
            self._failsafe_sent = False

    def _watchdog_loop(self) -> None:
        while True:
            time.sleep(1.0)
            with self._lock:
                elapsed = time.monotonic() - self._watchdog_last
                airborne = self._airborne_start is not None
            if airborne and elapsed > self.WATCHDOG_TIMEOUT_S and not self._failsafe_sent:
                print(f"[Safety] Watchdog: no telemetry for {elapsed:.1f}s → FAILSAFE")
                self.violations.append(f"Watchdog timeout {elapsed:.1f}s")
                self.trigger_failsafe()


safety_supervisor = SafetySupervisor()
