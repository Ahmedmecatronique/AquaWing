"""
LSTM-based drowning risk scoring with EMA smoothing and rule-based fallback.
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
    global _DrowningLSTMClass
    if _DrowningLSTMClass is not None:
        return _DrowningLSTMClass

    import torch
    import torch.nn as nn

    class DrowningLSTM(nn.Module):
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

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            out, _ = self.lstm(x)
            last = out[:, -1, :]
            return self.sigmoid(self.fc(last))

    _DrowningLSTMClass = DrowningLSTM
    return _DrowningLSTMClass


def build_drowning_lstm() -> Any:
    return _get_lstm_class()()


class DrowningPredictor:
    """Singleton LSTM predictor with per-track sequence buffers and EMA smoothing."""

    _instance: Optional["DrowningPredictor"] = None

    def __new__(cls) -> "DrowningPredictor":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._model = None
            cls._instance._buffers: Dict[int, Deque] = defaultdict(
                lambda: deque(maxlen=config.LSTM_SEQUENCE_LENGTH)
            )
            cls._instance._ema_scores: Dict[int, float] = {}
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
            logger.warning("LSTM weights not found at %s; using rule-based fallback", path)
        self._model.to(config.DEVICE)
        self._model.eval()

    def _ema_update(self, track_id: int, raw_score: float) -> float:
        alpha = config.RISK_EMA_ALPHA
        prev = self._ema_scores.get(track_id, raw_score)
        smoothed = alpha * raw_score + (1.0 - alpha) * prev
        self._ema_scores[track_id] = smoothed
        return max(0.0, min(1.0, smoothed))

    def predict(self, track_id: int, features_vector: np.ndarray) -> float:
        vec = np.asarray(features_vector, dtype=np.float32).reshape(-1)
        if vec.shape[0] < config.FEATURE_SIZE:
            vec = np.concatenate([vec, np.zeros(config.FEATURE_SIZE - vec.shape[0])])
        elif vec.shape[0] > config.FEATURE_SIZE:
            vec = vec[:config.FEATURE_SIZE]

        self._buffers[track_id].append(vec)
        buffer = self._buffers[track_id]

        if len(buffer) < config.LSTM_SEQUENCE_LENGTH:
            behavior, conf = self._classifier.classify(vec, track_id=track_id)
            if behavior == "drowning_risk":
                raw = min(1.0, 0.55 + conf * 0.35)
            elif behavior == "normal_swimming":
                raw = max(0.0, 0.15 - conf * 0.08)
            else:
                raw = 0.42
            return self._ema_update(track_id, raw)

        try:
            import torch

            self._load_model()
            seq = np.stack(list(buffer), axis=0)
            tensor = torch.from_numpy(seq).unsqueeze(0).to(config.DEVICE)
            with torch.no_grad():
                raw = float(self._model(tensor).item())
            return self._ema_update(track_id, max(0.0, min(1.0, raw)))
        except ImportError:
            behavior, conf = self._classifier.classify(vec, track_id=track_id)
            raw = min(1.0, 0.55 + conf * 0.35) if behavior == "drowning_risk" else 0.35
            return self._ema_update(track_id, raw)

    def reset_track(self, track_id: int) -> None:
        if track_id in self._buffers:
            self._buffers[track_id].clear()
        self._ema_scores.pop(track_id, None)


def get_predictor() -> DrowningPredictor:
    return DrowningPredictor()
