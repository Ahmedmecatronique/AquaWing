## AquaWing — Architecture

Ce document décrit l’architecture globale du projet **AquaWing** (backend, frontend, streaming, IA).

---

## Vue d’ensemble

**Backend (FastAPI)** :
- Sert les pages frontend (dashboard, missions, systems, heatmap, etc.)
- Expose des endpoints REST (`/api/...`) et WebSocket (télémétrie/commandes)
- Fournit des endpoints média (ex. `/video`, `/thermal` selon la config)

**Frontend (Dashboard)** :
- UI web pour télémétrie, missions, caméras, overlays, alertes
- Poll/WS selon les écrans (selon les routes)

**IA (Swimmer/drowning)** :
- Module autonome importable : `backend/src/ia_prediction/`
- Détection nageurs, tracking, features, classification comportementale, score de risque LSTM, alertes, visualisation.
- Intégré à l’UI Optical via un overlay “2 parties” : **détection personne** + **comportement (sait nager / incertain / ne sait pas nager)**.

---

## 📁 STRUCTURE COMPLÈTE DU PROJET

Arborescence détaillée avec tous les fichiers et modules du projet AquaWing.

```
AquaWing/
├── 📄 main.py                          # Point d'entrée principal → FastAPI
├── 📄 requirements.txt                 # Dépendances Python globales
├── 📄 requirements-ai.txt              # Dépendances IA (legacy)
├── 📄 users.json                       # Comptes démo (auth)
├── 📄 README.md                        # Guide principal
├── 📄 ARCHITECTURE.md                  # Cette documentation
├── 📄 ANALYSE_COMPLETE.md              # Rapport complet
├── 📄 ANALYSE_PROFONDE.md              # Analyse approfondie
├── 📄 DIAGNOSTIC_SYSTEME.md            # Diagnostic système
├── 📄 RAPPORT_COMPLET_SITE.md          # Rapport UI/website
├── 📄 ROUTES_FRONTEND.md               # Routes frontend
├── 📄 auto_push.sh                     # Git automation
│
├── 📁 backend/                         # Backend FastAPI  
│   ├── 📄 main.py                      # App standalone
│   ├── 📄 server.py                    # App factory
│   ├── 📄 api.py                       # Endpoints REST (/api/*)
│   ├── 📄 auth.py                      # Authentification
│   ├── 📄 websocket.py                 # WebSocket réel-time
│   └── 📁 src/                         # Modules métier
│       ├── 📄 ia_detection.py          # Façade IA legacy
│       ├── 📁 ia_prediction/           # IA Swimmer Detection
│       │   ├── 📄 pipeline.py
│       │   ├── 📄 config.py
│       │   ├── 📁 services/            # detector/tracker/predictor...
│       │   ├── 📁 models/              # schemas + weights
│       │   ├── 📁 training/            # download/train
│       │   └── 📁 tests/               # pytest
│       ├── 📁 mission/                 # Mission manager
│       ├── 📁 navigation/              # Guidance
│       ├── 📁 perception/              # Object detection
│       ├── 📁 streaming/               # Video streams
│       ├── 📁 safety/                  # Supervisor
│       ├── 📁 control/                 # Flight controller
│       ├── 📁 uart/                    # Serial link
│       └── 📁 utils/                   # Logger
│
├── 📁 frontend/                        # Frontend HTML/JS/CSS
│   ├── 📁 static/                      # Shared assets
│   ├── 📁 Dashboard/                   # Main dashboard
│   ├── 📁 Missions/                    # Mission UI
│   ├── 📁 Heatmap/                     # Thermal viewer
│   ├── 📁 Systems/                     # System status
│   ├── 📁 Optical/                     # RGB camera
│   ├── 📁 Settings/                    # Settings UI
│   ├── 📁 PID Settings/                # PID tuning
│   ├── 📁 Electrical Wiring/           # Wiring diagram
│   └── 📁 login/                       # Auth UI
│
├── 📁 config/                          # Configuration
│   ├── 📄 system.yaml                  # Runtime config
│   └── 📄 cablage.py                   # Wiring constants
│
├── 📁 deploy/                          # Deployment
│   ├── 📁 systemd/                     # Systemd services
│   └── 📁 cloudflare/                  # Tunnel config
│
├── 📁 docs/                            # Documentation
├── 📁 tools/                           # Utility scripts
└── 📁 tests/                           # Project tests
```

