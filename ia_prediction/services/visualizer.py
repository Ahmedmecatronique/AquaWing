"""
Draw detection overlays on video frames for monitoring and debugging.
"""

from __future__ import annotations

import logging
from typing import List, Tuple

import cv2
import numpy as np

from ia_prediction.models.schemas import DetectedSwimmer

logger = logging.getLogger(__name__)

_COLOR_MAP = {
    "normal_swimming": (0, 200, 0),
    "suspicious": (0, 165, 255),
    "drowning_risk": (0, 0, 255),
}


class FrameVisualizer:
    """Annotate frames with swimmer boxes and HUD overlay."""

    def draw(
        self,
        frame: np.ndarray,
        swimmers: List[DetectedSwimmer],
        frame_id: int = 0,
    ) -> np.ndarray:
        """
        Draw on a copy of the frame; original is not mutated.

        Returns:
            Annotated BGR image.
        """
        if frame is None or frame.size == 0:
            return frame

        out = frame.copy()
        at_risk = sum(1 for s in swimmers if s.risk_score > 0.5 or s.behavior == "drowning_risk")

        for swimmer in swimmers:
            x1, y1, x2, y2 = (int(v) for v in swimmer.bbox)
            color = _COLOR_MAP.get(swimmer.behavior, (200, 200, 200))
            cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
            cv2.putText(
                out,
                f"ID {swimmer.track_id}",
                (x1, max(y1 - 8, 12)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                color,
                1,
                cv2.LINE_AA,
            )
            cv2.putText(
                out,
                f"{swimmer.risk_score * 100:.0f}% risk",
                (x1 + 4, y1 + 18),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                color,
                1,
                cv2.LINE_AA,
            )
            cv2.putText(
                out,
                swimmer.behavior,
                (x1, min(y2 + 16, out.shape[0] - 4)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                color,
                1,
                cv2.LINE_AA,
            )

        hud_lines = [
            f"Frame: {frame_id}",
            f"Swimmers: {len(swimmers)}",
            f"At risk: {at_risk}",
        ]
        pad = 6
        line_h = 22
        box_h = pad * 2 + line_h * len(hud_lines)
        cv2.rectangle(out, (0, 0), (220, box_h), (0, 0, 0), -1)
        for i, line in enumerate(hud_lines):
            cv2.putText(
                out,
                line,
                (pad, pad + (i + 1) * line_h - 6),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (255, 255, 255),
                1,
                cv2.LINE_AA,
            )
        return out
