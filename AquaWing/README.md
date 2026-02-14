# AquaWing — Drone Control System Ahmed

Real-time drone tracking, telemetry, and mission control platform running on Raspberry Pi.

## Project Structure

```
AquaWing/
├── main.py                  # Application entry point
├── requirements.txt         # Python dependencies
├── users.json               # User credentials (demo)
├── README.md
│
├── backend/
│   ├── main.py              # Monolithic FastAPI app (standalone mode)
│   ├── server.py            # App factory (modular mode)
│   ├── api.py               # REST API endpoints
│   ├── auth.py              # Session-based authentication
│   ├── websocket.py         # WebSocket telemetry endpoints
│   ├── __init__.py
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
├── frontend/
│   ├── static/
│   │   ├── map.html         # AquaWing dashboard (main UI)
│   │   ├── map.js           # Map + telemetry controller
│   │   ├── map.css          # Dashboard styling
│   │   ├── login.html       # Login page
│   │   ├── index.html       # Dashboard landing
│   │   ├── app.js           # Dashboard app logic
│   │   └── style.css        # Dashboard styles
│   └── map_standalone.html  # Standalone map (no server)
│
├── config/
│   └── system.yaml          # System configuration
│
├── deploy/
│   ├── cloudflare/          # Cloudflare Tunnel setup
│   └── systemd/             # Systemd service files
│
├── tests/                   # Test suite
├── docs/                    # Documentation
└── tools/                   # Dev & utility scripts
    ├── check_server.sh
    ├── print_ip.sh
    └── run_dev.sh
```

## Quick Start

```bash
cd AquaWing
pip install -r requirements.txt
python main.py
```

Open browser: `http://localhost:8000`

**Demo credentials:** admin / admin123

## Features

- **Real-time Map**: Leaflet-based drone tracking with flight path
- **Telemetry HUD**: Attitude indicator, battery gauge, GPS data
- **Mission Control**: Waypoint planning, route management
- **Power Panel**: Motor/servo/sensor monitoring (simulated)
- **Camera Feeds**: RGB + Thermal camera panels
- **WebSocket**: Live telemetry streaming at 2Hz
- **Authentication**: Session-based login with cookie auth
- **User Registration**: Create new accounts via `/register`

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/login` | GET/POST | Login page / authenticate |
| `/register` | POST | Create new user |
| `/logout` | GET | Destroy session |
| `/map` | GET | Dashboard (protected) |
| `/health` | GET | Health check |
| `/ws` | WebSocket | Live telemetry stream |
| `/api/status` | GET | Drone status |
| `/api/telemetry` | GET | Telemetry data |
| `/api/command` | POST | Send drone command |
| `/api/missions` | GET/POST | Mission management |
| `/video` | GET | RGB camera frame |

## Architecture

```
Browser  ──HTTP/WS──▶  FastAPI Backend  ──UART──▶  Flight Controller
   │                        │
   │  ← telemetry JSON ←   │  ← sensor data ←
   │  → commands JSON   →   │  → control cmds →
```
