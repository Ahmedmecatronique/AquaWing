"""
Gestionnaire central IA RGB — sélection YOLO / RF-DETR avec fallback anti-crash (Pi 4).

RF-DETR est testé dans un sous-processus avant activation (évite SIGILL dans uvicorn).
"""

from __future__ import annotations

import platform
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Optional

import yaml

_SRC_ROOT = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _SRC_ROOT.parents[1]
_IA_DIR = _SRC_ROOT / "ia detection"
_RFDETR_SRC = _IA_DIR / "rf-detr-develop" / "src"

_PROBE_CACHE: dict[str, Any] = {"checked": False, "ok": False, "reason": None}

_BACKEND_ALIASES = {
    "yolo": "yolo",
    "ultralytics": "yolo",
    "yolov8": "yolo",
    "yolov8n": "yolo",
    "rfdetr": "rfdetr",
    "rf-detr": "rfdetr",
    "rf_detr": "rfdetr",
    "auto": "auto",
}


def _load_detection_config() -> dict[str, Any]:
    cfg_path = _PROJECT_ROOT / "config" / "system.yaml"
    if not cfg_path.exists():
        return {}
    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return dict(data.get("detection", {}) or {})
    except Exception:
        return {}


def _normalize_backend(value: str) -> str:
    key = str(value or "auto").strip().lower()
    return _BACKEND_ALIASES.get(key, key)


def is_raspberry_pi() -> bool:
    machine = platform.machine().lower()
    if machine in ("aarch64", "armv7l", "armv8", "arm64"):
        return True
    try:
        with open("/proc/device-tree/model", "rb") as f:
            return b"Raspberry Pi" in f.read()
    except OSError:
        return False


def platform_label() -> str:
    if is_raspberry_pi():
        return "raspberry_pi_4"
    return platform.machine() or "unknown"


def _ensure_ia_path() -> None:
    ia = str(_IA_DIR)
    if ia not in sys.path:
        sys.path.insert(0, ia)


def probe_rfdetr_subprocess(force: bool = False) -> tuple[bool, Optional[str]]:
    """Teste l'import rfdetr dans un sous-processus (SIGILL ne tue pas le serveur)."""
    global _PROBE_CACHE
    if _PROBE_CACHE["checked"] and not force:
        return bool(_PROBE_CACHE["ok"]), _PROBE_CACHE["reason"]

    cfg = _load_detection_config()
    if is_raspberry_pi() and not bool(cfg.get("allow_rfdetr_on_pi", False)):
        reason = "RF-DETR disabled on Raspberry Pi (detection.allow_rfdetr_on_pi=false)"
        _PROBE_CACHE.update({"checked": True, "ok": False, "reason": reason})
        return False, reason

    rfdetr_src = str(_RFDETR_SRC)
    probe_code = (
        "import sys\n"
        f"sys.path.insert(0, {rfdetr_src!r})\n"
        "import rfdetr\n"
        "print('ok')\n"
    )
    try:
        proc = subprocess.run(
            [sys.executable, "-c", probe_code],
            cwd=str(_PROJECT_ROOT),
            capture_output=True,
            text=True,
            timeout=90,
        )
    except subprocess.TimeoutExpired:
        reason = "RF-DETR probe timed out"
        _PROBE_CACHE.update({"checked": True, "ok": False, "reason": reason})
        return False, reason
    except Exception as exc:
        reason = f"RF-DETR probe failed: {exc}"
        _PROBE_CACHE.update({"checked": True, "ok": False, "reason": reason})
        return False, reason

    if proc.returncode == 132:
        reason = "SIGILL: RF-DETR incompatible with this CPU (ARM / Raspberry Pi)"
    elif proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()[:300]
        reason = err or f"RF-DETR import exit code {proc.returncode}"
    else:
        _PROBE_CACHE.update({"checked": True, "ok": True, "reason": None})
        return True, None

    _PROBE_CACHE.update({"checked": True, "ok": False, "reason": reason})
    return False, reason


