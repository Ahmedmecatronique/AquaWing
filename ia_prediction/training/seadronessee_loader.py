"""
Load SeaDronesSee / AFO / MOBDrone annotations and build LSTM training sequences.
"""

from __future__ import annotations

import json
import logging
import random
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from ia_prediction import config

logger = logging.getLogger(__name__)

_DROWN_KEYWORDS = frozenset(
    {
        "drowning",
        "drown",
        "person_in_water",
        "distress",
        "mob",
        "man_overboard",
        "victim",
    }
)
_SWIMMER_KEYWORDS = frozenset({"swimmer", "person", "human", "surfer"})


def load_annotations(data_dir: str | Path) -> List[Dict[str, Any]]:
    """
    Scan data_dir for COCO JSON and YOLO label files.

    Returns:
        List of annotation records with keys: source, path, label, bbox (optional).
    """
    root = Path(data_dir)
    records: List[Dict[str, Any]] = []

    for json_path in root.rglob("*.json"):
        if "coco" in json_path.name.lower() or "annotation" in json_path.name.lower():
            try:
                records.extend(_parse_coco_json(json_path))
            except Exception as exc:
                logger.warning("Failed to parse %s: %s", json_path, exc)

    for txt_path in root.rglob("*.txt"):
        parent = txt_path.parent.name.lower()
        if parent in {"labels", "label", "annotations"} or "yolo" in str(txt_path).lower():
            try:
                records.extend(_parse_yolo_txt(txt_path))
            except Exception as exc:
                logger.warning("Failed to parse %s: %s", txt_path, exc)

    logger.info("Loaded %d annotation records from %s", len(records), root)
    return records


def _parse_coco_json(path: Path) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    categories = {c["id"]: c.get("name", "").lower() for c in data.get("categories", [])}
    images = {img["id"]: img.get("file_name", "") for img in data.get("images", [])}
    out: List[Dict[str, Any]] = []

    for ann in data.get("annotations", []):
        cat = categories.get(ann.get("category_id"), "person")
        label = _normalize_label(cat)
        img_name = images.get(ann.get("image_id"), "")
        bbox = ann.get("bbox", [])
        out.append(
            {
                "source": "coco",
                "path": str(path.parent),
                "image": img_name,
                "label": label,
                "bbox": bbox,
            }
        )
    return out


def _parse_yolo_txt(path: Path) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    stem = path.stem
    images_dir = path.parent.parent / "images"
    image_path = None
    for ext in (".jpg", ".jpeg", ".png", ".bmp"):
        candidate = images_dir / f"{stem}{ext}"
        if candidate.exists():
            image_path = str(candidate)
            break

    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) < 5:
                continue
            cls_id = int(float(parts[0]))
            label = _normalize_label(str(cls_id))
            out.append(
                {
                    "source": "yolo",
                    "path": str(path.parent),
                    "image": image_path or stem,
                    "label": label,
                    "bbox": [float(x) for x in parts[1:5]],
                }
            )
    return out


def _normalize_label(raw: str) -> str:
    name = str(raw).lower().replace("-", "_")
    for kw in _DROWN_KEYWORDS:
        if kw in name:
            return "drowning"
    for kw in _SWIMMER_KEYWORDS:
        if kw in name:
            return "swimmer"
    return "swimmer"


def extract_features_from_video(
    video_path: str | Path,
    annotations: Optional[List[Dict[str, Any]]] = None,
) -> np.ndarray:
    """
    Run detector + tracker + feature extractor on each frame.

    Returns:
        np.ndarray of shape (T, 7) feature matrix.
    """
    import cv2

    from ia_prediction.services.detector import get_detector
    from ia_prediction.services.feature_extractor import FeatureExtractor
    from ia_prediction.services.tracker import get_tracker

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        logger.warning("Cannot open video: %s", video_path)
        return np.zeros((0, config.FEATURE_SIZE), dtype=np.float32)

    detector = get_detector()
    tracker = get_tracker()
    extractor = FeatureExtractor()
    features_over_time: List[np.ndarray] = []

    _ = annotations
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        dets = detector.detect(frame)
        tracks = tracker.update(frame, dets)
        for tr in tracks:
            tid = int(tr["track_id"])
            hist = tracker.get_history(tid)
            if len(hist) < 2:
                continue
            features_over_time.append(extractor.extract(tid, hist))

    cap.release()
    if not features_over_time:
        return np.zeros((0, config.FEATURE_SIZE), dtype=np.float32)
    return np.stack(features_over_time, axis=0)


