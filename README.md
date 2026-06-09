# 🚁 AquaWing — Advanced Drone Control System

**AquaWing** is a professional, real-time drone tracking, telemetry, and mission control platform designed for **Raspberry Pi** deployment. It provides comprehensive live monitoring, mission planning, dual-camera streaming, AI-powered detection, and full UAV command control through a modern, responsive web dashboard.

---

## 📌 Overview

AquaWing enables:

* 🌍 **Real-time drone tracking** on interactive Leaflet maps
* 📡 **Live telemetry streaming** via WebSocket (2Hz+)
* 🎯 **Mission planning & waypoint management** with route visualization
* 🎮 **Full drone command & control interface** with safety checks
* 🎥 **Dual camera streaming** (RGB + Thermal) with MJPEG support
* 🤖 **AI-powered object detection** with confidence scoring
* ⚙️ **Advanced PID tuning** for flight controller optimization
* 🔥 **Heatmap detection system** for drowning case monitoring
* 🔐 **Secure session-based authentication** with user management
* 🎨 **Tactical mode** with military-style UI theme
* 📊 **Mission statistics** tracking (time, distance, area scanned)
* 🚨 **Real-time alert system** for critical events
* ⚡ **AI Advisor** for flight recommendations

Built with:

* **FastAPI** (Backend API & WebSocket server)
* **Leaflet.js** (Interactive map UI)
* **Raspberry Pi** (Edge deployment)
* **UART Communication** (Flight controller link)
* **WebSocket** (Real-time bidirectional communication)

---

## 🗂 Project Structure

```
AquaWing/
│
├── main.py                  # Application entry point
├── requirements.txt         # Python dependencies
├── users.json               # User credentials (demo)
├── README.md
│
├── backend/                 # Backend application
│   ├── main.py              # Standalone FastAPI app
│   ├── server.py            # Modular app factory
│   ├── api.py               # REST API endpoints
│   ├── auth.py              # Authentication logic
│   ├── websocket.py         # WebSocket telemetry
│   │
│   ├── src/
│   │   ├── mission/         # Mission planning & execution
│   │   │   └── mission_manager.py
│   │   ├── navigation/      # Guidance & trajectory control
│   │   │   └── guidance.py
│   │   ├── perception/      # Computer vision & sensors
│   │   │   ├── detector.py
│   │   │   └── cameras/
│   │   │       ├── rgb_camera.py
│   │   │       └── thermal_camera.py
│   │   ├── safety/          # Safety supervisor & failsafe
│   │   │   └── supervisor.py
│   │   ├── control/         # Flight controllers (PID, etc.)
│   │   ├── streaming/       # Video streaming (MJPEG, RTSP)
│   │   │   └── video_stream.py
│   │   ├── uart/            # Hardware serial communication
│   │   │   ├── protocol.py
│   │   │   └── uart_link.py
│   │   └── utils/           # Logging & helpers
│   │       └── logger.py
│   │
│   └── logs/                # Runtime logs
│
├── frontend/                # Web dashboard
│   ├── static/
│   │   ├── map.html         # Main AquaWing dashboard
│   │   ├── map.js           # Dashboard controller & logic
│   │   ├── map.css          # Dashboard styling
│   │   ├── login.html       # Login page
│   │   ├── index.html       # Dashboard landing
│   │   ├── app.js           # Dashboard app logic
│   │   └── style.css        # Dashboard styles
│   │
│   └── map_standalone.html  # Standalone map (no server)
│
├── config/                  # System configuration
│   └── system.yaml
│
├── deploy/                  # Deployment configs
│   ├── cloudflare/          # Cloudflare Tunnel setup
│   └── systemd/             # Systemd service files
│
├── tests/                   # Test suite
├── docs/                    # Documentation
└── tools/                   # Utility scripts
    ├── check_server.sh
    ├── print_ip.sh
    └── run_dev.sh
```

---

## 🚀 Quick Start

### Prerequisites

* Python 3.8+
* Raspberry Pi (recommended) or any Linux system
* pip package manager

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/AquaWing.git
cd AquaWing

