"""
YOLOv8-based person detector for aerial swimmer detection.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import numpy as np

from ia_prediction import config

logger = logging.getLogger(__name__)

_PERSON_CLASS_IDS = {0}  # COCO "person"


class SwimmerDetector:
    """Singleton YOLOv8 detector filtered to person class only."""

    _instance: Optional["SwimmerDetector"] = None

    def __new__(cls) -> "SwimmerDetector":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._model = None
            cls._instance._initialized = False
        return cls._instance

    def _load_model(self) -> None:
        if self._initialized:
            return
        from ultralytics import YOLO

        weights = config.MODEL_WEIGHTS
        logger.info("Loading YOLO weights from %s on %s", weights, config.DEVICE)
        self._model = YOLO(weights)
        self._initialized = True

    def detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Run detection on a BGR frame.

        Returns:
            List of dicts with keys x1, y1, x2, y2, confidence.
        """
        if frame is None or frame.size == 0:
            return []

        self._load_model()
        results = self._model.predict(
            frame,
            conf=config.CONFIDENCE_THRESHOLD,
            verbose=False,
            device=config.DEVICE,
        )

        detections: List[Dict[str, Any]] = []
        if not results:
            return detections

        boxes = results[0].boxes
        if boxes is None or len(boxes) == 0:
            return detections

        xyxy = boxes.xyxy.cpu().numpy()
        confs = boxes.conf.cpu().numpy()
        clss = boxes.cls.cpu().numpy().astype(int)

        for box, conf, cls_id in zip(xyxy, confs, clss):
            if cls_id not in _PERSON_CLASS_IDS:
                continue
            if float(conf) < config.CONFIDENCE_THRESHOLD:
                continue
            x1, y1, x2, y2 = (float(v) for v in box)
            detections.append(
                {
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                    "confidence": float(conf),
                }
            )

        return detections


def get_detector() -> SwimmerDetector:
    """Return the shared detector singleton."""
    return SwimmerDetector()
