# ia_prediction — Swimmer Behavior & Drowning Risk

Module d'analyse de vidéos aériennes (vue drone, mer) pour détecter les nageurs, classifier leur comportement et estimer le risque de noyade en temps réel.

## Fonctionnalités

- Détection **person** (YOLOv8)
- Suivi multi-objets (**ByteTrack** via boxmot)
- Extraction de **7 features** cinématiques par nageur
- Classification comportementale (règles) : `normal_swimming`, `suspicious`, `drowning_risk`
- Score de risque **LSTM** + repli sur règles si historique court
- Alertes JSON structurées au-dessus du seuil configuré
- Visualisation OpenCV (cadres colorés + HUD)

## Installation

Depuis la racine du projet AquaWing :

```bash
pip install -r ia_prediction/requirements.txt
cp ia_prediction/.env.example ia_prediction/.env   # optionnel
```

## Téléchargement automatique des datasets

```bash
python ia_prediction/training/download_dataset.py
```

Télécharge SeaDronesSee, AFO, MOBDrone, les poids YOLOv8n, puis génère :

- `ia_prediction/training/data/processed/sequences.npy`
- `ia_prediction/training/data/processed/labels.npy`

## Entraînement LSTM

```bash
python ia_prediction/training/train_lstm.py
```

Produit : `ia_prediction/models/lstm_predictor.pt`

## Utilisation sur une vidéo

```python
from ia_prediction.pipeline import process_video

process_video("drone_footage.mp4", output_path="output.mp4")
```

## Traitement frame par frame (intégration backend)

```python
import cv2
from ia_prediction.pipeline import process_frame

cap = cv2.VideoCapture(0)
ok, frame = cap.read()
if ok:
    result = process_frame(frame, frame_id=0)
    for swimmer in result.swimmers:
        print(swimmer.track_id, swimmer.behavior, swimmer.risk_score)
```

## Tests

```bash
pytest ia_prediction/tests/ -q
```

## Intégration avec le backend parent

Sans modifier les fichiers hors de `ia_prediction/`, le backend peut importer :

```python
from ia_prediction.pipeline import process_frame, process_video
```

Brancher `process_frame` sur le flux MJPEG RGB existant (`/video`) pour enrichir les overlays et alertes du dashboard.

## Configuration

Variables dans `.env` ou `ia_prediction/config.py` :

| Variable | Défaut | Description |
|----------|--------|-------------|
| `MODEL_WEIGHTS` | `ia_prediction/models/yolov8n.pt` | Poids YOLOv8 |
| `CONFIDENCE_THRESHOLD` | `0.4` | Seuil détection |
| `RISK_ALERT_THRESHOLD` | `0.75` | Seuil alerte noyade |
| `LSTM_SEQUENCE_LENGTH` | `30` | Fenêtre LSTM (frames) |
| `STILLNESS_THRESHOLD` | `2.0` | Vitesse min. (px/frame) pour immobilité |

## Structure

```
ia_prediction/
├── pipeline.py              # Orchestrateur principal
├── config.py
├── services/                # detector, tracker, features, LSTM, alertes
├── models/schemas.py        # Schémas Pydantic
├── training/                # download, loader, train_lstm
└── tests/
```

## Notes Raspberry Pi

- Préférer `DEVICE=cpu` et `yolov8n.pt` (nano).
- L'inférence PyTorch peut être lente ; envisager ONNX/export pour la production.
- Le script de download peut générer des séquences **synthétiques** si peu de vidéos sont disponibles localement.
