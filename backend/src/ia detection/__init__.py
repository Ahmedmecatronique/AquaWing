"""
Module d'IA pour la détection de personnes en mer.

Importe depuis les sous-modules (rfdetr_engine, rgb_detection_service, etc.)
"""

from rfdetr_engine import RfDetrPersonDetector, get_person_detector
from rgb_detection_service import RgbDetectionWorker, get_rgb_detection_worker

__all__ = [
    "RfDetrPersonDetector",
    "RgbDetectionWorker",
    "get_person_detector",
    "get_rgb_detection_worker",
]
