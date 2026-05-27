#!/usr/bin/env bash
#
# ia_prediction/fix_and_train.sh
# One-shot fix: install PyTorch (CPU) + OpenCV on Raspberry Pi, then train LSTM.
#
# Usage:
#   bash ia_prediction/fix_and_train.sh
#

set -u

PROJECT_ROOT="/home/ahmed/drone/AquaWing"
VENV_ACTIVATE="${PROJECT_ROOT}/.venv/bin/activate"
TMP_PIP="/home/ahmed/tmp_pip"
TORCH_INDEX="https://download.pytorch.org/whl/cpu"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

step_ok() {
  echo "✓ $*"
}

step_fail() {
  echo "ERROR: $*" >&2
  exit 1
}

echo "================================================"
echo "ia_prediction — fix_and_train.sh"
echo "Project: ${PROJECT_ROOT}"
echo "================================================"

# ---------------------------------------------------------------------------
# Step 1 — Clean up
# ---------------------------------------------------------------------------
echo ""
echo "[Step 1/9] Cleaning /tmp and pip cache..."
if sudo rm -rf /tmp/* 2>/dev/null; then
  step_ok "/tmp cleared"
else
  echo "WARNING: could not clear /tmp (sudo may be unavailable); continuing"
fi

if pip cache purge 2>/dev/null; then
  step_ok "pip cache purged"
else
  echo "WARNING: pip cache purge skipped (venv not active yet or no cache)"
fi

# ---------------------------------------------------------------------------
# Step 2 — Safe TMPDIR on /home
# ---------------------------------------------------------------------------
echo ""
echo "[Step 2/9] Setting TMPDIR=${TMP_PIP}..."
if mkdir -p "${TMP_PIP}"; then
  export TMPDIR="${TMP_PIP}"
  step_ok "TMPDIR ready (${TMP_PIP})"
else
  step_fail "Could not create ${TMP_PIP}"
fi

# ---------------------------------------------------------------------------
# Step 3 — Activate virtualenv
# ---------------------------------------------------------------------------
echo ""
echo "[Step 3/9] Activating virtualenv..."
if [[ -f "${VENV_ACTIVATE}" ]]; then
  # shellcheck source=/dev/null
  source "${VENV_ACTIVATE}"
  step_ok "Virtualenv activated: $(which python)"
else
  step_fail "Virtualenv not found at ${VENV_ACTIVATE}"
fi

# Re-run pip cache purge now that venv is active
pip cache purge 2>/dev/null || true

# ---------------------------------------------------------------------------
# Step 4 — Install PyTorch CPU only
# ---------------------------------------------------------------------------
echo ""
echo "[Step 4/9] Installing PyTorch (CPU only, no CUDA)..."
if TMPDIR="${TMP_PIP}" pip install --no-cache-dir torch --index-url "${TORCH_INDEX}"; then
  step_ok "PyTorch installed"
else
  step_fail "PyTorch install failed. Check network and disk space under ${TMP_PIP}"
fi

# ---------------------------------------------------------------------------
# Step 5 — Install OpenCV headless and scikit-learn
# ---------------------------------------------------------------------------
echo ""
echo "[Step 5/9] Installing opencv-python-headless and scikit-learn..."
if TMPDIR="${TMP_PIP}" pip install --no-cache-dir opencv-python-headless scikit-learn; then
  step_ok "OpenCV and scikit-learn installed"
else
  step_fail "OpenCV/sklearn install failed"
fi

# ---------------------------------------------------------------------------
# Step 6 — Verify installations
# ---------------------------------------------------------------------------
echo ""
echo "[Step 6/9] Verifying imports..."

if python -c "import torch; print('PyTorch OK:', torch.__version__)"; then
  step_ok "PyTorch import OK"
else
  step_fail "PyTorch verification failed"
fi

if python -c "import cv2; print('OpenCV OK:', cv2.__version__)"; then
  step_ok "OpenCV import OK"
else
  step_fail "OpenCV verification failed"
fi

if python -c "import sklearn; print('sklearn OK:', sklearn.__version__)"; then
  step_ok "sklearn import OK"
else
  step_fail "sklearn verification failed"
fi

# ---------------------------------------------------------------------------
# Step 7 — Run LSTM training
# ---------------------------------------------------------------------------
echo ""
echo "[Step 7/9] Running LSTM training..."
cd "${PROJECT_ROOT}" || step_fail "Cannot cd to ${PROJECT_ROOT}"

export DEVICE=cpu
export TRAIN_BATCH_SIZE=16
export TRAIN_EPOCHS=30

if python ia_prediction/training/train_lstm.py; then
  step_ok "Training finished"
else
  step_fail "Training failed, check ia_prediction/training/train_lstm.py"
fi

# ---------------------------------------------------------------------------
# Step 8 — Clean up TMPDIR
# ---------------------------------------------------------------------------
echo ""
echo "[Step 8/9] Cleaning temporary pip directory..."
if rm -rf "${TMP_PIP}"; then
  step_ok "Removed ${TMP_PIP}"
else
  echo "WARNING: could not remove ${TMP_PIP}"
fi

# ---------------------------------------------------------------------------
# Step 9 — Final status
# ---------------------------------------------------------------------------
echo ""
echo "================================================"
echo "Training complete."
echo "Model saved to: ia_prediction/models/lstm_predictor.pt"
echo "Run prediction with:"
echo "  from ia_prediction.pipeline import process_video"
echo "  process_video('drone_footage.mp4')"
echo "================================================"