# Install Python dependencies
pip install -r requirements.txt

# Run the application
python main.py
```

The server will start on `http://localhost:8000`

### Optical (RGB) + IA “2 parties” (sait nager / ne sait pas)

Sur la page **Optical**, l’IA fonctionne en **2 parties** :

- **Partie 1 (YOLO)** : détecte une **personne** (boîte “PERSONNE” si la partie 2 n’est pas disponible).
- **Partie 2 (`ia_prediction`)** : analyse le comportement de nage et affiche :
  - **Vert** : **SAIT NAGER** (`normal_swimming`)
  - **Orange** : **INCERTAIN** (`suspicious`)
  - **Rouge** : **NE SAIT PAS NAGER / NOYADE** (`drowning_risk` ou `risk_score` élevé)

Important : l’analyse “comportement” nécessite plusieurs frames (poll toutes les ~5s par défaut), donc l’état peut mettre un peu de temps à se stabiliser.

### IA Swimmer / Drowning (module `ia_prediction`)

Le module IA est dans `backend/src/ia_prediction/`. Pour l’importer depuis la racine :

```bash
PYTHONPATH=backend/src python -c "from ia_prediction.pipeline import process_frame, process_video; print('ia_prediction OK')"
```

Architecture détaillée : `ARCHITECTURE.md`.

### 🔑 Demo Credentials

```
Username: admin
Password: admin123
```

---

## ⚙️ Core Features

### 🌍 Real-Time Map Dashboard

* **Leaflet-based interactive map** with satellite/terrain views
* **Live drone tracking** with heading indicator
* **Flight path visualization** with route history
* **Waypoint management** (click-to-add waypoints)
* **GPS live updates** with coordinate display
* **Map controls**: Follow mode, center, clear track, waypoints toggle

### 📡 Telemetry HUD

* **Attitude indicator** (artificial horizon) with pitch/roll
* **Battery gauge** (circular progress) with voltage display
* **GPS status** with satellite count and fix quality
* **Altitude & speed** monitoring
* **Heading compass** display
* **Distance traveled/remaining** tracking
* **Live updates** at 2Hz+ via WebSocket

### 🎯 Mission Control

* **Mission planning** with waypoint creation
* **Route management** with distance calculation
* **Mission execution** controls:
  * START FLIGHT
  * PAUSE / RESUME
  * PRE-FLIGHT CHECK
  * EMERGENCY RTL (Return to Launch)
  * END MISSION
* **Mission statistics** card:
  * Mission timer (auto-increment)
  * Distance covered (km)
  * Area scanned (m²)
  * Number of detections

### 🎥 Camera Feeds

* **RGB Camera**:
  * MJPEG streaming
  * Pi native modes (résolution + FPS fixe par mode) :
    * 1536×864 @ 120 FPS
    * 2304×1296 @ 56 FPS
    * 1920×1080 @ 50 FPS
    * 4608×2592 @ 14 FPS
  * Brightness, contrast, saturation controls
  * Professional placeholder UI with animated loader
  * "Connecting to RGB Camera..." → "Awaiting video signal..." (after 5s)
  
* **Thermal Camera**:
  * Thermal imaging stream
  * Color palette selection (Ironbow, Rainbow, Grayscale, Hot)
  * Temperature range configuration
  * Auto emissivity option

* **AI Analysis**:
  * Real-time object detection
  * Confidence threshold adjustment
  * Bounding box visualization
  * Label display options
  * “2 parties” overlay on Optical: **SAIT NAGER / INCERTAIN / NE SAIT PAS NAGER**

### 🤖 AI Detection Panel

* **Detection Mode**:
  * Human Search
  * Thermal Assist
  * Standby
  
* **Confidence Meter**:
  * Animated progress bar
  * Color-coded (low/medium/high)
  * Real-time percentage display
  
* **Risk Level**:
  * LOW / MEDIUM / HIGH indicators
  * Visual color coding
  
* **Last Detection Timestamp**

