"""
Object Detection (perception) — délègue l'IA au module ``ia detection``.

La logique RF-DETR vit dans ``backend/src/ia detection/``.
"""

from __future__ import annotations

from typing import Any, Optional


class ObjectDetector:
    """Interface perception ; l'inférence IA est dans ``backend.src.ia_detection``."""

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path
        self.enabled = False

    def detect(self, image_data: bytes, width: int = 0, height: int = 0) -> list[dict[str, Any]]:
        if not self.enabled or not image_data:
            return []
        from backend.src.ia_detection import get_person_detector

        return get_person_detector().detect_jpeg(image_data)

    def enable(self):
        self.enabled = True

    def disable(self):
        self.enabled = False

    def stats(self) -> dict:
        try:
            from backend.src.ia_detection import get_person_detector

            return get_person_detector().get_stats()
        except Exception as exc:
            return {"ready": False, "error": str(exc)}
