from __future__ import annotations
import math
import threading
import time
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class GPSFix:
    lat: float = 36.8065
    lon: float = 10.1815
    altitude: float = 0.0
    speed_mps: float = 0.0
    heading: float = 0.0
    satellites: int = 0
    hdop: float = 99.0
    valid: bool = False
    timestamp: float = field(default_factory=time.time)


def _parse_lat_lon(value: str, direction: str) -> float:
    if not value:
        return 0.0
    deg_len = 2 if direction in ("N", "S") else 3
    deg = float(value[:deg_len])
    minutes = float(value[deg_len:])
    decimal = deg + minutes / 60.0
    if direction in ("S", "W"):
        decimal = -decimal
    return decimal


class GPSModule:
    def __init__(self) -> None:
        self._fix = GPSFix()
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._hw = False
        self._sim_angle = 0.0

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False

    def get_fix(self) -> GPSFix:
        with self._lock:
            import copy
            return copy.copy(self._fix)

    def _run(self) -> None:
        try:
            import serial
            from config.cablage import GPS as _GPS_CFG
            ser = serial.Serial(
                port=_GPS_CFG["port"],
                baudrate=_GPS_CFG["baudrate"],
                timeout=1.0,
            )
            self._hw = True
            print(f"[GPS] Hardware connected on {_GPS_CFG['port']}")
            self._read_nmea_loop(ser)
        except Exception as e:
            print(f"[GPS] Hardware unavailable ({e}), using simulation")
            self._simulation_loop()

    def _read_nmea_loop(self, ser) -> None:
        while self._running:
            try:
                raw = ser.readline().decode("ascii", errors="replace").strip()
                if raw.startswith("$GPRMC") or raw.startswith("$GNRMC"):
                    self._parse_rmc(raw)
                elif raw.startswith("$GPGGA") or raw.startswith("$GNGGA"):
                    self._parse_gga(raw)
            except Exception:
                time.sleep(0.1)

    def _parse_rmc(self, sentence: str) -> None:
        try:
            parts = sentence.split(",")
            if len(parts) < 9 or parts[2] != "A":
                with self._lock:
                    self._fix.valid = False
                return
            lat = _parse_lat_lon(parts[3], parts[4])
            lon = _parse_lat_lon(parts[5], parts[6])
            speed_knots = float(parts[7]) if parts[7] else 0.0
            heading = float(parts[8].split("*")[0]) if parts[8] else 0.0
            with self._lock:
                self._fix.lat = lat
                self._fix.lon = lon
                self._fix.speed_mps = speed_knots * 0.5144
                self._fix.heading = heading
                self._fix.valid = True
                self._fix.timestamp = time.time()
        except Exception:
            pass

    def _parse_gga(self, sentence: str) -> None:
        try:
            parts = sentence.split(",")
            if len(parts) < 10:
                return
            alt_str = parts[9]
            sats_str = parts[7]
            hdop_str = parts[8]
            with self._lock:
                if alt_str:
                    self._fix.altitude = float(alt_str)
                if sats_str:
                    self._fix.satellites = int(sats_str)
                if hdop_str:
                    self._fix.hdop = float(hdop_str)
        except Exception:
            pass

    def _simulation_loop(self) -> None:
        radius = 0.005
        while self._running:
            self._sim_angle = (self._sim_angle + 1.0) % 360.0
            a = math.radians(self._sim_angle)
            with self._lock:
                self._fix.lat = 36.8065 + radius * math.cos(a)
                self._fix.lon = 10.1815 + radius * math.sin(a)
                self._fix.altitude = 15.0 + 5.0 * math.sin(a)
                self._fix.heading = self._sim_angle
                self._fix.speed_mps = 2.5
                self._fix.satellites = 8
                self._fix.hdop = 1.2
                self._fix.valid = True
                self._fix.timestamp = time.time()
            time.sleep(0.5)


_gps_instance: Optional[GPSModule] = None
_gps_lock = threading.Lock()


def get_gps_module() -> GPSModule:
    global _gps_instance
    with _gps_lock:
        if _gps_instance is None:
            _gps_instance = GPSModule()
            _gps_instance.start()
    return _gps_instance
