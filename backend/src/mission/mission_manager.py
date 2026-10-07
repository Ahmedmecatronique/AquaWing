from __future__ import annotations
import json
import math
import threading
import time
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional


MISSIONS_FILE = Path(__file__).parents[3] / "missions.json"


class MissionState(str, Enum):
    IDLE       = "idle"
    ARMED      = "armed"
    TAKEOFF    = "takeoff"
    NAVIGATING = "navigating"
    HOVERING   = "hovering"
    RTL        = "rtl"
    LANDING    = "landing"
    COMPLETE   = "complete"
    ABORTED    = "aborted"
    ERROR      = "error"


@dataclass
class WayPoint:
    lat: float
    lon: float
    altitude: float
    speed_mps: float = 5.0
    hover_seconds: float = 0.0
    action: str = "fly"
    completed: bool = False

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(d: dict) -> "WayPoint":
        return WayPoint(**{k: v for k, v in d.items() if k in WayPoint.__dataclass_fields__})


@dataclass
class Mission:
    name: str
    waypoints: List[WayPoint] = field(default_factory=list)
    home_lat: float = 36.8065
    home_lon: float = 10.1815
    home_alt: float = 0.0
    takeoff_alt: float = 10.0
    created_at: float = field(default_factory=time.time)
    state: MissionState = MissionState.IDLE
    current_wp_index: int = 0
    _hover_start: float = 0.0

    def add_waypoint(self, wp: WayPoint) -> None:
        self.waypoints.append(wp)

    def to_dict(self) -> dict:
        d = {
            "name": self.name,
            "waypoints": [w.to_dict() for w in self.waypoints],
            "home_lat": self.home_lat,
            "home_lon": self.home_lon,
            "home_alt": self.home_alt,
            "takeoff_alt": self.takeoff_alt,
            "created_at": self.created_at,
            "state": self.state.value,
            "current_wp_index": self.current_wp_index,
        }
        return d

    @staticmethod
    def from_dict(d: dict) -> "Mission":
        m = Mission(
            name=d.get("name", "unnamed"),
            home_lat=d.get("home_lat", 36.8065),
            home_lon=d.get("home_lon", 10.1815),
            home_alt=d.get("home_alt", 0.0),
            takeoff_alt=d.get("takeoff_alt", 10.0),
            created_at=d.get("created_at", time.time()),
            state=MissionState(d.get("state", "idle")),
            current_wp_index=d.get("current_wp_index", 0),
        )
        m.waypoints = [WayPoint.from_dict(w) for w in d.get("waypoints", [])]
        return m

    def progress_pct(self) -> float:
        total = len(self.waypoints)
        if total == 0:
            return 0.0
        done = sum(1 for w in self.waypoints if w.completed)
        return round(done / total * 100, 1)

    def current_waypoint(self) -> Optional[WayPoint]:
        if 0 <= self.current_wp_index < len(self.waypoints):
            return self.waypoints[self.current_wp_index]
        return None


