"""Tests for rule-based behavior classification."""

from __future__ import annotations

import numpy as np

from ia_prediction import config
from ia_prediction.services.behavior_classifier import BehaviorClassifier


def _vec(**kwargs: float) -> np.ndarray:
    base = np.zeros(config.FEATURE_SIZE, dtype=np.float32)
    keys = ["speed", "acceleration", "bbox_aspect_ratio", "stillness_duration",
              "motion_irregularity", "displacement_from_start", "bbox_area_change"]
    for i, k in enumerate(keys):
        if k in kwargs:
            base[i] = kwargs[k]
    return base


def test_normal_swimming() -> None:
    clf = BehaviorClassifier()
    behavior, conf = clf.classify(
        _vec(speed=5.0, stillness_duration=2.0, motion_irregularity=2.0, bbox_aspect_ratio=1.0)
    )
    assert behavior == "normal_swimming"
    assert conf > 0.5


def test_drowning_risk_stillness() -> None:
    clf = BehaviorClassifier()
    behavior, _ = clf.classify(
        _vec(speed=0.5, stillness_duration=float(config.DROWN_STILLNESS_MIN_FRAMES + 5))
    )
    assert behavior == "drowning_risk"


def test_drowning_risk_aspect_ratio() -> None:
    clf = BehaviorClassifier()
    behavior, _ = clf.classify(
        _vec(
            speed=1.0,
            bbox_aspect_ratio=config.DROWN_ASPECT_RATIO_MIN + 0.5,
            stillness_duration=5.0,
        )
    )
    assert behavior == "drowning_risk"


def test_suspicious_default() -> None:
    clf = BehaviorClassifier()
    behavior, _ = clf.classify(_vec(speed=2.0, stillness_duration=15.0, motion_irregularity=3.0))
    assert behavior == "suspicious"
