"""
Rule-based swimmer behavior classification from kinematic features.
"""

from __future__ import annotations

import logging
from typing import Tuple

import numpy as np

from ia_prediction import config

logger = logging.getLogger(__name__)


class BehaviorClassifier:
    """Classify swimmer behavior from a 7-D feature vector."""

    def classify(self, features: np.ndarray) -> Tuple[str, float]:
        """
        Args:
            features: Shape (7,) — speed, accel, aspect, stillness, irregularity,
                      displacement, area_change.

        Returns:
            (behavior_label, confidence) where behavior is one of
            normal_swimming | drowning_risk | suspicious.
        """
        if features is None or len(features) < config.FEATURE_SIZE:
            return "suspicious", 0.5

        speed = float(features[0])
        aspect = float(features[2])
        stillness = float(features[3])
        irregularity = float(features[4])

        if stillness > config.DROWN_STILLNESS_MIN_FRAMES or (
            aspect > config.DROWN_ASPECT_RATIO_MIN and speed < config.DROWN_SPEED_MAX
        ):
            conf = min(1.0, 0.6 + stillness / max(config.DROWN_STILLNESS_MIN_FRAMES, 1) * 0.1)
            return "drowning_risk", conf

        if (
            speed > config.SWIM_SPEED_MIN
            and irregularity < config.SWIM_IRREGULARITY_MAX
            and stillness < config.SWIM_STILLNESS_MAX_FRAMES
        ):
            return "normal_swimming", 0.85

        return "suspicious", 0.65
