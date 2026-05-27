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

_RP_CAM_PROCS = ("rpicam-vid", "rpicam-still")

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


def _kill_stale_rpicam() -> None:
    """Release the camera if a previous rpicam process was left running."""
    for name in _RP_CAM_PROCS:
        subprocess.run(["pkill", "-9", name], capture_output=True, timeout=3)


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
        self._last_request_ts: float = 0.0
        self._reaper: Optional[threading.Thread] = None
        self._idle_stop_s: float = 45.0  # stop rpicam-vid when UI stops polling

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
        _kill_stale_rpicam()
        time.sleep(0.1)
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
            _kill_stale_rpicam()
            time.sleep(0.15)
            try:
                self._proc = subprocess.Popen(
                    self._build_cmd(),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    bufsize=0,
                )
            except FileNotFoundError:
                self._error = "rpicam-vid not found (install libcamera-apps)"
                return
            except Exception as exc:
                self._error = str(exc)
                return
            time.sleep(0.2)
            if self._proc.poll() is not None:
                err = ""
                if self._proc.stderr:
                    err = self._proc.stderr.read().decode(errors="replace")[:300]
                self._error = err or f"rpicam-vid exited (code {self._proc.returncode})"
                self._proc = None
                return
            self._reader = threading.Thread(target=self._reader_loop, daemon=True)
            self._reader.start()
            self._running = True
            if self._reaper is None or not self._reaper.is_alive():
                self._reaper = threading.Thread(target=self._reaper_loop, daemon=True)
                self._reaper.start()

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
        # keep last_request_ts as-is for stats

    def _reaper_loop(self) -> None:
        """Stop the camera process after a short idle window.

        Prevents the camera from being locked forever if the UI stops polling
        or a request crashes mid-stream.
        """
        while True:
            time.sleep(1.0)
            with self._lock:
                running = self._running
                last = self._last_request_ts
            if not running:
                return
            if last and (time.time() - last) > self._idle_stop_s:
                self.stop()
                return

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
        """Get a JPEG frame from the camera.
        
        Args:
            width: Target width (optional)
            height: Target height (optional)
            wait_s: Timeout in seconds
            
        Returns:
            JPEG bytes or empty bytes if failed
        """
        with self._lock:
            self._last_request_ts = time.time()
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

        err_msg = self._error or "no frame from rpicam-vid"
        try:
            return self._capture_still()
        except Exception as still_exc:
            raise RuntimeError(f"{err_msg}; still capture failed: {still_exc}") from still_exc

    def restart(self) -> None:
        """Force restart the camera capture process."""
        self.stop()
        _kill_stale_rpicam()
        time.sleep(0.25)
        with self._lock:
            self._latest = None
            self._latest_ts = 0.0
            self._error = None
        self.start()

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
                "last_request_age_s": round(time.time() - self._last_request_ts, 2)
                if self._last_request_ts
                else None,
            }


_streamer: Optional[RgbCameraStreamer] = None
_streamer_lock = threading.Lock()


def get_rgb_streamer() -> RgbCameraStreamer:
    global _streamer
    with _streamer_lock:
        if _streamer is None:
            _streamer = RgbCameraStreamer.from_config()
        return _streamer
