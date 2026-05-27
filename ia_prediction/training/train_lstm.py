#!/usr/bin/env python3
"""
Train the DrowningLSTM model on prepared feature sequences.

Optimized defaults for Raspberry Pi (CPU, low RAM).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np

_IA_PRED_ROOT = Path(__file__).resolve().parents[1]
_PROJECT_ROOT = _IA_PRED_ROOT.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

# Default paths (relative to project root, as documented)
DEFAULT_SEQUENCES = _PROJECT_ROOT / "ia_prediction" / "training" / "data" / "processed" / "sequences.npy"
DEFAULT_LABELS = _PROJECT_ROOT / "ia_prediction" / "training" / "data" / "processed" / "labels.npy"
DEFAULT_MODEL_OUT = _PROJECT_ROOT / "ia_prediction" / "models" / "lstm_predictor.pt"

# Pi-friendly training hyperparameters
TRAIN_BATCH_SIZE = int(os.getenv("TRAIN_BATCH_SIZE", "16"))
TRAIN_EPOCHS = int(os.getenv("TRAIN_EPOCHS", "30"))
TRAIN_DEVICE = os.getenv("DEVICE", "cpu")
TRAIN_LR = float(os.getenv("TRAIN_LR", "1e-3"))
TRAIN_VAL_SPLIT = float(os.getenv("TRAIN_VAL_SPLIT", "0.2"))
LSTM_SEQ_LEN = int(os.getenv("LSTM_SEQUENCE_LENGTH", "30"))
FEATURE_SIZE = 7


def _resolve_path(env_key: str, default: Path) -> Path:
    from ia_prediction import config

    raw = os.getenv(env_key, "")
    if raw:
        p = Path(raw)
        return p if p.is_absolute() else _PROJECT_ROOT / p
    cfg_path = Path(getattr(config, env_key, str(default)))
    return cfg_path if cfg_path.is_absolute() else _PROJECT_ROOT / cfg_path


def _generate_synthetic(n: int = 200) -> tuple[np.ndarray, np.ndarray]:
    """Create a small synthetic dataset when real sequences are missing or empty."""
    rng = np.random.default_rng(42)
    sequences = rng.standard_normal((n, LSTM_SEQ_LEN, FEATURE_SIZE)).astype(np.float32)
    labels = rng.integers(0, 2, size=n).astype(np.float32)
    return sequences, labels


def _save_synthetic(seq_path: Path, lbl_path: Path) -> tuple[np.ndarray, np.ndarray]:
    seq_path.parent.mkdir(parents=True, exist_ok=True)
    sequences, labels = _generate_synthetic()
    np.save(seq_path, sequences)
    np.save(lbl_path, labels)
    print(f"Generated synthetic dataset: {sequences.shape[0]} sequences -> {seq_path}")
    return sequences, labels


def _load_data() -> tuple[np.ndarray, np.ndarray, Path]:
    seq_path = _resolve_path("SEQUENCES_PATH", DEFAULT_SEQUENCES)
    lbl_path = _resolve_path("LABELS_PATH", DEFAULT_LABELS)

    if not seq_path.exists() or not lbl_path.exists():
        print("sequences.npy / labels.npy not found at:")
        print(f"  {seq_path}")
        print(f"  {lbl_path}")
        print("")
        print("Expected paths:")
        print("  ia_prediction/training/data/processed/sequences.npy")
        print("  ia_prediction/training/data/processed/labels.npy")
        print("")
        print("Run first: python ia_prediction/training/download_dataset.py")
        print("Or: bash ia_prediction/fix_and_train.sh (will use synthetic data if empty)")
        if not seq_path.exists() and not lbl_path.exists():
            sys.exit(1)
        # One file missing — synthesize both
        return _save_synthetic(seq_path, lbl_path) + (DEFAULT_MODEL_OUT,)

    sequences = np.load(seq_path)
    labels = np.load(lbl_path).astype(np.float32)

    if sequences.size == 0 or len(sequences) == 0:
        print(f"WARNING: {seq_path} is empty — generating synthetic dataset")
        sequences, labels = _save_synthetic(seq_path, lbl_path)

    if sequences.ndim != 3 or sequences.shape[2] != FEATURE_SIZE:
        print(f"Invalid sequences shape: {sequences.shape} (expected N, {LSTM_SEQ_LEN}, {FEATURE_SIZE})")
        sys.exit(1)

    save_path = _resolve_path("MODEL_SAVE_PATH", DEFAULT_MODEL_OUT)
    return sequences, labels, save_path


def main() -> None:
    try:
        import torch
        import torch.nn as nn
        from sklearn.metrics import roc_auc_score
        from sklearn.model_selection import train_test_split
        from torch.utils.data import DataLoader, TensorDataset
    except ImportError as exc:
        print(f"Missing dependency: {exc}")
        print("Run: bash ia_prediction/fix_and_train.sh")
        sys.exit(1)

    from ia_prediction.services.drowning_predictor import build_drowning_lstm

    sequences, labels, save_path = _load_data()
    save_path.parent.mkdir(parents=True, exist_ok=True)

    x_train, x_val, y_train, y_val = train_test_split(
        sequences,
        labels,
        test_size=TRAIN_VAL_SPLIT,
        random_state=42,
        stratify=labels if len(np.unique(labels)) > 1 else None,
    )

    train_ds = TensorDataset(
        torch.from_numpy(x_train),
        torch.from_numpy(y_train).unsqueeze(1),
    )
    val_ds = TensorDataset(
        torch.from_numpy(x_val),
        torch.from_numpy(y_val).unsqueeze(1),
    )
    train_loader = DataLoader(train_ds, batch_size=TRAIN_BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=TRAIN_BATCH_SIZE, shuffle=False)

    device = TRAIN_DEVICE
    print(f"Training on device={device}, batch_size={TRAIN_BATCH_SIZE}, epochs={TRAIN_EPOCHS}")
    print(f"Sequences: {sequences.shape}, labels: {labels.shape}")

    model = build_drowning_lstm().to(device)
    criterion = nn.BCELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=TRAIN_LR)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5)

    best_val_loss = float("inf")
    best_auc = 0.0

    for epoch in range(1, TRAIN_EPOCHS + 1):
        model.train()
        train_loss = 0.0
        for xb, yb in train_loader:
            xb, yb = xb.to(device), yb.to(device)
            optimizer.zero_grad()
            pred = model(xb)
            loss = criterion(pred, yb)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * len(xb)
        train_loss /= max(len(train_ds), 1)

        model.eval()
        val_loss = 0.0
        all_preds: list[float] = []
        all_labels: list[float] = []
        with torch.no_grad():
            for xb, yb in val_loader:
                xb, yb = xb.to(device), yb.to(device)
                pred = model(xb)
                loss = criterion(pred, yb)
                val_loss += loss.item() * len(xb)
                all_preds.extend(pred.cpu().numpy().flatten().tolist())
                all_labels.extend(yb.cpu().numpy().flatten().tolist())
        val_loss /= max(len(val_ds), 1)
        scheduler.step(val_loss)

        try:
            val_auc = roc_auc_score(all_labels, all_preds) if len(set(all_labels)) > 1 else 0.5
        except ValueError:
            val_auc = 0.5

        print(
            f"epoch {epoch:02d} | train_loss {train_loss:.4f} | "
            f"val_loss {val_loss:.4f} | val_AUC {val_auc:.4f}"
        )

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_auc = val_auc
            torch.save(model.state_dict(), save_path)

    print(f"Training complete. Best val_AUC: {best_auc:.4f}")
    print(f"Model saved to: {save_path}")
    print("Next step:")
    print("  from ia_prediction.pipeline import process_video")
    print("  process_video('drone_footage.mp4', output_path='output.mp4')")


if __name__ == "__main__":
    main()