**📝 Notes Importantes:**
- Les datasets (`training/data/raw/*`) sont téléchargés automatiquement
- Module IA importable via `PYTHONPATH=backend/src`
- RF-DETR (`ia detection/rf-detr-develop/`) est un submodule externe

---

## 📋 DESCRIPTION PAR MODULE

### 🔵 Backend - Core (`backend/`)

#### `main.py` - Point d'entrée FastAPI
- App standalone : routes statiques + endpoints média + REST
- CORS configuration
- Mounting all routers (api, websocket, auth)

#### `server.py` - App Factory
- `create_app()` function pour instantiation modulaire

#### `api.py` - REST Endpoints
- `/api/status`, `/api/telemetry`, `/api/command`

#### `websocket.py` - Real-time Streaming
- `/ws` endpoint WebSocket 2Hz
- Authentification par session cookies

#### `auth.py` - Authentication  
- Login/logout + session management

### IA Module - `backend/src/ia_prediction/`

**pipeline.py** : YOLOv8 → ByteTrack → Features → Classification → LSTM  
**services/** : detector, tracker, feature_extractor, behavior_classifier, drowning_predictor, alerter, visualizer  
**training/** : download_dataset, train_lstm, seadronessee_loader  
**tests/** : pytest tests  
**models/** : schemas.py, lstm_predictor.pt weights  

### Autres Modules - `backend/src/`

**mission/** : Waypoint + mission planning  
**navigation/** : Guidance + trajectoires  
**perception/** : Object detection interface + cameras  
**streaming/** : MJPEG/JPEG video streams  
**safety/** : Safety supervisor + watchdog  
**control/** : Flight controller + PID  
**uart/** : Serial communication (FC/GPS)  
**utils/** : Logging

### Frontend - `frontend/`

**Dashboard/** : Main UI + telemetry + camera feeds  
**Missions/** : Waypoint planning  
**Systems/** : System monitoring  
**Heatmap/** : Thermal viewer  
**Optical/** : RGB camera  
**Settings/** : Configuration  
**PID Settings/** : Flight tuning  
**login/** : Authentication UI

### Config & Deploy

**config/system.yaml** : Runtime parameters  
**config/cablage.py** : Hardware constants  
**deploy/systemd/** : Auto-start services  
**deploy/cloudflare/** : Tunnel setup

---

## 🚀 GETTING STARTED

### Installation et Lancement

```bash
# Installation dépendances
pip install -r requirements.txt

# Lancer le serveur
python main.py
```

### URLs Principales
- Frontend: `http://localhost:8000/map`
- API REST: `http://localhost:8000/api/`
- WebSocket: `ws://localhost:8000/ws`
- Health check: `http://localhost:8000/health`

---

## 📊 STATISTIQUES DU PROJET

- **Total Fichiers Python** : 70+
- **Total Fichiers Frontend** : 30+
- **Total Lignes Code** : 10,000+
- **Modules IA** : Pipeline complet + LSTM training
- **API Endpoints** : 10+ REST routes + WebSocket

---

## ✅ CHECKLIST IMPLÉMENTATION

### Backend
- ✅ FastAPI core + routing
- ✅ WebSocket real-time
- ✅ Authentication system
- ✅ IA pipeline (YOLOv8 + ByteTrack + LSTM)
- ✅ Video streaming (MJPEG)
- ✅ UART communication framework
- 🔄 TODO: Real hardware integration

### Frontend
- ✅ Dashboard with Leaflet map
- ✅ Real-time telemetry display
- ✅ Mission planning UI
- ✅ Video streaming display
- ✅ System monitoring
- 🔄 TODO: Mobile responsiveness

### Deployment
- ✅ Systemd service templates
- ✅ Cloudflare Tunnel setup
- 🔄 TODO: Docker containers
- 🔄 TODO: Production hardening

---

## 📚 DOCUMENTATION COMPLÉMENTAIRE

Voir les fichiers de doc spécifiques:
- [RAPPORT_COMPLET_SITE.md](RAPPORT_COMPLET_SITE.md) - UI/Dashboard détaillé
- [ROUTES_FRONTEND.md](ROUTES_FRONTEND.md) - Frontend routes mapping
- [README.md](README.md) - Installation et guide utilisateur
- `docs/CLOUDFLARE_TUNNEL.md` - Tunnel deployment

---

## 🎯 PROCHAINES ÉTAPES

1. **Intégration Hardware** : Connecter FC (Flight Controller) via UART
2. **Calibration Caméras** : Setup RGB + Thermal
3. **Entraînement LSTM** : Run training pipeline sur dataset complet
4. **Tests Terrain** : Validation système en conditions réelles
5. **Optimisation Performance** : Profiling + optimization

---

*Documentation générée automatiquement - AquaWing v5*
│   ├── server.py                 # Factory create_app() (alternative/usage modulaire)
│   ├── api.py                    # Routes REST (/api/*) : missions, settings, détection, etc.
│   ├── auth.py                   # Login/logout, sessions
│   ├── websocket.py              # WebSocket: télémétrie + commandes
│   └── src/                      # Modules “métier” du backend
│       ├── __init__.py
│       ├── ia_prediction/         # IA swimmer/drowning (détaillé plus bas)
│       │   ├── pipeline.py
│       │   ├── config.py
│       │   ├── services/          # detector/tracker/features/predictor/alerter/visualizer
│       │   ├── models/            # schemas Pydantic + poids .pt (après training)
│       │   ├── training/          # download_dataset.py, train_lstm.py, loader
│       │   └── tests/             # tests pytest du module IA
│       ├── mission/               # Mission planning/execution
│       ├── navigation/            # Guidance/trajectoires
│       ├── perception/            # Détection “classique”, caméras (RGB/thermal)
│       ├── streaming/             # MJPEG/streams (RGB + heatmap)
│       ├── safety/                # Supervision / failsafe
│       ├── control/               # Contrôleurs (PID, etc.)
│       ├── uart/                  # Liaison série (FC, GPS)
│       └── utils/                 # Logger et utilitaires
│
├── frontend/                     # Frontend web (pages UI)
│   ├── Dashboard/                # Dashboard principal (AquaWing UI)
│   ├── Missions/                 # UI missions (iframe/panel)
│   ├── Heatmap/                  # UI heatmap (thermal)
│   └── ...                       # Autres pages (Systems, Optical, Settings, etc.)
│
├── config/
│   └── system.yaml               # Config runtime (caméras, détection, seuils, etc.)
│
├── deploy/                       # Déploiement (systemd, tunnel, etc.)
├── tools/                        # Scripts utilitaires (dev, debug)
└── tests/                        # (si présent) tests projet globaux
```

Notes :
- Les dossiers `training/data/raw/*` sont des datasets téléchargés automatiquement ; ils peuvent contenir leurs propres `README.md` (documentation upstream) et ne font pas partie de la doc AquaWing.
- Le module IA `ia_prediction` est importable via `PYTHONPATH=backend/src`.

---

## Inventaire détaillé (niveau fichier)

### Racine `AquaWing/`

- **`ANALYSE_COMPLETE.md`**: rapport/notes d’analyse (documentation interne).
- **`ANALYSE_PROFONDE.md`**: rapport/notes d’analyse approfondie.
- **`ARCHITECTURE.md`**: architecture du projet (ce fichier).
- **`DIAGNOSTIC_SYSTEME.md`**: diagnostic/notes système.
- **`RAPPORT_COMPLET_SITE.md`**: rapport complet (UI/website).
- **`ROUTES_FRONTEND.md`**: mapping/description des routes/pages front.
- **`README.md`**: documentation principale (installation, run).
- **`auto_push.sh`**: script utilitaire (git/automation).
- **`main.py`**: point d’entrée Python (lance FastAPI).
- **`requirements.txt`**: dépendances Python globales (backend + IA).
- **`requirements-ai.txt`**: ancien fichier de deps IA (historique/optionnel si encore utilisé).
- **`run_server.txt`**: commande de démarrage (dev).
- **`users.json`**: comptes démo.
- **`backend/`**: code serveur FastAPI.
- **`frontend/`**: pages UI (Dashboard, Missions, Systems, etc.).
- **`config/`**: configuration runtime.
- **`deploy/`**: déploiement (systemd, cloudflare).
- **`tools/`**: scripts utilitaires.
- **`docs/`**: documentation additionnelle (si utilisée).
- **`tests/`**: tests globaux du projet (si utilisés).
- **`.venv/`**: environnement virtuel Python.
- **`.vscode/`**: réglages éditeur.
- **`.git/`**: repository git.

### `backend/` (FastAPI)

- **`backend/main.py`**: app FastAPI “standalone” (routes + endpoints média + statiques).
- **`backend/server.py`**: factory `create_app()` (configuration serveur).
- **`backend/api.py`**: endpoints REST `/api/*`.
- **`backend/websocket.py`**: WebSocket (télémétrie + commandes).
- **`backend/auth.py`**: login/logout, sessions/cookies.
- **`backend/__init__.py`**: package init.
- **`backend/logs/`**: logs runtime.

### `backend/src/` (modules backend)

- **`backend/src/ia_detection.py`**: façade IA “legacy” (dossier `ia detection/`).
- **`backend/src/ia detection/`**: moteur RF-DETR (person detection) + worker RGB (historique).
- **`backend/src/ia_prediction/`**: IA swimmer/drowning (module principal récent)
  - `config.py`: config/paths/constantes
  - `pipeline.py`: `process_frame`, `process_video`
  - `fix_and_train.sh`: script Pi (install CPU torch/opencv + train)
  - `models/`: `schemas.py` + poids `.pt` (après entraînement)
  - `services/`: detector/tracker/feature_extractor/behavior_classifier/drowning_predictor/alerter/visualizer
  - `training/`: download_dataset, loader, train_lstm, data/
  - `tests/`: tests pytest module IA
- **`backend/src/perception/`**
  - `detector.py`: interface détection côté backend (peut déléguer à IA)
  - `cameras/`: caméras RGB/thermal
- **`backend/src/streaming/`**
  - `rgb_camera_stream.py`: rpicam-vid → dernière frame JPEG (`/video`)
  - `video_stream.py`: streaming générique
  - `vedio_heatmap_stream.py`: heatmap thermique → JPEG (`/thermal`)
- **`backend/src/mission/`**: mission manager
- **`backend/src/navigation/`**: guidance/trajectoires
- **`backend/src/control/`**: contrôleurs (PID, etc.)
- **`backend/src/safety/`**: superviseur/failsafe
- **`backend/src/uart/`**: protocole + lien série
- **`backend/src/utils/`**: logs + helpers

### `frontend/` (UI)

- **`frontend/Dashboard/`**
  - `Dashboard.html`: UI principale dashboard
  - `Dashboard.js`: logique UI, WS/polling, overlays
  - `Dashboard.css`: styles
  - `dashboard-aquawing.css`: thème AquaWing (layout)
- **`frontend/Missions/`**
  - `Missions.html`, `Missions.js`, `Missions.css`
- **`frontend/Heatmap/`**, **`frontend/Systems/`**, **`frontend/Optical/`**, **`frontend/Settings/`**, **`frontend/PID Settings/`**, **`frontend/Electrical Wiring/`**, **`frontend/login/`**, **`frontend/static/`**
  - pages et assets dédiés (html/js/css).

### `config/`

- **`config/system.yaml`**: paramètres runtime (caméras, seuils, weights, etc.)
- **`config/cablage.py`**: ports UART/GPS/câblage.

## IA — `backend/src/ia_prediction/`

### Objectif

Analyser une vidéo drone (vue top-down mer), détecter les nageurs, suivre leurs trajectoires, extraire des features cinématiques et produire un **score de risque de noyade** en temps réel.

### Import / exécution

Depuis la racine du projet :

```bash
PYTHONPATH=backend/src python -c "from ia_prediction.pipeline import process_frame; print('OK')"
```

### Pipeline (par frame)

1. **Detection** (YOLOv8)
2. **Tracking** (ByteTrack via `boxmot`) → `track_id` stable
3. **Feature extraction** (vecteur 7D) sur historique par track
4. **Behavior classification** (règles)
5. **Drowning prediction** (LSTM) → score \([0, 1]\), fallback règles si séquence trop courte
6. **Alerting** si `risk_score > RISK_ALERT_THRESHOLD`
7. **Visualization** (overlay OpenCV)

### Fichiers clés

- `backend/src/ia_prediction/pipeline.py` : orchestration pipeline IA (process_frame, process_video)
- `backend/src/ia_prediction/config.py` : configuration globale IA (seuils, modèles, paths)
- `backend/src/ia_prediction/__init__.py` : package init

- `backend/src/ia_prediction/services/`
  - `detector.py` : YOLOv8 singleton pour détection person
  - `tracker.py` : ByteTrack + historique trajectoire par swimmer
  - `feature_extractor.py` : extraction 7 features cinématiques
  - `behavior_classifier.py` : classification comportement (normal|suspicious|drowning_risk)
  - `drowning_predictor.py` : LSTM predictor + fallback règles
  - `alerter.py` : gestion AlertEvent + logs JSON
  - `visualizer.py` : overlay détections sur frames
  - `__init__.py` : service package init

- `backend/src/ia_prediction/models/`
  - `schemas.py` : Pydantic models (SwimmerFeatures, DetectedSwimmer, FrameResult, AlertEvent)
  - `lstm_predictor.pt` : poids LSTM entraîné (généré par train_lstm.py)
  - `__init__.py` : models package init

- `backend/src/ia_prediction/training/`
  - `download_dataset.py` : télécharge dataset SeaDronesSee pour entraînement
  - `train_lstm.py` : entraîne LSTM drowning predictor (CPU-friendly Pi)
  - `seadronessee_loader.py` : DataLoader pour SeaDronesSee
  - `__init__.py` : training package init
  - `data/` : datasets locaux téléchargés

- `backend/src/ia_prediction/tests/`
  - `test_detector.py` : tests YOLOv8 detector
  - `test_tracker.py` : tests ByteTrack tracking
  - `test_feature_extractor.py` : tests feature extraction
  - `test_behavior_classifier.py` : tests classification comportement
  - `test_predictor.py` : tests drowning prediction
  - `__init__.py` : tests package init

### Données & entraînement

- Génération datasets / séquences :

```bash
PYTHONPATH=backend/src python backend/src/ia_prediction/training/download_dataset.py
```

- Entraînement LSTM (Pi-friendly) :

```bash
PYTHONPATH=backend/src python backend/src/ia_prediction/training/train_lstm.py
```

Sortie : `backend/src/ia_prediction/models/lstm_predictor.pt`

### Tests

```bash
PYTHONPATH=backend/src pytest backend/src/ia_prediction/tests/ -q
```

---

## Backend Détaillé — Tous les fichiers

### `backend/main.py`
- App FastAPI "standalone" avec routes statiques + endpoints média
- Monte les routes REST (/api), WebSocket (/ws), et fichiers statiques
- Gère CORS, templating, et configuration runtime

### `backend/server.py`
- Factory `create_app()` pour créer app FastAPI configurée
- Séparation concern : app logic vs déploiement
- Usable pour tests, factory pattern

### `backend/api.py`
- Routes REST sous `/api/*` prefix
- Endpoints : `/api/status`, `/api/telemetry`, `/api/command`
- Pydantic models : DroneStatus, TelemetryData, CommandRequest
- TODO : validation commandes, transmission réelle au FC

### `backend/websocket.py`
- WebSocket sur `/ws` pour télémétrie temps réel
- Gestion multi-clients (broadcast telemetry)
- Commandes supportées : send_route, start_flight, abort, rtl, set_speed
- Auth via session cookies + backend.auth
- TODO : simulation position de base Tunis

### `backend/auth.py`
- Login/logout endpoints
- Session/cookies management
- Validation credentials vs users.json
- TODO : hash passwords, implement role-based access

### `backend/__init__.py`
- Package init backend

### `backend/logs/`
- Répertoire logs runtime (uvicorn, app logs)

### `backend/src/__init__.py`
- Package init src (modules métier)

### `backend/src/mission/mission_manager.py`
- Waypoint classe : lat, lon, altitude, speed, completed
- Gestion missions : planification, execution, state machine
- TODO : validation waypoints, algorithme planification

### `backend/src/mission/__init__.py`
- Mission package init

### `backend/src/navigation/guidance.py`
- Guidance autonome : trajectoires, calculs distance/bearing
- Intégration avec mission manager
- TODO : implémentation algorithms navigation

### `backend/src/navigation/__init__.py`
- Navigation package init

### `backend/src/control/flight_controller.py`
- PID controllers pour pitch, roll, yaw, altitude
- Motor mixing et stabilisation vol
- Modes vol : STABILIZE, GUIDED, AUTO
- Persistence des PID gains
- TODO : PID loops réels, motor mixing table

### `backend/src/control/__init__.py`
- Control package init

### `backend/src/perception/detector.py`
- Interface ObjectDetector (délègue à ia_detection)
- Enable/disable detection
- Wrapper JPEG input → liste detections (via RF-DETR ou YOLO)

### `backend/src/perception/cameras/rgb_camera.py`
- RGBCamera wrapper : capture via libcamera (rpicam)
- Gets latest frame, expose résolution/FPS

### `backend/src/perception/cameras/thermal_camera.py`
- ThermalCamera : capture vidéo thermique
- Interface compatible RGB camera

### `backend/src/perception/__init__.py`
- Perception package init

### `backend/src/streaming/rgb_camera_stream.py`
- RGBStreamer singleton : rpicam-vid MJPEG stream
- Expose dernière frame JPEG pour `/video` endpoint
- Configurable résolution, FPS, quality depuis system.yaml

### `backend/src/streaming/vedio_heatmap_stream.py`
- HeatmapStreamer : thermique JPEG stream
- Expose `/thermal` endpoint (dernière frame thermique)

### `backend/src/streaming/video_stream.py`
- Generic video streaming base class
- Support MJPEG, frame caching, multi-client

### `backend/src/streaming/__init__.py`
- Streaming package init

### `backend/src/safety/supervisor.py`
- SafetySupervisor : monitoring santé système
- Watchdog, failsafe logic, emergency landing
- Constraints : max_altitude, max_speed, min_battery, max_airtime
- TODO : automatic failsafe transitions

### `backend/src/safety/__init__.py`
- Safety package init

### `backend/src/uart/uart_link.py`
- UARTLink : communication série (serial port)
- Config FLIGHT_CONTROLLER (/dev/ttyAMA0) vs GPS (/dev/ttyS0)
- Open, close, read, write primitives
- TODO : reconnection logic, message queuing

### `backend/src/uart/protocol.py`
- Protocol définitions : message formats, parsing
- MAVLink ou custom drone protocol

### `backend/src/uart/__init__.py`
- UART package init

### `backend/src/utils/logger.py`
- Logger configuré (console + fichier)
- Centralisé pour tous modules

### `backend/src/utils/__init__.py`
- Utils package init

### `backend/src/ia_detection.py`
- Façade IA "legacy" : RF-DETR person detector
- Singleton get_person_detector()
- Utilisé par ObjectDetector (perception/)

### `backend/src/ia detection/`
- **Attention** : dossier legacy pour RF-DETR (external submodule)
- Ne pas confondre avec `ia_prediction/` (module nouveau swimmer/drowning)

### `backend/src/ia detection/rfdetr_engine.py`
- Wrapper RF-DETR : inférence detection
- YOLO-like interface (detect_jpeg, detect_frame)

### `backend/src/ia detection/rgb_detection_service.py`
- Service RGB detection : worker thread
- Traite frames RGB, retourne detections
- Enrichit le statut pour l’UI Optical : `swim_count`, `unsure_count`, `alert_count` + `detections[]` (boxes normalisées).

### `backend/src/ia detection/drowning_overlay.py`
- Adaptateur entre `ia_prediction` et l’overlay Optical.
- Convertit les `swimmers` en boxes normalisées (`x,y,w,h`) + champs UI :
  - `status`: `swimming` | `suspicious` | `drowning` | `person`
  - `label`: **SAIT NAGER** | **INCERTAIN** | **NE SAIT PAS NAGER** | **PERSONNE**
  - `can_swim`, `swim_skill`, `behavior`, `risk_score`, `track_id`

### `backend/src/ia detection/__init__.py`
- IA detection package init

---

## Frontend Détaillé — Tous les fichiers

### `frontend/Dashboard/` — Dashboard Principal
- **Dashboard.html** : structure UI principale
- **Dashboard.js** : logique app, WS client, polling telemetry, overlays interactifs
- **Dashboard.css** : styles spécifiques
- **dashboard-aquawing.css** : thème layout AquaWing

### `frontend/Missions/` — Gestion Missions
- **Missions.html** : UI mission planning
- **Missions.js** : logique waypoint editor, mission upload/execute
- **Missions.css** : styles missions

### `frontend/Heatmap/` — Thermique
- **Heatmap.html** : viewer thermique
- **Heatmap.js** : stream thermal video, overlay heatmap overlay
- **Heatmap.css** : styles heatmap

### `frontend/Systems/` — État Système
- **Systems.html** : status batterie, GPS, motor health
- **Systems.js** : polling /api/status, affichage live
- **Systems.css** : styles

### `frontend/Optical/` — Caméra RGB
- **Optical.html** : viewer vidéo RGB
- **Optical.js** : stream RGB video, contrôle zoom/pan
- **Optical.css** : styles

#### Overlay IA Optical (RGB)

- **Source data** : `GET /api/detect/rgb/status`.
- **Cadence** : analyse périodique (par défaut ~5s), pas chaque frame.
- **Couleurs / signification** :
  - **Vert** : **SAIT NAGER** (`status=swimming`, `behavior=normal_swimming`)
  - **Orange** : **INCERTAIN** (`status=suspicious`, `behavior=suspicious`)
  - **Rouge** : **NE SAIT PAS NAGER / NOYADE** (`status=drowning`, `behavior=drowning_risk` ou `risk_score` élevé)
- **Fallback** : si `ia_prediction` indisponible → YOLO “person-only” (`status=person`, `behavior=detected_only`).

### `frontend/Settings/` — Paramètres
- **Settings.html** : UI config système
- **Settings.js** : sauvegarde config → backend
- **Settings.css** : styles

### `frontend/PID Settings/` — Tuning PID
- **PID Settings.html** : UI tuning gains PID
- **PID Settings.js** : envoi gains au FC
- **PID Settings.css** : styles

### `frontend/Electrical Wiring/` — Câblage
- **Electrical Wiring.html** : diagram câblage
- **Electrical Wiring.js** : interactif diagram
- **Electrical Wiring.css** : styles

### `frontend/login/` — Login
- **login.html** : formulaire login
- **login.css** : styles login

### `frontend/static/` — Assets Partagés
- **index.html** : main HTML entry point
- **app.js** : app core logic (routing, page switching, WS init)
- **style.css** : styles globaux

---

## Config & Déploiement

### `config/system.yaml`
- Configuration runtime : caméras, détection seuils, model paths, port UART
- Loadable at startup (hot-config)
- Overridable via env vars

### `config/cablage.py`
- Constantes câblage : UART ports, pins GPIO, adresses I2C
- FLIGHT_CONTROLLER config, GPS config

### `deploy/systemd/`
- **rpi_high_level.service.example** : systemd service pour auto-start backend
- Copy + customize pour deployment Pi

### `deploy/cloudflare/`
- **install_cloudflared.sh** : install script Cloudflare Tunnel
- **cloudflared-config.yml.example** : config tunnel
- **cloudflared.service.example** : systemd service Tunnel
- **README_CLOUDFLARE_TUNNEL.md** : doc deployment

### `docs/`
- **ARCHITECTURE.txt** : doc archi (legacy)
- **CLOUDFLARE_TUNNEL.md** : doc tunnel
- **MAP_README.md** : doc mapping/routes

---

## Racine — Fichiers globaux

### `main.py`
- Entry point principal : import backend.server, create_app(), run uvicorn

### `requirements.txt`
- Dépendances Python globales (FastAPI, ultralytics YOLO, boxmot, PyTorch, OpenCV, etc.)

### `requirements-ai.txt`
- Anciennes dépendances IA (legacy, peut être deprecated)

### `users.json`
- Comptes démo pour auth (user/password)

### `README.md`
- Documentation projet principale

### `ARCHITECTURE.md`
- Ce fichier : doc archi complète

### `ANALYSE_COMPLETE.md`
- Notes/rapport analyse projet (documentation interne)

### `ANALYSE_PROFONDE.md`
- Rapport analyse approfondie (documentation interne)

### `DIAGNOSTIC_SYSTEME.md`
- Diagnostic/notes système (documentation interne)

### `RAPPORT_COMPLET_SITE.md`
- Rapport complet UI/website (documentation interne)

### `ROUTES_FRONTEND.md`
- Mapping routes/pages frontend (documentation)

### `run_server.txt`
- Notes commande démarrage dev server

### `auto_push.sh`
- Script git automation (auto-commit + push)

---

*Documentation générée automatiquement - AquaWing v5*

