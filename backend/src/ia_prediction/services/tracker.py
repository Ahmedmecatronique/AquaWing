"""
Multi-object tracking with ByteTrack (boxmot) for persistent swimmer IDs.
"""

from __future__ import annotations

import logging
from collections import defaultdict, deque
from typing import Any, Deque, Dict, List, Optional, Tuple

import numpy as np

from ia_prediction import config

logger = logging.getLogger(__name__)

TrackHistory = Deque[Tuple[float, float, float, float, float]]


class SwimmerTracker:
    """ByteTrack wrapper with per-track position history."""

    _instance: Optional["SwimmerTracker"] = None

    def __new__(cls) -> "SwimmerTracker":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._tracker = None
            cls._instance._histories: Dict[int, TrackHistory] = defaultdict(
                lambda: deque(maxlen=config.TRACK_HISTORY_LENGTH)
            )
            cls._instance._initialized = False
        return cls._instance

    def _init_tracker(self) -> None:
        if self._initialized:
            return
        try:
            from boxmot import BYTETracker

            self._tracker = BYTETracker(
                track_thresh=config.CONFIDENCE_THRESHOLD,
                track_buffer=30,
                match_thresh=0.8,
            )
        except ImportError as exc:
            logger.warning("boxmot BYTETracker unavailable (%s); using simple IOU tracker", exc)
            self._tracker = _SimpleTracker()
        self._initialized = True

    def get_history(self, track_id: int) -> TrackHistory:
        """Return position history deque for a track."""
        return self._histories[track_id]

    def update(self, frame: np.ndarray, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Update tracks from detections.

        Returns:
            List of dicts: track_id, x1, y1, x2, y2.
        """
        self._init_tracker()
        if not detections:
            if hasattr(self._tracker, "update"):
                try:
                    self._tracker.update(np.empty((0, 6)), frame)
                except Exception:
                    pass
            return []

        dets = np.array(
            [
                [
                    d["x1"],
                    d["y1"],
                    d["x2"],
                    d["y2"],
                    d.get("confidence", 0.9),
                    0.0,
                ]
                for d in detections
            ],
            dtype=np.float32,
        )

        tracks = self._tracker.update(dets, frame)
        outputs: List[Dict[str, Any]] = []

        if tracks is None or len(tracks) == 0:
            return outputs

        for row in tracks:
            if len(row) < 5:
                continue
            x1, y1, x2, y2 = float(row[0]), float(row[1]), float(row[2]), float(row[3])
            track_id = int(row[4]) if len(row) > 4 else int(row[-1])
            conf = float(row[5]) if len(row) > 5 else 0.9
            self._histories[track_id].append((x1, y1, x2, y2, conf))
            outputs.append(
                {
                    "track_id": track_id,
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                }
            )

        return outputs


class _SimpleTracker:
    """Minimal centroid tracker fallback when boxmot is unavailable."""

    def __init__(self) -> None:
        self._next_id = 1
        self._tracks: Dict[int, Tuple[float, float, float, float]] = {}

    def update(self, dets: np.ndarray, frame: np.ndarray) -> np.ndarray:
        outputs = []
        used: set[int] = set()
        for det in dets:
            x1, y1, x2, y2 = det[:4]
            cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
            best_id, best_dist = None, 1e9
            for tid, (tx1, ty1, tx2, ty2) in self._tracks.items():
                if tid in used:
                    continue
                tcx, tcy = (tx1 + tx2) / 2, (ty1 + ty2) / 2
                dist = (cx - tcx) ** 2 + (cy - tcy) ** 2
                if dist < best_dist:
                    best_dist, best_id = dist, tid
            if best_id is None or best_dist > 80**2:
                best_id = self._next_id
                self._next_id += 1
            used.add(best_id)
            self._tracks[best_id] = (float(x1), float(y1), float(x2), float(y2))
            outputs.append([x1, y1, x2, y2, best_id, det[4] if len(det) > 4 else 0.9])
        return np.array(outputs, dtype=np.float32) if outputs else np.empty((0, 6))


def get_tracker() -> SwimmerTracker:
    """Return the shared tracker singleton."""
    return SwimmerTracker()
