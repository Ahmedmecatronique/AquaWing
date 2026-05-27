"""Tests for ByteTrack swimmer tracker."""

from __future__ import annotations

from collections import deque

import numpy as np

from ia_prediction.services.tracker import SwimmerTracker, _SimpleTracker


def test_simple_tracker_persistence() -> None:
    tracker = _SimpleTracker()
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    dets1 = np.array([[100, 100, 150, 150, 0.9, 0]], dtype=np.float32)
    out1 = tracker.update(dets1, frame)
    assert len(out1) == 1
    id1 = int(out1[0][4])

    dets2 = np.array([[102, 102, 152, 152, 0.9, 0]], dtype=np.float32)
    out2 = tracker.update(dets2, frame)
    id2 = int(out2[0][4])
    assert id1 == id2


def test_tracker_history_grows() -> None:
    SwimmerTracker._instance = None
    tr = SwimmerTracker()
    tr._tracker = _SimpleTracker()
    tr._initialized = True
    frame = np.zeros((480, 640, 3), dtype=np.uint8)

    for i in range(3):
        offset = i * 5
        dets = [{"x1": 10 + offset, "y1": 10, "x2": 50 + offset, "y2": 50, "confidence": 0.9}]
        tracks = tr.update(frame, dets)
        assert len(tracks) == 1

    tid = tracks[0]["track_id"]
    assert len(tr.get_history(tid)) >= 3


def test_tracker_empty_detections() -> None:
    SwimmerTracker._instance = None
    tr = SwimmerTracker()
    tr._tracker = _SimpleTracker()
    tr._initialized = True
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    assert tr.update(frame, []) == []
