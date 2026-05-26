"""
Facade Python vers le dossier ``ia detection`` (nom avec espace).

Importer depuis le reste du projet via::

    from backend.src.ia_detection import get_person_detector, get_rgb_detection_worker
"""

from __future__ import annotations

import sys
from pathlib import Path

_IA_DIR = Path(__file__).resolve().parent / "ia detection"
if str(_IA_DIR) not in sys.path:
    sys.path.insert(0, str(_IA_DIR))

from rfdetr_engine import RfDetrPersonDetector, get_person_detector  # noqa: E402
from rgb_detection_service import RgbDetectionWorker, get_rgb_detection_worker  # noqa: E402

__all__ = [
    "RfDetrPersonDetector",
    "RgbDetectionWorker",
    "get_person_detector",
    "get_rgb_detection_worker",
]
