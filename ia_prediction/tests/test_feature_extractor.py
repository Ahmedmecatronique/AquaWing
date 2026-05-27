"""Tests for kinematic feature extraction."""

from __future__ import annotations

from collections import deque

import numpy as np

from ia_prediction import config
from ia_prediction.services.feature_extractor import FeatureExtractor


def test_feature_vector_shape() -> None:
    ext = FeatureExtractor()
    history = deque(
        [
            (10.0, 10.0, 30.0, 30.0, 0.9),
            (12.0, 11.0, 32.0, 31.0, 0.9),
            (14.0, 12.0, 34.0, 32.0, 0.9),
            (16.0, 13.0, 36.0, 33.0, 0.9),
            (18.0, 14.0, 38.0, 34.0, 0.9),
        ],
        maxlen=config.TRACK_HISTORY_LENGTH,
    )
    vec = ext.extract(1, history)
    assert vec.shape == (config.FEATURE_SIZE,)
    assert vec.dtype == np.float32


def test_short_track_padded() -> None:
    ext = FeatureExtractor()
    history = deque([(10.0, 10.0, 20.0, 20.0, 0.9)], maxlen=config.TRACK_HISTORY_LENGTH)
    vec = ext.extract(2, history)
    assert vec.shape == (7,)
    assert not np.isnan(vec).any()


def test_empty_history() -> None:
    ext = FeatureExtractor()
    vec = ext.extract(3, deque())
    assert np.allclose(vec, 0.0)
