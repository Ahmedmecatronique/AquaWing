"""
Pydantic v2 schemas for swimmer detection and drowning-risk pipeline I/O.
"""

from __future__ import annotations

from typing import List, Optional, Tuple

from pydantic import BaseModel, Field


class SwimmerFeatures(BaseModel):
    """Seven-dimensional kinematic feature vector per tracked swimmer."""

    speed: float = 0.0
    acceleration: float = 0.0
    bbox_aspect_ratio: float = 0.0
    stillness_duration: float = 0.0
    motion_irregularity: float = 0.0
    displacement_from_start: float = 0.0
    bbox_area_change: float = 0.0


class DetectedSwimmer(BaseModel):
    """Single swimmer state for one video frame."""

    track_id: int
    bbox: Tuple[float, float, float, float] = Field(
        description="Bounding box as (x1, y1, x2, y2) in pixel coordinates"
    )
    behavior: str = "suspicious"
    risk_score: float = Field(ge=0.0, le=1.0, default=0.0)
    alert: bool = False
    features: SwimmerFeatures = Field(default_factory=SwimmerFeatures)
    behavior_confidence: float = Field(ge=0.0, le=1.0, default=0.5)


class FrameResult(BaseModel):
    """Aggregated output for one processed frame."""

    frame_id: int
    swimmers: List[DetectedSwimmer] = Field(default_factory=list)
    alerts: List[DetectedSwimmer] = Field(default_factory=list)
    processing_time_ms: float = 0.0
    annotated_frame: Optional[object] = Field(
        default=None,
        description="OpenCV BGR image (np.ndarray); excluded from JSON serialization",
        exclude=True,
    )


class AlertEvent(BaseModel):
    """Structured alert emitted when risk exceeds threshold."""

    track_id: int
    risk_score: float
    behavior: str
    timestamp: float
    bbox: Tuple[float, float, float, float]
