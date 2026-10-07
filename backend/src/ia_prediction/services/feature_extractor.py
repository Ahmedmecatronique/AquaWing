"""
Kinematic feature extraction — 10-D vector (was 7-D).

New features:
  [7] vertical_centroid_ratio  — y_center / frame_height proxy (low = surface ok, high = submerging)
  [8] bbox_stability_variance  — normalized area variance over window (unstable = struggle)
  [9] motion_entropy           — Shannon entropy of displacement histogram (chaotic = danger)
"""

from __future__ import annotations

import logging
from typing import Deque, Tuple

import numpy as np

from ia_prediction import config

logger = logging.getLogger(__name__)

HistoryEntry = Tuple[float, float, float, float, float]


class FeatureExtractor:
    """Extract a 10-D feature vector from track history."""

    def extract(self, track_id: int, history: Deque[HistoryEntry]) -> np.ndarray:
        _ = track_id
        if not history:
            return np.zeros(config.FEATURE_SIZE, dtype=np.float32)

        entries = list(history)
        centers = [
            ((e[0] + e[2]) / 2.0, (e[1] + e[3]) / 2.0, e[2] - e[0], e[3] - e[1])
            for e in entries
        ]

        speeds = self._compute_speeds(centers)
        speed = float(np.mean(speeds[-config.SPEED_WINDOW:])) if speeds else 0.0
        acceleration = 0.0
        if len(speeds) >= 2:
            acceleration = float(speeds[-1] - speeds[-2])

        last = entries[-1]
        w = max(last[2] - last[0], 1e-6)
        h = last[3] - last[1]
        bbox_aspect_ratio = float(h / w)

        stillness_duration = float(self._stillness_frames(speeds))
        window = speeds[-config.IRREGULARITY_WINDOW:]
        motion_irregularity = float(np.std(window)) if len(window) >= 2 else 0.0
        displacement_from_start = float(self._total_displacement(centers))
        bbox_area_change = float(self._area_change(centers))

        # [7] vertical centroid ratio
        last_entry = entries[-1]
        y_bottom_proxy = max(last_entry[3], 1.0)
        y_center = (last_entry[1] + last_entry[3]) / 2.0
        vertical_centroid_ratio = float(np.clip(y_center / y_bottom_proxy, 0.0, 1.0))

        # [8] bbox stability variance (normalized)
        areas = [(c[2] * c[3]) for c in centers[-config.AREA_CHANGE_WINDOW:]]
        bbox_stability_variance = float(np.var(areas)) if len(areas) >= 2 else 0.0
        mean_area = float(np.mean(areas)) if areas else 1.0
        bbox_stability_variance = bbox_stability_variance / max(mean_area ** 2, 1e-6)

        # [9] motion entropy
        motion_entropy = self._motion_entropy(speeds)

        return np.array(
            [
                speed,
                acceleration,
                bbox_aspect_ratio,
                stillness_duration,
                motion_irregularity,
                displacement_from_start,
                bbox_area_change,
                vertical_centroid_ratio,
                bbox_stability_variance,
                motion_entropy,
            ],
            dtype=np.float32,
        )

    def _compute_speeds(self, centers: list) -> list:
        speeds = []
        for i in range(1, len(centers)):
            dx = centers[i][0] - centers[i - 1][0]
            dy = centers[i][1] - centers[i - 1][1]
            speeds.append(float(np.hypot(dx, dy)))
        if len(speeds) < config.SPEED_WINDOW:
            speeds = [0.0] * (config.SPEED_WINDOW - len(speeds)) + speeds
        return speeds

    def _stillness_frames(self, speeds: list) -> float:
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
        window = areas[-config.AREA_CHANGE_WINDOW:]
        if len(window) < 2:
            return 0.0
        return float(window[-1] - window[0])

    def _motion_entropy(self, speeds: list) -> float:
        if len(speeds) < 4:
            return 0.0
        arr = np.array(speeds, dtype=np.float32)
        counts, _ = np.histogram(arr, bins=8, range=(0.0, max(float(arr.max()), 1.0)))
        total = counts.sum()
        if total == 0:
            return 0.0
        probs = counts[counts > 0] / total
        entropy = float(-np.sum(probs * np.log2(probs + 1e-9)))
        return round(entropy / 3.0, 4)
