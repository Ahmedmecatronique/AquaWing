"""
Main orchestration pipeline for swimmer detection and drowning risk analysis.
"""

from __future__ import annotations

import logging
import time
from typing import List, Optional

import numpy as np

from ia_prediction import config
from ia_prediction.models.schemas import DetectedSwimmer, FrameResult, SwimmerFeatures
from ia_prediction.services.alerter import Alerter
from ia_prediction.services.behavior_classifier import BehaviorClassifier
from ia_prediction.services.detector import get_detector
from ia_prediction.services.drowning_predictor import get_predictor
from ia_prediction.services.feature_extractor import FeatureExtractor
from ia_prediction.services.tracker import get_tracker
from ia_prediction.services.visualizer import FrameVisualizer

logging.basicConfig(level=getattr(logging, config.LOG_LEVEL.upper(), logging.INFO))
logger = logging.getLogger(__name__)

_detector = get_detector()
_tracker = get_tracker()
_feature_extractor = FeatureExtractor()
_behavior_classifier = BehaviorClassifier()
_drowning_predictor = get_predictor()
_alerter = Alerter()
_visualizer = FrameVisualizer()


def process_frame(frame: np.ndarray, frame_id: int = 0) -> FrameResult:
    """
    Run the full detection → tracking → features → risk → alert pipeline on one frame.

    Args:
        frame: BGR image (OpenCV).
        frame_id: Monotonic frame index for logging and overlay.

    Returns:
        FrameResult with swimmers, alerts, timing, and annotated_frame.
    """
    t0 = time.perf_counter()

    if frame is None or frame.size == 0:
        return FrameResult(frame_id=frame_id, swimmers=[], alerts=[], processing_time_ms=0.0)

    detections = _detector.detect(frame)
    tracks = _tracker.update(frame, detections)

    swimmers: List[DetectedSwimmer] = []
    alerts: List[DetectedSwimmer] = []

    for track in tracks:
        track_id = int(track["track_id"])
        bbox = (track["x1"], track["y1"], track["x2"], track["y2"])
        history = _tracker.get_history(track_id)
        feat_vec = _feature_extractor.extract(track_id, history)
        behavior, behavior_conf = _behavior_classifier.classify(feat_vec, track_id=track_id)
        risk_score = _drowning_predictor.predict(track_id, feat_vec)

        _fv = feat_vec
        features_model = SwimmerFeatures(
            speed=float(_fv[0]) if len(_fv) > 0 else 0.0,
            acceleration=float(_fv[1]) if len(_fv) > 1 else 0.0,
            bbox_aspect_ratio=float(_fv[2]) if len(_fv) > 2 else 0.0,
            stillness_duration=float(_fv[3]) if len(_fv) > 3 else 0.0,
            motion_irregularity=float(_fv[4]) if len(_fv) > 4 else 0.0,
            displacement_from_start=float(_fv[5]) if len(_fv) > 5 else 0.0,
            bbox_area_change=float(_fv[6]) if len(_fv) > 6 else 0.0,
            vertical_centroid_ratio=float(_fv[7]) if len(_fv) > 7 else 0.0,
            bbox_stability_variance=float(_fv[8]) if len(_fv) > 8 else 0.0,
            motion_entropy=float(_fv[9]) if len(_fv) > 9 else 0.0,
        )

        alert_triggered = risk_score > config.RISK_ALERT_THRESHOLD
        swimmer = DetectedSwimmer(
            track_id=track_id,
            bbox=bbox,
            behavior=behavior,
            risk_score=risk_score,
            alert=alert_triggered,
            features=features_model,
            behavior_confidence=behavior_conf,
        )
        swimmers.append(swimmer)

        event = _alerter.check(track_id, risk_score, behavior, bbox)
        if event is not None:
            alerts.append(swimmer)

    annotated = _visualizer.draw(frame, swimmers, frame_id)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    return FrameResult(
        frame_id=frame_id,
        swimmers=swimmers,
        alerts=alerts,
        processing_time_ms=round(elapsed_ms, 2),
        annotated_frame=annotated,
    )


def process_video(source: str, output_path: Optional[str] = None) -> None:
    """
    Process a video file or camera stream frame by frame.

    Args:
        source: Path to video file or camera index as string (e.g. "0").
        output_path: Optional path to save annotated MP4.
    """
    import cv2

    src: str | int = int(source) if source.isdigit() else source
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        logger.error("Cannot open video source: %s", source)
        return

    writer = None
    fps = cap.get(cv2.CAP_PROP_FPS) or 15.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    frame_id = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            result = process_frame(frame, frame_id=frame_id)
            display = result.annotated_frame
            if display is None:
                display = frame

            for swimmer in result.alerts:
                print(
                    f"ALERT swimmer ID {swimmer.track_id} risk {swimmer.risk_score:.0%}",
                    flush=True,
                )

            if output_path and writer is None:
                fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

            if writer is not None:
                writer.write(display)

            cv2.imshow("ia_prediction", display)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
            frame_id += 1
    finally:
        cap.release()
        if writer is not None:
            writer.release()
        cv2.destroyAllWindows()


# HOW TO USE FROM PARENT BACKEND:
# from ia_prediction.pipeline import process_frame, process_video
# result = process_frame(frame)
# process_video("drone_footage.mp4", output_path="output.mp4")
