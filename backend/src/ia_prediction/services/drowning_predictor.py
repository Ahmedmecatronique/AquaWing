"""
LSTM-based drowning risk scoring with rule-based fallback for short tracks.
"""

from __future__ import annotations

import logging
from collections import defaultdict, deque
from pathlib import Path
from typing import Any, Deque, Dict, Optional, Type

import numpy as np

from ia_prediction import config
from ia_prediction.services.behavior_classifier import BehaviorClassifier

logger = logging.getLogger(__name__)

_DrowningLSTMClass: Optional[Type[Any]] = None


def _get_lstm_class() -> Type[Any]:
    """Build DrowningLSTM nn.Module subclass (lazy torch import)."""
    global _DrowningLSTMClass
    if _DrowningLSTMClass is not None:
        return _DrowningLSTMClass

    import torch
    import torch.nn as nn

    class DrowningLSTM(nn.Module):
        """Two-layer LSTM + sigmoid head for binary drowning risk."""

        def __init__(
            self,
            input_size: int = config.FEATURE_SIZE,
            hidden_size: int = config.LSTM_HIDDEN_SIZE,
            num_layers: int = config.LSTM_NUM_LAYERS,
            dropout: float = config.LSTM_DROPOUT,
        ) -> None:
            super().__init__()
            self.lstm = nn.LSTM(
                input_size=input_size,
                hidden_size=hidden_size,
                num_layers=num_layers,
                dropout=dropout if num_layers > 1 else 0.0,
                batch_first=True,
            )
            self.fc = nn.Linear(hidden_size, 1)
            self.sigmoid = nn.Sigmoid()

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            out, _ = self.lstm(x)
            last = out[:, -1, :]
            return self.sigmoid(self.fc(last))

    _DrowningLSTMClass = DrowningLSTM
    return _DrowningLSTMClass


def build_drowning_lstm() -> Any:
    """Instantiate the LSTM module (used by train_lstm.py)."""
    return _get_lstm_class()()


class DrowningPredictor:
    """Singleton LSTM predictor with per-track sequence buffers."""

    _instance: Optional["DrowningPredictor"] = None

    def __new__(cls) -> "DrowningPredictor":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._model = None
            cls._instance._buffers = defaultdict(
                lambda: deque(maxlen=config.LSTM_SEQUENCE_LENGTH)
            )
            cls._instance._classifier = BehaviorClassifier()
            cls._instance._weights_loaded = False
        return cls._instance

    def _load_model(self) -> None:
        if self._model is not None:
            return
        import torch

        lstm_cls = _get_lstm_class()
        self._model = lstm_cls()
        path = Path(config.MODEL_SAVE_PATH)
        if path.exists():
            try:
                try:
                    state = torch.load(path, map_location=config.DEVICE, weights_only=True)
                except TypeError:
                    state = torch.load(path, map_location=config.DEVICE)
                self._model.load_state_dict(state)
                self._weights_loaded = True
                logger.info("Loaded LSTM weights from %s", path)
            except Exception as exc:
                logger.warning("Could not load LSTM weights (%s); using random init", exc)
        else:
            logger.warning("LSTM weights not found at %s; using random init", path)
        self._model.to(config.DEVICE)
        self._model.eval()

    def predict(self, track_id: int, features_vector: np.ndarray) -> float:
        """Append features and return drowning risk score in [0, 1]."""
        vec = np.asarray(features_vector, dtype=np.float32).reshape(-1)
        if vec.shape[0] != config.FEATURE_SIZE:
            vec = np.resize(vec, config.FEATURE_SIZE)

        self._buffers[track_id].append(vec)
        buffer = self._buffers[track_id]

        if len(buffer) < config.LSTM_SEQUENCE_LENGTH:
            behavior, conf = self._classifier.classify(vec)
            if behavior == "drowning_risk":
                return min(1.0, 0.5 + conf * 0.4)
            if behavior == "normal_swimming":
                return max(0.0, 0.2 - conf * 0.1)
            return 0.45

        try:
            import torch

            self._load_model()
            seq = np.stack(list(buffer), axis=0)
            tensor = torch.from_numpy(seq).unsqueeze(0).to(config.DEVICE)
            with torch.no_grad():
                score = float(self._model(tensor).item())
            return max(0.0, min(1.0, score))
        except ImportError:
            behavior, conf = self._classifier.classify(vec)
            if behavior == "drowning_risk":
                return min(1.0, 0.5 + conf * 0.4)
            return 0.35

    def reset_track(self, track_id: int) -> None:
        """Clear sequence buffer for a track."""
        if track_id in self._buffers:
            self._buffers[track_id].clear()


def get_predictor() -> DrowningPredictor:
    """Return shared drowning predictor singleton."""
    return DrowningPredictor()
