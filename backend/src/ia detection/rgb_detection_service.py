"""
Service de détection RGB — analyse périodique du flux caméra (personnes en mer).
"""

from __future__ import annotations

import sys
import threading
import time
from pathlib import Path
from typing import Any, Optional

import yaml

try:
    from backend.src.streaming.rgb_camera_stream import get_rgb_streamer
except ImportError:
    _streaming_path = Path(__file__).resolve().parent.parent / "streaming"
    if str(_streaming_path) not in sys.path:
        sys.path.insert(0, str(_streaming_path))
    from rgb_camera_stream import get_rgb_streamer

_perception = Path(__file__).resolve().parent.parent / "perception"
if str(_perception) not in sys.path:
    sys.path.insert(0, str(_perception))

from detection_manager import get_detection_manager  # noqa: E402

try:
    from drowning_overlay import analyze_frame_with_drowning
except ImportError:
    from backend.src.ia_detection.drowning_overlay import analyze_frame_with_drowning  # type: ignore

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
    """Thread d'analyse IA sur la dernière frame RGB (interval_ms, pas chaque frame)."""

    def __init__(self, interval_s: float = 5.0):
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
        self._alert_count = 0

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
        manager = get_detection_manager()
        try:
            streamer = get_rgb_streamer()
        except Exception as e:
            with self._lock:
                self._error = f"Failed to initialize streamer: {e}"
            return

        while not self._stop.is_set():
            try:
                jpeg = streamer.get_jpeg(wait_s=2.0)
                if jpeg:
                    fw, fh = streamer.width, streamer.height
                    dets = analyze_frame_with_drowning(jpeg, fw, fh)
                    if dets is None:
                        detector = manager.get_detector()
                        dets = detector.detect_jpeg(jpeg)
                    alert_n = sum(1 for d in dets if d.get("status") == "drowning" or d.get("alert"))
                    with self._lock:
                        self._detections = dets
                        self._alert_count = alert_n
                        self._updated_at = time.time()
                        self._frame_size = (fw, fh)
                        self._error = None
            except Exception as exc:
                with self._lock:
                    self._error = str(exc)
                print(f"RGB detection worker error: {exc}")
            self._stop.wait(self.interval_s)

    def get_result(self) -> dict[str, Any]:
        with self._lock:
            worker_part = {
                "detections": list(self._detections),
                "count": len(self._detections),
                "alert_count": self._alert_count,
                "person_count": max(0, len(self._detections) - self._alert_count),
                "updated_at": self._updated_at,
                "frame_width": self._frame_size[0],
                "frame_height": self._frame_size[1],
                "error": self._error,
                "enabled": self.enabled,
                "running": self._running,
            }
        status = get_detection_manager().get_status(
            detections=worker_part["detections"],
            count=worker_part["count"],
            running=worker_part["running"],
            worker_error=worker_part["error"],
        )
        status.update(
            {
                "updated_at": worker_part["updated_at"],
                "frame_width": worker_part["frame_width"],
                "frame_height": worker_part["frame_height"],
                "alert_count": worker_part["alert_count"],
                "person_count": worker_part["person_count"],
            }
        )
        return status


def get_rgb_detection_worker() -> RgbDetectionWorker:
    global _worker
    with _worker_lock:
        if _worker is None:
            _worker = RgbDetectionWorker()
        return _worker
