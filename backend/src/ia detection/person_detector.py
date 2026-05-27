"""
Fabrique du détecteur personnes — délègue au DetectionManager central.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

_PERCEPTION = Path(__file__).resolve().parent.parent / "perception"
if str(_PERCEPTION) not in sys.path:
    sys.path.insert(0, str(_PERCEPTION))

from detection_manager import get_detection_manager  # noqa: E402


def get_person_detector() -> Any:
    return get_detection_manager().get_detector()
