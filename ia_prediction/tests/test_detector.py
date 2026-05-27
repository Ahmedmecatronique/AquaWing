"""Tests for YOLOv8 swimmer detector."""

from __future__ import annotations

from unittest.mock import MagicMock

import numpy as np
import pytest

from ia_prediction.services.detector import SwimmerDetector


@pytest.fixture
def detector() -> SwimmerDetector:
    SwimmerDetector._instance = None
    return SwimmerDetector()


def test_detect_empty_frame(detector: SwimmerDetector) -> None:
    frame = np.zeros((0, 0, 3), dtype=np.uint8)
    assert detector.detect(frame) == []


def _mock_yolo_result(cls_id: int = 0) -> MagicMock:
    boxes = MagicMock()
    boxes.__len__ = MagicMock(return_value=1)
    boxes.xyxy = MagicMock(
        cpu=MagicMock(return_value=MagicMock(numpy=lambda: np.array([[10.0, 20.0, 50.0, 80.0]])))
    )
    boxes.conf = MagicMock(cpu=MagicMock(return_value=MagicMock(numpy=lambda: np.array([0.9]))))
    boxes.cls = MagicMock(
        cpu=MagicMock(return_value=MagicMock(numpy=lambda: np.array([cls_id])))
    )
    result = MagicMock()
    result.boxes = boxes
    return result


def test_detect_returns_correct_format(detector: SwimmerDetector) -> None:
    mock_model = MagicMock()
    mock_model.predict.return_value = [_mock_yolo_result()]
    detector._model = mock_model
    detector._initialized = True

    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    dets = detector.detect(frame)

    assert len(dets) == 1
    assert set(dets[0].keys()) == {"x1", "y1", "x2", "y2", "confidence"}
    assert dets[0]["confidence"] >= 0.4


def test_detect_filters_non_person(detector: SwimmerDetector) -> None:
    mock_model = MagicMock()
    mock_model.predict.return_value = [_mock_yolo_result(cls_id=2)]
    detector._model = mock_model
    detector._initialized = True

    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    assert detector.detect(frame) == []
