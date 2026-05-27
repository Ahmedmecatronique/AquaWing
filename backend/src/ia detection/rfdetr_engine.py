"""
RF-DETR inference engine — détection de personnes (COCO) sur images JPEG/bytes.

Situé dans ``backend/src/ia detection/`` (module IA, séparé de perception).
"""

from __future__ import annotations

import io
import sys
import threading
import time
from pathlib import Path
from typing import Any, Optional

import yaml
from PIL import Image

_IA_ROOT = Path(__file__).resolve().parent
_RFDETR_ROOT = _IA_ROOT / "rf-detr-develop"
_RFDETR_SRC = _RFDETR_ROOT / "src"
_DEFAULT_WEIGHTS = _RFDETR_ROOT / "rf-detr-nano.pth"
_PROJECT_ROOT = _IA_ROOT.parents[2]
_PERSON_LABELS = frozenset({"person", "swimmer", "human"})
_PERSON_COLOR = "#ff9f1a"


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


def _ensure_rfdetr_path() -> None:
    src = str(_RFDETR_SRC)
    if src not in sys.path:
        sys.path.insert(0, src)


class RfDetrPersonDetector:
    """Détecteur de personnes basé sur RF-DETR Nano."""

    def __init__(
        self,
        weights_path: Optional[Path] = None,
        threshold: float = 0.45,
        inference_size: int = 560,
    ):
        cfg = _load_detection_config()
        weights = weights_path or Path(cfg.get("weights", _DEFAULT_WEIGHTS))
        if not weights.is_absolute():
            weights = _PROJECT_ROOT / weights

        self.weights_path = weights
        self.threshold = float(cfg.get("threshold", threshold))
        self.inference_size = int(cfg.get("inference_size", inference_size))
        self._model = None
        self._lock = threading.Lock()
        self._ready = False
        self._error: Optional[str] = None
        self._last_inference_ms: Optional[float] = None

    def _load_model(self) -> None:
        if self._ready or self._model is not None:
            return
        try:
            _ensure_rfdetr_path()
            import torch
            from rfdetr import RFDETR

            if not self.weights_path.exists():
                raise FileNotFoundError(f"RF-DETR weights not found: {self.weights_path}")

            self._model = RFDETR.from_checkpoint(str(self.weights_path))
            try:
                self._model.optimize_for_inference(compile=False)
            except Exception as opt_exc:
                print(f"RF-DETR: optimize_for_inference skipped ({opt_exc})")
            self._ready = True
            self._error = None
            print(
                f"✓ RF-DETR loaded from {self.weights_path.name} "
                f"(cuda={getattr(torch, 'cuda', None) and torch.cuda.is_available()})"
            )
        except Exception as exc:
            self._error = str(exc)
            self._ready = False
            raise

    def detect_jpeg(self, jpeg_bytes: bytes, image_width: int = 0, image_height: int = 0) -> list[dict[str, Any]]:
        """Analyse une image JPEG — personnes en mer (coords normalisées 0–1)."""
        with self._lock:
            self._load_model()

        if not jpeg_bytes:
            return []

        t0 = time.perf_counter()
        image = Image.open(io.BytesIO(jpeg_bytes)).convert("RGB")
        src_w, src_h = image.size

        detections = self._model.predict(
            image,
            threshold=self.threshold,
            shape=(self.inference_size, self.inference_size),
            include_source_image=False,
        )
        self._last_inference_ms = round((time.perf_counter() - t0) * 1000, 1)

        results: list[dict[str, Any]] = []
        if detections is None or len(detections) == 0:
            return results

        confidences = detections.confidence if detections.confidence is not None else []
        class_ids = detections.class_id if detections.class_id is not None else []
        class_names = None
        if detections.data and "class_name" in detections.data:
            class_names = detections.data["class_name"]

        for idx, xyxy in enumerate(detections.xyxy):
            label = "person"
            if class_names is not None and idx < len(class_names):
                label = str(class_names[idx]).lower()
            elif idx < len(class_ids):
                from rfdetr.assets.coco_classes import COCO_CLASS_NAMES

                cid = int(class_ids[idx])
                if 0 <= cid < len(COCO_CLASS_NAMES):
                    label = str(COCO_CLASS_NAMES[cid]).lower()

            if label not in _PERSON_LABELS:
                continue

            conf = float(confidences[idx]) if idx < len(confidences) else 0.0
            x1, y1, x2, y2 = (float(v) for v in xyxy)
            nw = max(src_w, 1)
            nh = max(src_h, 1)
            results.append(
                {
                    "x": max(0.0, min(1.0, x1 / nw)),
                    "y": max(0.0, min(1.0, y1 / nh)),
                    "w": max(0.0, min(1.0, (x2 - x1) / nw)),
                    "h": max(0.0, min(1.0, (y2 - y1) / nh)),
                    "label": "Personne en mer",
                    "conf": round(conf * 100),
                    "color": _PERSON_COLOR,
                    "class": label,
                }
            )

        return results

    def get_stats(self) -> dict:
        return {
            "ready": self._ready,
            "error": self._error,
            "backend": "rfdetr",
            "weights": str(self.weights_path),
            "threshold": self.threshold,
            "inference_size": self.inference_size,
            "last_inference_ms": self._last_inference_ms,
        }


_detector: Optional[RfDetrPersonDetector] = None
_detector_lock = threading.Lock()


def get_person_detector() -> RfDetrPersonDetector:
    """Legacy — préférer ``person_detector.get_person_detector()``."""
    from person_detector import get_person_detector as _get

    return _get()  # type: ignore[return-value]
