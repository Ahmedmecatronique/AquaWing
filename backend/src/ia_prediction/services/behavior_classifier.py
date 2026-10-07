"""
Rule-based swimmer behavior classification from 10-D kinematic features.
Optimized for aquatic / maritime context with temporal smoothing.
"""

from __future__ import annotations

import logging
from collections import Counter, defaultdict
from typing import Dict, Tuple

import numpy as np

from ia_prediction import config

logger = logging.getLogger(__name__)

_LABEL_WINDOW = 5


class BehaviorClassifier:
    """Classify swimmer behavior with temporal smoothing."""

    def __init__(self) -> None:
        self._histories: Dict[int, list] = defaultdict(list)

    def classify(self, features: np.ndarray, track_id: int = -1) -> Tuple[str, float]:
        if features is None or len(features) < 7:
            return "suspicious", 0.5

        speed = float(features[0])
        aspect = float(features[2])
        stillness = float(features[3])
        irregularity = float(features[4])
        vertical_ratio = float(features[7]) if len(features) > 7 else 0.5
        bbox_var = float(features[8]) if len(features) > 8 else 0.0
        entropy = float(features[9]) if len(features) > 9 else 0.0

        raw_label, conf = self._classify_raw(
            speed, aspect, stillness, irregularity, vertical_ratio, bbox_var, entropy
        )

        if track_id >= 0:
            self._histories[track_id].append(raw_label)
            history = self._histories[track_id]
            smoothed = Counter(history[-_LABEL_WINDOW:]).most_common(1)[0][0]
            if smoothed == raw_label and len(history) >= 3:
                conf = min(1.0, conf + 0.08)
            return smoothed, round(conf, 3)

        return raw_label, round(conf, 3)

    def _classify_raw(
        self,
        speed: float,
        aspect: float,
        stillness: float,
        irregularity: float,
        vertical_ratio: float,
        bbox_var: float,
        entropy: float,
    ) -> Tuple[str, float]:
        drowning_score = 0.0
        if stillness > config.DROWN_STILLNESS_MIN_FRAMES:
            drowning_score += 0.45 + min(0.30, stillness / 60.0)
        if aspect > config.DROWN_ASPECT_RATIO_MIN and speed < config.DROWN_SPEED_MAX:
            drowning_score += 0.35
        if irregularity > config.DROWN_IRREGULARITY_MIN and speed < 3.0 and entropy > 0.6:
            drowning_score += 0.30
        if vertical_ratio > config.DROWN_VERTICAL_RATIO_MIN and speed < 2.0:
            drowning_score += 0.20
        if bbox_var > 0.25:
            drowning_score += 0.15

        if drowning_score >= 0.55:
            conf = min(1.0, 0.60 + drowning_score * 0.25)
            return "drowning_risk", conf

        swim_score = 0.0
        if speed > config.SWIM_SPEED_MIN:
            swim_score += 0.40
        if irregularity < config.SWIM_IRREGULARITY_MAX:
            swim_score += 0.25
        if stillness < config.SWIM_STILLNESS_MAX_FRAMES:
            swim_score += 0.20
        if 0.20 < entropy < 0.65:
            swim_score += 0.15

        if swim_score >= 0.65:
            return "normal_swimming", min(1.0, 0.75 + swim_score * 0.15)

        return "suspicious", 0.55 + min(0.15, drowning_score * 0.3)

    def reset_track(self, track_id: int) -> None:
        self._histories.pop(track_id, None)