def _label_from_annotations(anns: List[Dict[str, Any]]) -> int:
    """1 = drowning risk, 0 = safe."""
    for ann in anns:
        if ann.get("label") == "drowning":
            return 1
    return 0


def _synthetic_sequences(n: int = 200, seq_len: int = config.LSTM_SEQUENCE_LENGTH) -> Tuple[np.ndarray, np.ndarray]:
    """Generate synthetic sequences when real videos are unavailable."""
    rng = np.random.default_rng(42)
    sequences = []
    labels = []
    for i in range(n):
        label = int(i % 3 == 0)
        base_speed = 0.5 if label else 4.0
        seq = np.zeros((seq_len, config.FEATURE_SIZE), dtype=np.float32)
        for t in range(seq_len):
            speed = base_speed + rng.normal(0, 0.3)
            seq[t, 0] = max(0.0, speed)
            seq[t, 1] = rng.normal(0, 0.1)
            seq[t, 2] = 1.2 if label else 0.8
            seq[t, 3] = float(30 if label and t > 10 else min(t, 5))
            seq[t, 4] = rng.uniform(0.5, 2.0 if not label else 5.0)
            seq[t, 5] = float(t * speed * 0.1)
            seq[t, 6] = rng.normal(0, 0.05)
        sequences.append(seq)
        labels.append(label)
    return np.stack(sequences), np.array(labels, dtype=np.int64)


def prepare_sequences(data_dir: str | Path, sequence_length: int = config.LSTM_SEQUENCE_LENGTH) -> None:
    """
    Build (N, sequence_length, 7) sequences and binary labels; save to processed/.
    """
    root = Path(data_dir)
    processed = Path(config.SEQUENCES_PATH).parent
    processed.mkdir(parents=True, exist_ok=True)

    annotations = load_annotations(root)
    sequences: List[np.ndarray] = []
    labels: List[int] = []

    video_exts = {".mp4", ".avi", ".mov", ".mkv"}
    videos = [p for p in root.rglob("*") if p.suffix.lower() in video_exts]

    ann_by_video: Dict[str, List[Dict[str, Any]]] = {}
    for ann in annotations:
        key = str(ann.get("image", ""))
        ann_by_video.setdefault(key, []).append(ann)

    max_videos = 20
    for video_path in videos[:max_videos]:
        rel = video_path.name
        anns = ann_by_video.get(rel, [])
        feat_matrix = extract_features_from_video(video_path, anns)
        if feat_matrix.shape[0] < sequence_length:
            continue
        label = _label_from_annotations(anns)
        for start in range(0, feat_matrix.shape[0] - sequence_length, sequence_length // 2):
            chunk = feat_matrix[start : start + sequence_length]
            if chunk.shape[0] == sequence_length:
                sequences.append(chunk.astype(np.float32))
                labels.append(label)

    if len(sequences) < 10:
        logger.warning(
            "Insufficient real sequences (%d); generating synthetic training data",
            len(sequences),
        )
        syn_x, syn_y = _synthetic_sequences(n=200, seq_len=sequence_length)
        sequences = list(syn_x)
        labels = list(syn_y)

    x = np.stack(sequences, axis=0)
    y = np.array(labels, dtype=np.int64)
    np.save(config.SEQUENCES_PATH, x)
    np.save(config.LABELS_PATH, y)
    logger.info(
        "Saved %d sequences to %s (positive=%d, negative=%d)",
        len(y),
        config.SEQUENCES_PATH,
        int(y.sum()),
        int(len(y) - y.sum()),
    )
