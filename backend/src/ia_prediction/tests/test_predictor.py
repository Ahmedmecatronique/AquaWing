"""Tests for LSTM drowning risk predictor."""

from __future__ import annotations

from unittest.mock import patch

import numpy as np
import pytest

from ia_prediction import config
from ia_prediction.services.drowning_predictor import DrowningPredictor


@pytest.fixture
def predictor() -> DrowningPredictor:
    DrowningPredictor._instance = None
    p = DrowningPredictor()
    p._model = None
    p._buffers.clear()
    return p


@patch.object(DrowningPredictor, "_load_model")
def test_risk_score_in_unit_interval(mock_load: object, predictor: DrowningPredictor) -> None:
    vec = np.array([0.5, 0.0, 1.0, 30.0, 5.0, 10.0, 0.0], dtype=np.float32)
    score = predictor.predict(1, vec)
    assert isinstance(score, float)
    assert 0.0 <= score <= 1.0


@patch.object(DrowningPredictor, "_load_model")
def test_fallback_short_buffer(mock_load: object, predictor: DrowningPredictor) -> None:
    vec = np.array([0.2, 0.0, 3.0, 30.0, 5.0, 0.0, 0.0], dtype=np.float32)
    score = predictor.predict(99, vec)
    assert score > 0.5


@patch.object(DrowningPredictor, "_load_model")
def test_normal_fallback_low_risk(mock_load: object, predictor: DrowningPredictor) -> None:
    vec = np.array([5.0, 0.1, 0.8, 2.0, 1.0, 20.0, 0.0], dtype=np.float32)
    score = predictor.predict(100, vec)
    assert score < 0.5


def test_lstm_forward_shape() -> None:
    pytest.importorskip("torch")
    import torch

    from ia_prediction.services.drowning_predictor import build_drowning_lstm

    model = build_drowning_lstm()
    x = torch.randn(2, config.LSTM_SEQUENCE_LENGTH, config.FEATURE_SIZE)
    out = model(x)
    assert out.shape == (2, 1)
    assert (out >= 0).all() and (out <= 1).all()
