#!/usr/bin/env bash
#
# backend/src/ia_prediction/fix_and_train.sh
#
# Usage (from project root):
#   bash backend/src/ia_prediction/fix_and_train.sh
#

set -u

PROJECT_ROOT="/home/ahmed/drone/AquaWing"
BACKEND_ROOT="${PROJECT_ROOT}/backend"
SRC_ROOT="${BACKEND_ROOT}/src"
IA_PRED_ROOT="${SRC_ROOT}/ia_prediction"
VENV_ACTIVATE="${PROJECT_ROOT}/.venv/bin/activate"
TMP_PIP="/home/ahmed/tmp_pip"
TORCH_INDEX="https://download.pytorch.org/whl/cpu"
export PYTHONPATH="${SRC_ROOT}"

step_ok() { echo "✓ $*"; }
step_fail() { echo "ERROR: $*" >&2; exit 1; }

echo "================================================"
echo "ia_prediction — fix_and_train.sh"
echo "Project: ${PROJECT_ROOT}"
echo "Src:     ${SRC_ROOT}"
echo "PYTHONPATH=${PYTHONPATH}"
echo "================================================"

echo ""; echo "[Step 1/9] Cleaning /tmp and pip cache..."
sudo rm -rf /tmp/* 2>/dev/null && step_ok "/tmp cleared" || echo "WARNING: could not clear /tmp"
pip cache purge 2>/dev/null && step_ok "pip cache purged" || echo "WARNING: pip cache purge skipped"

echo ""; echo "[Step 2/9] Setting TMPDIR=${TMP_PIP}..."
mkdir -p "${TMP_PIP}" && export TMPDIR="${TMP_PIP}" && step_ok "TMPDIR ready" || step_fail "Could not create ${TMP_PIP}"

echo ""; echo "[Step 3/9] Activating virtualenv..."
[[ -f "${VENV_ACTIVATE}" ]] && source "${VENV_ACTIVATE}" && step_ok "venv: $(which python)" || step_fail "Virtualenv not found"
pip cache purge 2>/dev/null || true

echo ""; echo "[Step 4/9] Installing PyTorch (CPU)..."
TMPDIR="${TMP_PIP}" pip install --no-cache-dir torch --index-url "${TORCH_INDEX}" && step_ok "PyTorch" \
  || step_fail "PyTorch install failed"

echo ""; echo "[Step 5/9] Installing OpenCV + sklearn..."
TMPDIR="${TMP_PIP}" pip install --no-cache-dir opencv-python-headless scikit-learn && step_ok "OpenCV/sklearn" \
  || step_fail "OpenCV/sklearn install failed"

echo ""; echo "[Step 6/9] Verifying imports..."
PYTHONPATH="${SRC_ROOT}" python -c "import torch; print('PyTorch OK:', torch.__version__)" || step_fail "PyTorch verify"
PYTHONPATH="${SRC_ROOT}" python -c "import cv2; print('OpenCV OK:', cv2.__version__)" || step_fail "OpenCV verify"
PYTHONPATH="${SRC_ROOT}" python -c "import sklearn; print('sklearn OK:', sklearn.__version__)" || step_fail "sklearn verify"
step_ok "All imports OK"

echo ""; echo "[Step 7/9] Running LSTM training..."
cd "${PROJECT_ROOT}" || step_fail "Cannot cd to ${PROJECT_ROOT}"
export DEVICE=cpu TRAIN_BATCH_SIZE=16 TRAIN_EPOCHS=30
PYTHONPATH="${SRC_ROOT}" python backend/src/ia_prediction/training/train_lstm.py && step_ok "Training finished" \
  || step_fail "Training failed — check backend/src/ia_prediction/training/train_lstm.py"

echo ""; echo "[Step 8/9] Cleaning ${TMP_PIP}..."
rm -rf "${TMP_PIP}" && step_ok "TMP cleaned" || echo "WARNING: could not remove ${TMP_PIP}"

echo ""
echo "================================================"
echo "Training complete."
echo "Model: backend/src/ia_prediction/models/lstm_predictor.pt"
echo "Usage: PYTHONPATH=${SRC_ROOT} python -c \"from ia_prediction.pipeline import process_video\""
echo "================================================"
