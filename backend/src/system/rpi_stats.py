"""Lecture des capteurs système du Raspberry Pi (température CPU, etc.)."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

_THERMAL_PATHS = (
    Path("/sys/class/thermal/thermal_zone0/temp"),
    Path("/sys/devices/virtual/thermal/thermal_zone0/temp"),
)


def read_rpi_cpu_temp_c() -> Optional[float]:
    """Température CPU en °C (Linux thermal zone), ou None si indisponible."""
    for path in _THERMAL_PATHS:
        try:
            if not path.exists():
                continue
            raw = path.read_text(encoding="utf-8").strip()
            millideg = int(raw)
            return round(millideg / 1000.0, 1)
        except (OSError, ValueError):
            continue
    return None


def cpu_temp_level(temp_c: Optional[float]) -> str:
    """Niveau d'alerte pour l'UI : ok | warn | critical | unknown."""
    if temp_c is None:
        return "unknown"
    if temp_c >= 75.0:
        return "critical"
    if temp_c >= 60.0:
        return "warn"
    return "ok"
