"""
Detecteur personnes YOLOv8 optimise pour surveillance maritime drone.

Ameliorations vs version initiale:
- imgsz 320 -> 640 (bien meilleur pour petites personnes en mer)
- Preprocessing CLAHE (rehaussement contraste pour eau)
- NMS iou=0.45 (evite doublons sur corps semi-immerges)
- Confidence 0.4 -> 0.45 (reduit faux positifs vagues)
"""

from __future__ import annotations

import io
import threading
import time
from pathlib import Path
from typing import Any, Optional

import yaml
from PIL import Image

_IA_ROOT = Path(__file__).resolve().parent
_PROJECT_ROOT = _IA_ROOT.parents[2]
_PERSON_COLOR = "#ff9f1a"
_COCO_PERSON_ID = 0


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


def _clahe_enhance(image: Image.Image) -> Image.Image:
    """Apply CLAHE contrast enhancement for aquatic environment."""
    try:
        import cv2
        import numpy as np

        img_array = np.array(image)
        img_bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
        lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
        l_ch, a_ch, b_ch = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_ch = clahe.apply(l_ch)
        lab = cv2.merge((l_ch, a_ch, b_ch))
        enhanced_bgr = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        enhanced_rgb = cv2.cvtColor(enhanced_bgr, cv2.COLOR_BGR2RGB)
        return Image.fromarray(enhanced_rgb)
    except Exception:
        return image


class YoloPersonDetector:
    """Detecteur personnes YOLOv8 optimise milieu aquatique."""

    def __init__(
        self,
        weights_path: Optional[Path] = None,
        threshold: Optional[float] = None,
        inference_size: Optional[int] = None,
    ):
        cfg = _load_detection_config()
        model = cfg.get("model") or cfg.get("yolo_weights") or "yolov8n.pt"
        weights = weights_path or Path(model)
        if not weights.is_absolute():
            weights = _PROJECT_ROOT / weights

        self.weights_path = weights
        self.threshold = float(
            threshold if threshold is not None else cfg.get("confidence", cfg.get("threshold", 0.45))
        )
        # imgsz 640 par defaut — bien meilleur pour detection en mer
        self.inference_size = int(
            inference_size if inference_size is not None else cfg.get("imgsz", cfg.get("inference_size", 640))
        )
        self._model = None
        self._lock = threading.Lock()
        self._ready = False
        self._error: Optional[str] = None
        self._last_inference_ms: Optional[float] = None

    def _load_model(self) -> None:
        if self._ready or self._model is not None:
            return
        try:
            from ultralytics import YOLO

            path = str(self.weights_path)
            if not self.weights_path.exists() and self.weights_path.name == path:
                path = self.weights_path.name

            self._model = YOLO(path)
            self._ready = True
            self._error = None
            print(f"YOLO loaded ({path}) imgsz={self.inference_size}")
        except Exception as exc:
            self._error = str(exc)
            self._ready = False
            raise

    def detect_jpeg(self, jpeg_bytes: bytes, image_width: int = 0, image_height: int = 0) -> list:
        with self._lock:
            self._load_model()

        if not jpeg_bytes:
            return []

        t0 = time.perf_counter()
        image = Image.open(io.BytesIO(jpeg_bytes)).convert("RGB")
        src_w, src_h = image.size

        # CLAHE preprocessing for aquatic environment
        image = _clahe_enhance(image)

        results = self._model.predict(
            source=image,
            imgsz=self.inference_size,
            conf=self.threshold,
            iou=0.45,
            classes=[_COCO_PERSON_ID],
            verbose=False,
            augment=False,
        )
        self._last_inference_ms = round((time.perf_counter() - t0) * 1000, 1)

        out = []
        if not results:
            return out

        boxes = results[0].boxes
        if boxes is None or len(boxes) == 0:
            return out

        xyxy = boxes.xyxy.cpu().numpy()
        confs = boxes.conf.cpu().numpy()

        nw = max(src_w, 1)
        nh = max(src_h, 1)
        for i, (x1, y1, x2, y2) in enumerate(xyxy):
            conf = float(confs[i]) if i < len(confs) else 0.0
            out.append(
                {
                    "x": max(0.0, min(1.0, float(x1) / nw)),
                    "y": max(0.0, min(1.0, float(y1) / nh)),
                    "w": max(0.0, min(1.0, (float(x2) - float(x1)) / nw)),
                    "h": max(0.0, min(1.0, (float(y2) - float(y1)) / nh)),
                    "label": "PERSONNE",
                    "conf": round(conf * 100),
                    "color": "#22c55e",
                    "status": "person",
                    "alert": False,
                    "can_swim": False,
                    "swim_skill": "unknown",
                    "behavior": "detected_only",
                    "class": "person",
                }
            )
        return out

    def get_stats(self) -> dict:
        return {
            "ready": self._ready,
            "error": self._error,
            "backend": "yolo",
            "weights": str(self.weights_path),
            "threshold": self.threshold,
            "inference_size": self.inference_size,
            "last_inference_ms": self._last_inference_ms,
        }