### ⚙️ Systems Panel

* **Power / Electrical**:
  * Battery voltage, current, power consumption
  * Bus voltage
  * Battery temperature
  
* **Motors**:
  * Motor 1-4 status monitoring
  * Temperature tracking
  * Power/current/voltage per motor
  
* **Sensors**:
  * IMU status
  * GPS fix status
  * Barometer readings
  * Compass calibration

### 🎛️ PID Settings Panel

* **Flight Controller Tuning**:
  * Roll PID (P, I, D)
  * Pitch PID (P, I, D)
  * Yaw PID (P, I, D)
  * Altitude PID (P, I, D)
  
* **Real-time updates** via API
* **Save & Reset** functionality
* **Default values** restoration

### 🔥 Heatmap - Drowning Detection Panel

* **Interactive Map Display**:
  * Black and white map view for enhanced visibility
  * Full-screen map with zoom and pan controls
  * Real-time detection point visualization
  
* **Detection System**:
  * **Start/Stop Scan** button for continuous monitoring
  * **Clear Points** button to reset all detections
  * Automatic scanning every 3 seconds (configurable)
  
* **Visual Indicators**:
  * 🔴 **Red markers** for drowning cases detected
  * 🟢 **Green markers** for normal persons detected
  * Clickable markers with location details in popups
  
* **Real-time Statistics**:
  * Total detections count
  * Drowning cases count (red)
  * Normal persons count (green)
  * Auto-updating counters
  
* **Map Features**:
  * Grayscale map tiles for better contrast
  * Leaflet-based interactive map
  * GPS coordinate display on markers
  * Responsive layout

### 🎨 Speed Control Panel

* **Speed slider** (0-10 m/s)
* **Real-time value display**
* **Telemetry overview**:
  * Battery status
  * GPS satellites
  * Altitude & speed
  * Heading & distance

### 🚨 Alert Notification System

* **Floating alert cards** (top-right)
* **Auto-fade after 6 seconds**
* **Color-coded alerts**:
  * Yellow (warning)
  * Red (critical)
  
* **Trigger conditions**:
  * Battery < 25%
  * GPS lost
  * Wind > 35 km/h
  * AI detects victim > 85% confidence
  
* **Stacking support** for multiple alerts

### 🎯 Tactical Mode

* **Military-style UI theme**
* **Neon green accent colors**
* **Enhanced visibility** for critical operations
* **Toggle button** in top status bar

### ⚡ AI Advisor

* **Flight recommendations**
* **System analysis**
* **Risk assessment**
* **Accessible via top status bar**

### 🔐 Authentication & Security

* **Session-based login** with cookie authentication
* **User registration** support
* **Protected routes** (dashboard requires authentication)
* **Secure logout** functionality

### 🌐 Multi-language Support

* English
* Français (French)
* العربية (Arabic)

---

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/login` | GET/POST | Login page & authentication |
| `/register` | POST | Create new user account |
| `/logout` | GET | Logout & destroy session |
| `/map` | GET | Protected dashboard |
| `/health` | GET | Server health check |
| `/ws` | WebSocket | Live telemetry stream (2Hz+) |
| `/api/status` | GET | Drone system status |
| `/api/telemetry` | GET | Telemetry snapshot |
| `/api/command` | POST | Send drone command |
| `/api/missions` | GET/POST | Mission management |
| `/api/pid` | GET/POST | PID tuning (get/update) |
| `/video` | GET | RGB camera MJPEG stream |
| `/thermal` | GET | Thermal camera stream |
| `/api/detect/rgb/status` | GET | RGB IA status + detections (overlay-ready) |
| `/api/detect/rgb/start` | POST | Start RGB IA worker |
| `/api/detect/rgb/stop` | POST | Stop RGB IA worker |
| `/api/detect/rgb/backend` | POST | Set IA backend (auto/yolo/rfdetr) |
| `/api/detect/rgb/backends` | GET | List available backends |
| `/api/detect/swimmers` | GET | Raw `ia_prediction` swimmers + behaviors + risk |

### Command Types

* `arm` / `disarm` - Arm/disarm motors
* `takeoff` - Takeoff to specified altitude
* `land` - Land at current position
* `move` - Move to coordinates
* `rtl` - Return to launch
* `hover` - Hover in place

---

## 🏗 System Architecture

```
┌─────────────┐
│   Browser   │
│  (Dashboard)│
└──────┬──────┘
       │ HTTP/WebSocket
       │
