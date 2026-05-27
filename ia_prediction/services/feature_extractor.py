"""
Kinematic feature extraction from per-track position history.
"""

from __future__ import annotations

import logging
from typing import Deque, Tuple

import numpy as np

from ia_prediction import config
from ia_prediction.models.schemas import SwimmerFeatures

logger = logging.getLogger(__name__)

HistoryEntry = Tuple[float, float, float, float, float]


class FeatureExtractor:
    """Extract a 7-D feature vector from track history."""

    def extract(self, track_id: int, history: Deque[HistoryEntry]) -> np.ndarray:
        """
        Build feature vector of shape (7,).

        Args:
            track_id: Swimmer track identifier (for logging).
            history: Deque of (x1, y1, x2, y2, conf) tuples.

        Returns:
            np.ndarray with dtype float32.
        """
        _ = track_id
        if not history:
            return np.zeros(config.FEATURE_SIZE, dtype=np.float32)

        entries = list(history)
        centers = [
            ((e[0] + e[2]) / 2.0, (e[1] + e[3]) / 2.0, e[2] - e[0], e[3] - e[1])
            for e in entries
        ]

        speeds = self._compute_speeds(centers)
        speed = float(np.mean(speeds[-config.SPEED_WINDOW :])) if speeds else 0.0
        acceleration = 0.0
        if len(speeds) >= 2:
            acceleration = float(speeds[-1] - speeds[-2])

        last = entries[-1]
        w = max(last[2] - last[0], 1e-6)
        h = last[3] - last[1]
        bbox_aspect_ratio = float(h / w)

        stillness_duration = float(self._stillness_frames(speeds))
        window = speeds[-config.IRREGULARITY_WINDOW :]
        motion_irregularity = float(np.std(window)) if len(window) >= 2 else 0.0
        displacement_from_start = float(self._total_displacement(centers))
        bbox_area_change = float(self._area_change(centers))

        features = SwimmerFeatures(
            speed=speed,
            acceleration=acceleration,
            bbox_aspect_ratio=bbox_aspect_ratio,
            stillness_duration=stillness_duration,
            motion_irregularity=motion_irregularity,
            displacement_from_start=displacement_from_start,
            bbox_area_change=bbox_area_change,
        )
        return np.array(
            [
                features.speed,
                features.acceleration,
                features.bbox_aspect_ratio,
                features.stillness_duration,
                features.motion_irregularity,
                features.displacement_from_start,
                features.bbox_area_change,
            ],
            dtype=np.float32,
        )

    def _compute_speeds(self, centers: list) -> list[float]:
        speeds: list[float] = []
        for i in range(1, len(centers)):
            dx = centers[i][0] - centers[i - 1][0]
            dy = centers[i][1] - centers[i - 1][1]
            speeds.append(float(np.hypot(dx, dy)))
        if len(speeds) < config.SPEED_WINDOW:
            speeds = [0.0] * (config.SPEED_WINDOW - len(speeds)) + speeds
        return speeds

    def _stillness_frames(self, speeds: list[float]) -> float:
        count = 0
        for s in reversed(speeds):
            if s < config.STILLNESS_THRESHOLD:
                count += 1
            else:
                break
        return float(count)

    def _total_displacement(self, centers: list) -> float:
        if len(centers) < 2:
            return 0.0
        total = 0.0
        for i in range(1, len(centers)):
            dx = centers[i][0] - centers[i - 1][0]
            dy = centers[i][1] - centers[i - 1][1]
            total += float(np.hypot(dx, dy))
        return total

    def _area_change(self, centers: list) -> float:
        if len(centers) < 2:
            return 0.0
        areas = [max(c[2], 1e-6) * max(c[3], 1e-6) for c in centers]
        window = areas[-config.AREA_CHANGE_WINDOW :]
        if len(window) < 2:
            return 0.0
        return float(window[-1] - window[0])