def invalidate_rfdetr_probe() -> None:
    _PROBE_CACHE["checked"] = False


class DetectionManager:
    """Sélection backend, chargement détecteur, fallback YOLO."""

    def __init__(self) -> None:
        cfg = _load_detection_config()
        self.enabled = bool(cfg.get("enabled", True))
        self._config = cfg
        self._lock = threading.Lock()
        self._requested_backend = _normalize_backend(cfg.get("backend", "auto"))
        self._active_backend: Optional[str] = None
        self._detector: Any = None
        self._fallback_used = False
        self._fallback_reason: Optional[str] = None
        self._load_error: Optional[str] = None
        self._rfdetr_available: Optional[bool] = None
        self._rfdetr_unavailable_reason: Optional[str] = None

    def reload_config(self) -> None:
        with self._lock:
            self._config = _load_detection_config()
            self.enabled = bool(self._config.get("enabled", True))
            if self._requested_backend == "auto":
                self._requested_backend = _normalize_backend(self._config.get("backend", "auto"))

    def _preferred_fallback(self) -> tuple[str, str]:
        cfg = self._config
        preferred = _normalize_backend(cfg.get("preferred_backend", "yolo"))
        fallback = _normalize_backend(cfg.get("fallback_backend", "yolo"))
        if preferred not in ("yolo", "rfdetr"):
            preferred = "yolo"
        if fallback not in ("yolo", "rfdetr"):
            fallback = "yolo"
        return preferred, fallback

    def _resolve_auto_backend(self) -> str:
        preferred, _ = self._preferred_fallback()
        if is_raspberry_pi():
            return preferred if preferred == "yolo" else "yolo"
        ok, _ = probe_rfdetr_subprocess()
        return "rfdetr" if ok else preferred

    def _resolve_requested_to_target(self, requested: str) -> str:
        req = _normalize_backend(requested)
        if req == "auto":
            return self._resolve_auto_backend()
        if req == "rfdetr":
            ok, reason = probe_rfdetr_subprocess()
            self._rfdetr_available = ok
            self._rfdetr_unavailable_reason = reason
            if not ok:
                return self._preferred_fallback()[1]
            return "rfdetr"
        return "yolo"

    def _reset_detector_unlocked(self) -> None:
        self._detector = None
        self._active_backend = None
        self._load_error = None

    def _create_detector(self, backend: str) -> Any:
        _ensure_ia_path()
        if backend == "yolo":
            from yolo_engine import YoloPersonDetector

            return YoloPersonDetector()
        from rfdetr_engine import RfDetrPersonDetector

        return RfDetrPersonDetector()

    def get_detector(self, force_reload: bool = False) -> Any:
        """Retourne le détecteur actif ; fallback YOLO si RF-DETR échoue."""
        with self._lock:
            requested_norm = self._requested_backend
            target = self._resolve_requested_to_target(requested_norm)
            fallback_fb, _ = self._preferred_fallback()

            if requested_norm == "rfdetr" and target != "rfdetr":
                self._fallback_used = True
                self._fallback_reason = (
                    self._rfdetr_unavailable_reason
                    or "RF-DETR unavailable on this Raspberry Pi. Fallback to YOLOv8n."
                )

            if (
                not force_reload
                and self._detector is not None
                and self._active_backend == target
            ):
                return self._detector

            if not (requested_norm == "rfdetr" and target != "rfdetr"):
                self._fallback_used = False
                self._fallback_reason = None
            self._load_error = None

            try:
                self._detector = self._create_detector(target)
                self._active_backend = target
                return self._detector
            except Exception as exc:
                self._load_error = str(exc)
                if target != fallback_fb:
                    self._fallback_used = True
                    self._fallback_reason = (
                        f"{target.upper()} load failed: {exc}; using {fallback_fb.upper()}"
                    )
                    print(f"⚠️ Detection fallback: {self._fallback_reason}")
                    self._detector = self._create_detector(fallback_fb)
                    self._active_backend = fallback_fb
                    return self._detector
                raise

    def set_requested_backend(self, backend: str) -> dict[str, Any]:
        """Change le backend demandé et réinitialise le détecteur."""
        req = _normalize_backend(backend)
        if req not in ("auto", "yolo", "rfdetr"):
            raise ValueError(f"Invalid backend: {backend}")

        with self._lock:
            self._requested_backend = req
            self._reset_detector_unlocked()
            if req == "rfdetr":
                invalidate_rfdetr_probe()

        # Résolution immédiate (peut fallback)
        try:
            self.get_detector(force_reload=True)
        except Exception as exc:
            self._load_error = str(exc)

        return self.get_status()

    def get_backends_info(self) -> dict[str, Any]:
        rfdetr_ok, rfdetr_reason = probe_rfdetr_subprocess()
        active = self._active_backend or self._resolve_requested_to_target(self._requested_backend)
        available = ["yolo"]
        notes: dict[str, str] = {
            "yolo": "Recommended for Raspberry Pi 4 (YOLOv8n, imgsz 320)",
            "rfdetr": "Heavy model; high accuracy on x86 PC",
        }
        if rfdetr_ok:
            available.append("rfdetr")
        else:
            notes["rfdetr"] = rfdetr_reason or "RF-DETR unavailable on this platform"

        return {
            "available": available,
            "recommended": "yolo" if is_raspberry_pi() else ("rfdetr" if rfdetr_ok else "yolo"),
            "active": active,
            "requested": self._requested_backend,
            "platform": platform_label(),
            "rfdetr_probe_ok": rfdetr_ok,
            "rfdetr_unavailable_reason": rfdetr_reason,
            "notes": notes,
        }

    def get_status(
        self,
        *,
        detections: Optional[list] = None,
        count: Optional[int] = None,
        running: bool = False,
        worker_error: Optional[str] = None,
    ) -> dict[str, Any]:
        with self._lock:
            selected = self._resolve_requested_to_target(self._requested_backend)
            active = self._active_backend or selected
            ready = False
            last_ms = None
            det_stats: dict[str, Any] = {}

            if self._detector is not None:
                try:
                    det_stats = self._detector.get_stats()
                    ready = bool(det_stats.get("ready"))
                    last_ms = det_stats.get("last_inference_ms")
                except Exception:
                    pass

            err = worker_error or self._load_error or det_stats.get("error")
            if self._fallback_used and self._fallback_reason:
                fb_msg = self._fallback_reason
            else:
                fb_msg = None

            return {
                "enabled": self.enabled,
                "running": running,
                "ready": ready,
                "selected_backend": selected,
                "requested_backend": self._requested_backend,
                "active_backend": active,
                "fallback_used": self._fallback_used,
                "fallback_reason": fb_msg,
                "detections": list(detections or []),
                "count": count if count is not None else len(detections or []),
                "error": err,
                "last_inference_ms": last_ms,
                "detector": det_stats,
                "platform": platform_label(),
                "config": {
                    "model": self._config.get("model", "yolov8n.pt"),
                    "imgsz": int(self._config.get("imgsz", 320)),
                    "confidence": float(self._config.get("confidence", 0.4)),
                    "interval_ms": int(self._config.get("interval_ms", 5000)),
                },
            }


_manager: Optional[DetectionManager] = None
_manager_lock = threading.Lock()


def get_detection_manager() -> DetectionManager:
    global _manager
    with _manager_lock:
        if _manager is None:
            _manager = DetectionManager()
        return _manager


def reset_person_detector_singleton() -> None:
    """Compatibilité : invalide le cache person_detector."""
    try:
        import person_detector as pd  # type: ignore

        pd._detector = None  # noqa: SLF001
    except Exception:
        pass
