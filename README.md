# RPi High-Level Drone Control System

A complete Raspberry Pi-based drone control system with:
- **Backend**: FastAPI server running locally on the Raspberry Pi
- **Frontend**: Static HTML/CSS/JS dashboard served by the backend
- **Public Access**: Cloudflare Tunnel for secure remote browser access (works through 4G, Airbox, CG-NAT)
- **Real-time Telemetry**: WebSocket support for live drone data streaming
- **Authentication**: Placeholder login system (TODO: implement real auth)

## Architecture

```
Internet (Remote Browser)
    ↓
Cloudflare Tunnel (cloudflared)
    ↓
Raspberry Pi (localhost:8000)
    ├── FastAPI Backend
    ├── Frontend (static HTML/CSS/JS)
    └── WebSocket Telemetry Stream
```

## Quick Start

### Prerequisites
- Raspberry Pi (4GB+ RAM recommended)
- Python 3.8+
- Internet connection

### Installation

1. **Clone and navigate to project:**
   ```bash
   cd rpi_high_level
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the backend:**
   ```bash
   python main.py
   ```
   Backend will be available at `http://localhost:8000`

4. **Set up Cloudflare Tunnel** (for remote access):
   See [deploy/cloudflare/README_CLOUDFLARE_TUNNEL.md](deploy/cloudflare/README_CLOUDFLARE_TUNNEL.md)

## Project Structure

- `main.py` - Application entry point
- `backend/` - FastAPI app, REST API, WebSocket handlers
- `frontend/` - HTML/CSS/JS dashboard
- `config/` - System configuration files
- `uart/` - UART communication protocol (TODO)
- `mission/` - Mission planning and execution (TODO)
- `navigation/` - Guidance and navigation (TODO)
- `perception/` - Computer vision and sensor processing (TODO)
- `streaming/` - Video streaming pipeline (TODO)
- `safety/` - Safety supervisor and failsafe logic (TODO)
- `utils/` - Logging and utility functions
- `deploy/` - Deployment scripts for production
- `logs/` - Application logs

## API Endpoints

### REST API
- `GET /api/status` - Drone status
- `GET /api/telemetry` - Latest telemetry data
- `POST /api/command` - Send command to drone

### WebSocket
- `WS /ws/telemetry` - Real-time telemetry stream

### Frontend
- `GET /` - Dashboard (served as static files)

## TODO Items

- [ ] Implement real authentication (OAuth2, JWT tokens)
- [ ] Add UART communication with drone hardware
- [ ] Implement mission planning and execution
- [ ] Add guidance and navigation logic
- [ ] Implement perception and computer vision
- [ ] Add video streaming support
- [ ] Implement safety supervisor
- [ ] Add production-ready error handling
- [ ] Add comprehensive logging

## Deployment

### Local Development
```bash
python main.py
```

### Production with Systemd
```bash
sudo cp deploy/systemd/rpi_high_level.service.example /etc/systemd/system/rpi_high_level.service
sudo systemctl enable rpi_high_level
sudo systemctl start rpi_high_level
```

### Remote Access with Cloudflare Tunnel
Follow the setup guide in `deploy/cloudflare/README_CLOUDFLARE_TUNNEL.md`

## Security Notes

- This is a reference implementation with placeholder authentication
- Do NOT use in production without proper security measures
- Enable HTTPS for remote access (Cloudflare Tunnel handles this)
- Implement proper access control and authentication tokens
- Validate all user input and API requests
- Use environment variables for sensitive configuration

## License

[Specify your license here]