class MissionManager:
    def __init__(self) -> None:
        self._missions: Dict[str, Mission] = {}
        self._active: Optional[Mission] = None
        self._lock = threading.Lock()
        self._load_all()

    def _load_all(self) -> None:
        if not MISSIONS_FILE.exists():
            return
        try:
            with open(MISSIONS_FILE, encoding="utf-8") as f:
                data = json.load(f)
            for d in data:
                m = Mission.from_dict(d)
                self._missions[m.name] = m
            print(f"[Mission] Loaded {len(self._missions)} missions from disk")
        except Exception as e:
            print(f"[Mission] Load error: {e}")

    def _save_all(self) -> None:
        try:
            with open(MISSIONS_FILE, "w", encoding="utf-8") as f:
                json.dump([m.to_dict() for m in self._missions.values()], f, indent=2)
        except Exception as e:
            print(f"[Mission] Save error: {e}")

    def create(
        self,
        name: str,
        waypoints: Optional[List[dict]] = None,
        takeoff_alt: float = 10.0,
        home_lat: float = 36.8065,
        home_lon: float = 10.1815,
    ) -> Mission:
        with self._lock:
            m = Mission(
                name=name,
                home_lat=home_lat,
                home_lon=home_lon,
                takeoff_alt=takeoff_alt,
            )
            if waypoints:
                for wp_d in waypoints:
                    m.add_waypoint(WayPoint(
                        lat=float(wp_d.get("lat", home_lat)),
                        lon=float(wp_d.get("lon", home_lon)),
                        altitude=float(wp_d.get("altitude", takeoff_alt)),
                        speed_mps=float(wp_d.get("speed", 5.0)),
                        hover_seconds=float(wp_d.get("hover", 0.0)),
                        action=str(wp_d.get("action", "fly")),
                    ))
            self._missions[name] = m
            self._save_all()
        return m

    def delete(self, name: str) -> bool:
        with self._lock:
            if name not in self._missions:
                return False
            del self._missions[name]
            self._save_all()
        return True

    def list_missions(self) -> List[dict]:
        with self._lock:
            return [m.to_dict() for m in self._missions.values()]

    def get(self, name: str) -> Optional[Mission]:
        with self._lock:
            return self._missions.get(name)

    def start(self, name: str) -> bool:
        with self._lock:
            m = self._missions.get(name)
            if not m or not m.waypoints:
                return False
            m.state = MissionState.ARMED
            m.current_wp_index = 0
            for wp in m.waypoints:
                wp.completed = False
            self._active = m
        try:
            from backend.src.control.flight_controller import flight_controller
            flight_controller.takeoff(m.takeoff_alt)
        except Exception as e:
            print(f"[Mission] Takeoff command error: {e}")
        print(f"[Mission] Started '{name}' with {len(m.waypoints)} waypoints")
        return True

    def abort(self) -> bool:
        with self._lock:
            if not self._active:
                return False
            self._active.state = MissionState.ABORTED
            self._save_all()
        try:
            from backend.src.control.flight_controller import flight_controller
            flight_controller.rtl()
        except Exception:
            pass
        self._active = None
        return True

    def update(self, current_lat: float, current_lon: float, current_alt: float, current_heading: float) -> Optional[dict]:
        with self._lock:
            if not self._active:
                return None
            m = self._active

        status = {
            "mission_name": m.name,
            "state": m.state.value,
            "progress": m.progress_pct(),
            "current_wp": m.current_wp_index,
            "total_wp": len(m.waypoints),
        }

        if m.state == MissionState.ARMED:
            m.state = MissionState.TAKEOFF

        elif m.state == MissionState.TAKEOFF:
            if abs(current_alt - m.takeoff_alt) < 1.5:
                m.state = MissionState.NAVIGATING
                self._navigate_to_current_wp(m)

        elif m.state == MissionState.NAVIGATING:
            wp = m.current_waypoint()
            if wp is None:
                m.state = MissionState.RTL
            else:
                from backend.src.navigation.guidance import guidance_controller, haversine
                dist = haversine(current_lat, current_lon, wp.lat, wp.lon)
                status["distance_to_wp_m"] = round(dist, 1)
                if dist <= 3.0 and abs(current_alt - wp.altitude) <= 2.0:
                    wp.completed = True
                    if wp.hover_seconds > 0:
                        m.state = MissionState.HOVERING
                        m._hover_start = time.time()
                    else:
                        m.current_wp_index += 1
                        if m.current_wp_index >= len(m.waypoints):
                            m.state = MissionState.RTL
                        else:
                            self._navigate_to_current_wp(m)

        elif m.state == MissionState.HOVERING:
            wp = m.current_waypoint()
            if wp and time.time() - m._hover_start >= wp.hover_seconds:
                m.current_wp_index += 1
                if m.current_wp_index >= len(m.waypoints):
                    m.state = MissionState.RTL
                else:
                    m.state = MissionState.NAVIGATING
                    self._navigate_to_current_wp(m)

        elif m.state == MissionState.RTL:
            from backend.src.navigation.guidance import guidance_controller, haversine
            guidance_controller.set_target(m.home_lat, m.home_lon, m.takeoff_alt)
            guidance_controller.enable()
            dist = haversine(current_lat, current_lon, m.home_lat, m.home_lon)
            if dist <= 3.0:
                m.state = MissionState.LANDING
                try:
                    from backend.src.control.flight_controller import flight_controller
                    flight_controller.land()
                except Exception:
                    pass

        elif m.state in (MissionState.COMPLETE, MissionState.ABORTED):
            guidance_controller = None
            try:
                from backend.src.navigation.guidance import guidance_controller
                if guidance_controller:
                    guidance_controller.disable()
            except Exception:
                pass
            with self._lock:
                self._save_all()
                self._active = None
            return status

        return status

    def _navigate_to_current_wp(self, m: Mission) -> None:
        wp = m.current_waypoint()
        if not wp:
            return
        try:
            from backend.src.navigation.guidance import guidance_controller
            guidance_controller.set_target(wp.lat, wp.lon, wp.altitude)
            guidance_controller.enable()
        except Exception as e:
            print(f"[Mission] Guidance error: {e}")

    @property
    def active(self) -> Optional[Mission]:
        with self._lock:
            return self._active

    def status(self) -> dict:
        with self._lock:
            if not self._active:
                return {"active": False}
            m = self._active
            return {
                "active": True,
                "name": m.name,
                "state": m.state.value,
                "progress": m.progress_pct(),
                "current_wp": m.current_wp_index,
                "total_wp": len(m.waypoints),
            }


mission_manager = MissionManager()