┌──────▼──────────────────┐
│   FastAPI Backend       │
│  ┌──────────────────┐   │
│  │  REST API        │   │
│  │  WebSocket       │   │
│  │  Authentication  │   │
│  └──────────────────┘   │
│         │                │
│  ┌──────▼──────────┐    │
│  │  Mission Mgr    │    │
│  │  Navigation     │    │
│  │  Perception     │    │
│  │  Safety         │    │
│  │  Control (PID)  │    │
│  └──────┬──────────┘    │
└─────────┼────────────────┘
          │ UART Serial
          │
┌─────────▼─────────┐
│ Flight Controller │
│   (Pixhawk/etc)   │
└───────────────────┘
```

---

## 🧠 Design Philosophy

AquaWing is built with:

* **Modular backend architecture** - Clear separation of concerns
* **Hardware abstraction layer** - Works with/without physical hardware
* **Scalable real-time communication** - WebSocket for low-latency updates
* **Raspberry Pi optimization** - Lightweight, efficient resource usage
* **Professional UI/UX** - Modern, responsive, accessible design
* **Safety-first approach** - Built-in failsafe and supervision systems

---

## 🛠 Deployment

### Local Development

```bash
python main.py
```

### Systemd Service

```bash
# Copy service file
sudo cp deploy/systemd/aquawing.service /etc/systemd/system/

# Enable and start
sudo systemd enable aquawing
sudo systemd start aquawing
```

### Cloudflare Tunnel

See `deploy/cloudflare/` for tunnel configuration.

### Standalone Map Mode

Open `frontend/map_standalone.html` in browser (no backend required).

---

## 📦 Dependencies

### Python (Backend)

* `fastapi` - Web framework
* `uvicorn` - ASGI server
* `websockets` - WebSocket support
* `python-multipart` - Form data handling
* `pyyaml` - Configuration parsing
* `pydantic` - Data validation
* `pyserial` - UART communication
* `numpy` - Numerical operations
* `Pillow` - Image processing

### Frontend

* **Leaflet.js** (CDN) - Map library
* **Vanilla JavaScript** - No framework dependencies
* **CSS3** - Modern styling with animations

---

## 🔧 Configuration

### System Config

Edit `config/system.yaml` for:
* UART port settings
* Camera configurations
* Safety thresholds
* Mission parameters

### User Management

Edit `users.json` to add/modify users:
```json
{
  "admin": {
    "password": "admin123",
    "role": "admin"
  }
}
```

---

## 🧪 Testing

```bash
# Run test suite
cd tests
python -m pytest

# Test API endpoints
curl http://localhost:8000/api/status
curl http://localhost:8000/api/telemetry
```

---

## 📌 Future Improvements

* [ ] MAVLink protocol integration
* [ ] Advanced AI-based object detection (YOLO, etc.)
* [ ] Autonomous mission planner with obstacle avoidance
* [ ] Multi-drone fleet support
* [ ] Cloud dashboard with data persistence
* [ ] Mobile app (iOS/Android)
* [ ] Video recording and playback
* [ ] Advanced telemetry logging and analysis
* [ ] Integration with weather APIs
* [ ] Real-time video streaming (WebRTC)

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## 📜 License

MIT License - See LICENSE file for details

---

## 🙏 Acknowledgments

* Leaflet.js for map functionality
* FastAPI for the excellent web framework
* Raspberry Pi Foundation for hardware platform

---

## 📞 Support

For issues, questions, or contributions:

* Open an issue on GitHub
* Check the documentation in `docs/`
* Review `ANALYSE_COMPLETE.md` for system analysis

---


