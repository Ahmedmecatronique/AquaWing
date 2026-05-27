#!/usr/bin/env bash
# AquaWing — démarre l'API et redémarre automatiquement si le processus s'arrête (OOM / crash IA).
cd "$(dirname "$0")"
source .venv/bin/activate
export PYTHONPATH="$(pwd)/backend/src"
mkdir -p logs

IP=$(hostname -I | awk '{print $1}')
echo "AquaWing → http://${IP}:8000/login"
echo "Logs → $(pwd)/logs/server.log"
echo "Ctrl+C pour arrêter."

while true; do
  echo "--- $(date -Iseconds) starting ---" >> logs/server.log
  python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 2>&1 | tee -a logs/server.log
  code=${PIPESTATUS[0]}
  echo "--- $(date -Iseconds) exited code=$code, restart in 5s ---" >> logs/server.log
  sleep 5
done
