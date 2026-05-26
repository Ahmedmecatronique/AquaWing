"""
Service de détection RGB — analyse périodique du flux caméra (personnes en mer).

Module IA : ``backend/src/ia detection/``
"""

from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any, Optional

import yaml

from rfdetr_engine import get_person_detector

from backend.src.streaming.rgb_camera_stream import get_rgb_streamer

_PROJECT_ROOT = Path(__file__).resolve().parent.parents[2]
_worker: Optional["RgbDetectionWorker"] = None
_worker_lock = threading.Lock()


def _load_detection_config() -> dict:
    cfg_path = _PROJECT_ROOT / "config" / "system.yaml"
    if not cfg_path.exists():
        return {}
    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return data.get("detection", {}) or {}
    except Exception:
        return {}


class RgbDetectionWorker:
    """Thread d'analyse IA sur la dernière frame RGB."""

    def __init__(self, interval_s: float = 1.5):
        cfg = _load_detection_config()
        self.enabled = bool(cfg.get("enabled", True))
        self.interval_s = float(cfg.get("interval_ms", interval_s * 1000)) / 1000.0
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._detections: list[dict[str, Any]] = []
        self._updated_at: float = 0.0
        self._running = False
        self._error: Optional[str] = None
        self._frame_size = (0, 0)

    def start(self) -> None:
        if not self.enabled or self._running:
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="rgb-detection")
        self._thread.start()
        self._running = True

    def stop(self) -> None:
        self._stop.set()
        self._running = False

    def _loop(self) -> None:
        detector = get_person_detector()
        streamer = get_rgb_streamer()
        while not self._stop.is_set():
            try:
                jpeg = streamer.get_jpeg(width=streamer.width, height=streamer.height, wait_s=2.0)
                dets = detector.detect_jpeg(jpeg)
                with self._lock:
                    self._detections = dets
                    self._updated_at = time.time()
                    self._frame_size = (streamer.width, streamer.height)
                    self._error = None
            except Exception as exc:
                with self._lock:
                    self._error = str(exc)
            self._stop.wait(self.interval_s)

    def get_result(self) -> dict[str, Any]:
        with self._lock:
            return {
                "detections": list(self._detections),
                "count": len(self._detections),
                "updated_at": self._updated_at,
                "frame_width": self._frame_size[0],
                "frame_height": self._frame_size[1],
                "error": self._error,
                "enabled": self.enabled,
                "running": self._running,
            }


def get_rgb_detection_worker() -> RgbDetectionWorker:
    global _worker
    with _worker_lock:
        if _worker is None:
            _worker = RgbDetectionWorker()
        return _worker
