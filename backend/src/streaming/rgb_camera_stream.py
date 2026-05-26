"""
RGB Camera Stream — Raspberry Pi Camera (libcamera / rpicam)

Capture continue via ``rpicam-vid`` (MJPEG) et exposition de la dernière
image JPEG pour l'endpoint ``/video`` du dashboard.

Usage :
    from backend.src.streaming.rgb_camera_stream import get_rgb_streamer
    streamer = get_rgb_streamer()
    jpeg = streamer.get_jpeg(width=2304, height=1296)
"""

from __future__ import annotations

import subprocess
import threading
import time
from pathlib import Path
from typing import Optional, Tuple

import yaml

_JPEG_SOI = b"\xff\xd8"
_JPEG_EOI = b"\xff\xd9"
_DEFAULT_WIDTH = 2304
_DEFAULT_HEIGHT = 1296
_DEFAULT_FPS = 15
_DEFAULT_QUALITY = 80


def _load_rgb_config() -> dict:
    cfg_path = Path(__file__).resolve().parents[3] / "config" / "system.yaml"
    if not cfg_path.exists():
        return {}
    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return data.get("cameras", {}).get("rgb", {}) or {}
    except Exception:
        return {}


def _parse_resolution(value: str) -> Tuple[int, int]:
    normalized = value.lower().replace("×", "x").replace(" ", "")
    if "x" not in normalized:
        raise ValueError(f"Invalid resolution: {value!r}")
    w_str, h_str = normalized.split("x", 1)
    return int(w_str), int(h_str)


class RgbCameraStreamer:
    """Flux MJPEG rpicam-vid → dernière frame JPEG en mémoire."""

    def __init__(
        self,
        width: int = _DEFAULT_WIDTH,
        height: int = _DEFAULT_HEIGHT,
        fps: int = _DEFAULT_FPS,
        quality: int = _DEFAULT_QUALITY,
    ):
        self.width = width
        self.height = height
        self.fps = fps
        self.quality = quality
        self._proc: Optional[subprocess.Popen] = None
        self._reader: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._latest: Optional[bytes] = None
        self._latest_ts: float = 0.0
        self._error: Optional[str] = None
        self._running = False

    @classmethod
    def from_config(cls) -> "RgbCameraStreamer":
        cfg = _load_rgb_config()
        res = cfg.get("resolution", f"{_DEFAULT_WIDTH}x{_DEFAULT_HEIGHT}")
        width, height = _parse_resolution(str(res))
        return cls(
            width=width,
            height=height,
            fps=int(cfg.get("fps", _DEFAULT_FPS)),
            quality=int(cfg.get("quality", _DEFAULT_QUALITY)),
        )

    def _build_cmd(self) -> list[str]:
        return [
            "rpicam-vid",
            "-t",
            "0",
            "--width",
            str(self.width),
            "--height",
            str(self.height),
            "--codec",
            "mjpeg",
            "-n",
            "--inline",
            "-o",
            "-",
            "--framerate",
            str(self.fps),
            "--quality",
            str(self.quality),
        ]

    def _capture_still(self) -> bytes:
        """Capture unique (secours si le flux vidéo n'est pas prêt)."""
        cmd = [
            "rpicam-still",
            "-n",
            "-t",
            "1",
            "--width",
            str(self.width),
            "--height",
            str(self.height),
            "-o",
            "-",
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=15, check=False)
        if result.returncode != 0:
            err = (result.stderr or b"").decode(errors="replace")[:200]
            raise RuntimeError(f"rpicam-still failed: {err}")
        if not result.stdout or not result.stdout.startswith(_JPEG_SOI):
            raise RuntimeError("rpicam-still: empty or invalid JPEG")
        return bytes(result.stdout)

    def _reader_loop(self) -> None:
        assert self._proc is not None and self._proc.stdout is not None
        buf = bytearray()
        try:
            while not self._stop.is_set():
                chunk = self._proc.stdout.read(65536)
                if not chunk:
                    break
                buf.extend(chunk)
                while True:
                    start = buf.find(_JPEG_SOI)
                    if start < 0:
                        buf.clear()
                        break
                    end = buf.find(_JPEG_EOI, start + 2)
                    if end < 0:
                        if start > 0:
                            del buf[:start]
                        break
                    frame = bytes(buf[start : end + 2])
                    del buf[: end + 2]
                    with self._lock:
                        self._latest = frame
                        self._latest_ts = time.time()
        except Exception as exc:
            with self._lock:
                self._error = str(exc)
        finally:
            self._running = False

    def start(self) -> None:
        with self._lock:
            if self._running:
                return
            self._stop.clear()
            self._error = None
            try:
                self._proc = subprocess.Popen(
                    self._build_cmd(),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    bufsize=0,
                )
            except FileNotFoundError:
                self._error = "rpicam-vid not found (install libcamera-apps)"
                return
            except Exception as exc:
                self._error = str(exc)
                return
            self._reader = threading.Thread(target=self._reader_loop, daemon=True)
            self._reader.start()
            self._running = True

    def stop(self) -> None:
        self._stop.set()
        proc = self._proc
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=3)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        self._proc = None
        self._reader = None
        self._running = False

    def ensure_resolution(self, width: int, height: int) -> None:
        if width == self.width and height == self.height:
            return
        self.stop()
        self.width = width
        self.height = height
        with self._lock:
            self._latest = None
            self._latest_ts = 0.0

    def get_jpeg(
        self,
        width: Optional[int] = None,
        height: Optional[int] = None,
        wait_s: float = 3.0,
    ) -> bytes:
        if width and height:
            self.ensure_resolution(width, height)

        if not self._running:
            self.start()

        deadline = time.time() + wait_s
        while time.time() < deadline:
            with self._lock:
                if self._latest:
                    return self._latest
                if self._error and not self._running:
                    break
            time.sleep(0.05)

        with self._lock:
            if self._latest:
                return self._latest

        return self._capture_still()

    def get_stats(self) -> dict:
        with self._lock:
            return {
                "running": self._running,
                "width": self.width,
                "height": self.height,
                "fps": self.fps,
                "quality": self.quality,
                "has_frame": self._latest is not None,
                "last_frame_age_s": round(time.time() - self._latest_ts, 2)
                if self._latest_ts
                else None,
                "frame_bytes": len(self._latest) if self._latest else 0,
                "error": self._error,
            }


_streamer: Optional[RgbCameraStreamer] = None
_streamer_lock = threading.Lock()


def get_rgb_streamer() -> RgbCameraStreamer:
    global _streamer
    with _streamer_lock:
        if _streamer is None:
            _streamer = RgbCameraStreamer.from_config()
        return _streamer
