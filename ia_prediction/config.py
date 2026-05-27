"""
Central configuration for the ia_prediction drowning-detection module.

All tunable values are defined here; services must not use magic numbers.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

_IA_ROOT = Path(__file__).resolve().parent

MODEL_WEIGHTS = os.getenv("MODEL_WEIGHTS", str(_IA_ROOT / "models" / "yolov8n.pt"))
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.4"))
RISK_ALERT_THRESHOLD = float(os.getenv("RISK_ALERT_THRESHOLD", "0.75"))
TRACK_HISTORY_LENGTH = int(os.getenv("TRACK_HISTORY_LENGTH", "60"))
LSTM_SEQUENCE_LENGTH = int(os.getenv("LSTM_SEQUENCE_LENGTH", "30"))
STILLNESS_THRESHOLD = float(os.getenv("STILLNESS_THRESHOLD", "2.0"))
FEATURE_SIZE = 7

try:
    import torch

    _device_env = os.getenv("DEVICE", "").strip().lower()
    if _device_env:
        DEVICE = _device_env
    else:
        DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
except ImportError:
    DEVICE = os.getenv("DEVICE", "cpu")

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
DATA_DIR = os.getenv("DATA_DIR", str(_IA_ROOT / "training" / "data"))
SEQUENCES_PATH = os.getenv(
    "SEQUENCES_PATH", str(_IA_ROOT / "training" / "data" / "processed" / "sequences.npy")
)
LABELS_PATH = os.getenv(
    "LABELS_PATH", str(_IA_ROOT / "training" / "data" / "processed" / "labels.npy")
)
MODEL_SAVE_PATH = os.getenv("MODEL_SAVE_PATH", str(_IA_ROOT / "models" / "lstm_predictor.pt"))

# Behavior classifier thresholds (rule-based)
SWIM_SPEED_MIN = float(os.getenv("SWIM_SPEED_MIN", "3.0"))
SWIM_IRREGULARITY_MAX = float(os.getenv("SWIM_IRREGULARITY_MAX", "4.0"))
SWIM_STILLNESS_MAX_FRAMES = int(os.getenv("SWIM_STILLNESS_MAX_FRAMES", "10"))
DROWN_STILLNESS_MIN_FRAMES = int(os.getenv("DROWN_STILLNESS_MIN_FRAMES", "25"))
DROWN_ASPECT_RATIO_MIN = float(os.getenv("DROWN_ASPECT_RATIO_MIN", "2.5"))
DROWN_SPEED_MAX = float(os.getenv("DROWN_SPEED_MAX", "1.5"))

# Feature extraction
SPEED_WINDOW = int(os.getenv("SPEED_WINDOW", "5"))
IRREGULARITY_WINDOW = int(os.getenv("IRREGULARITY_WINDOW", "15"))
AREA_CHANGE_WINDOW = int(os.getenv("AREA_CHANGE_WINDOW", "5"))

# Training (Pi-friendly defaults: batch 16, 30 epochs, CPU)
TRAIN_BATCH_SIZE = int(os.getenv("TRAIN_BATCH_SIZE", "16"))
TRAIN_EPOCHS = int(os.getenv("TRAIN_EPOCHS", "30"))
TRAIN_LR = float(os.getenv("TRAIN_LR", "1e-3"))
TRAIN_VAL_SPLIT = float(os.getenv("TRAIN_VAL_SPLIT", "0.2"))
LSTM_HIDDEN_SIZE = int(os.getenv("LSTM_HIDDEN_SIZE", "64"))
LSTM_NUM_LAYERS = int(os.getenv("LSTM_NUM_LAYERS", "2"))
LSTM_DROPOUT = float(os.getenv("LSTM_DROPOUT", "0.3"))
