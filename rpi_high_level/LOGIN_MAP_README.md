# 🚁 RPi Drone Control - Complete LOGIN → MAP System

A complete authentication and real-time drone tracking system for Raspberry Pi with:
- ✅ Secure login system with session management
- ✅ Protected Leaflet map with real-time WebSocket telemetry
- ✅ Demo data (Tunis) for testing
- ✅ Local + HTTPS compatible WebSocket URL
- ✅ Auto-reconnection on disconnect
- ✅ HUD with live telemetry (position, altitude, heading, speed, battery)

## 📋 System Architecture

```
Frontend:                Backend:
┌─────────────────┐     ┌──────────────────────┐
│   Login Page    │────▶│   POST /login        │
│   (login.html)  │     │   (Session created)  │
└─────────────────┘     └──────────────────────┘
        │                         │
        └─────────────────────────┘
                 ▼
        ┌─────────────────────┐
        │   Cookie Set        │
        │  (HttpOnly, Secure) │
        └─────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────┐
│         Protected Map Page           │
│  ┌────────────────────────────────┐  │
│  │  Leaflet Map + HUD             │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │ WS Status: Live          │  │  │
│  │  │ Lat: 36.8065 Lon: 10.18  │  │  │
│  │  │ Alt: 15.3m Speed: 2.5m/s │  │  │
│  │  │ Battery: 85% Follow: ON  │  │  │
│  │  └──────────────────────────┘  │  │
│  │  🚁 Drone marker (rotating)    │  │
│  │  ✈️  Flight path (polyline)    │  │
│  └────────────────────────────────┘  │
│        WebSocket /ws (Protected)     │
└──────────────────────────────────────┘
```

## 🚀 Quick Start

### 1. Prerequisites

```bash
# Check Python version (3.8+)
python3 --version

# Install FastAPI & Uvicorn
pip install fastapi uvicorn python-multipart pydantic
```

### 2. Navigate to Project

```bash
cd /home/ahmed/drone/rpi_high_level
```

### 3. Activate Virtual Environment

```bash
# Create if not exists
python3 -m venv .venv

# Activate
source .venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

### 4. Start Backend Server

```bash
# Option A: Direct command
python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000

# Option B: Using launch script (recommended)
bash LAUNCH.sh
```

### 5. Access from Your PC

Open your browser and visit:
```
http://172.20.10.5:8000/login
```

### 6. Login with Demo Credentials

- **Username:** `admin`
- **Password:** `admin123`

After login, you'll see:
- ✅ Real-time Leaflet map centered on Tunis
- ✅ Live drone position (demo data, circular flight)
- ✅ HUD with telemetry data
- ✅ Follow button (camera follows drone)
- ✅ Logout button

---

## 📁 Project Structure

```
rpi_high_level/
├── backend/
│   ├── __init__.py
│   ├── server.py           ← FastAPI app with auth routes
│   ├── auth.py             ← Session management
│   ├── websocket.py        ← Protected WebSocket endpoint
│   ├── api.py              ← REST API routes
│   └── __pycache__/
│
├── frontend/
│   ├── login.html          ← Login page
│   ├── map.html            ← Map page (protected)
│   ├── map.js              ← Map controller + WS client
│   ├── map.css             ← Styling (HUD + responsive)
│   ├── index.html          ← Old index (kept for compatibility)
│   ├── style.css           ← Old styles
│   └── app.js              ← Old app
│
├── main.py                 ← Entry point
├── requirements.txt        ← Python dependencies
├── LAUNCH.sh               ← Start script
├── README.md               ← This file
└── config/
    └── system.yaml         ← Configuration
```

---

## 🔐 Authentication Flow

### Login Sequence

```
1. Client visits http://172.20.10.5:8000/
   → Redirected to /login (not authenticated)

2. User enters credentials in form
   → POST /login { username, password }

3. Server validates credentials
   → Authenticates user
   → Creates session (ACTIVE_SESSIONS dict)
   → Sets HttpOnly cookie: session_id

4. Client redirected to /map
   → Cookie sent with every request

5. Server validates session from cookie
   → Serves map.html
```

### WebSocket Authentication

```
1. Browser connects to ws://172.20.10.5:8000/ws
   → Cookie automatically included in headers

2. Server extracts session_id from cookie
   → Validates session
   → If invalid: closes with code 1008

3. If valid:
   → Accepts WebSocket connection
   → Adds to broadcast list
   → Starts receiving telemetry updates

4. Server broadcasts telemetry to all connected clients
   → Every 0.5 seconds (demo data)
   → Automatic format: { lat, lon, alt, heading, speed, battery, ts }
```

### Logout

```
1. User clicks "Logout" button on map

2. Frontend: GET /logout?
   → Server destroys session
   → Deletes cookie
   → Redirects to /login
```

---

## 🔧 Backend API Endpoints

### Authentication Routes

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| `GET` | `/` | No | Root → redirect to /map or /login |
| `GET` | `/login` | No | Serve login page |
| `POST` | `/login` | No | Verify credentials, set cookie |
| `GET` | `/logout` | No | Destroy session, clear cookie |
| `GET` | `/map` | **Yes** | Serve map.html (protected) |

### Health & Info

| Method | Endpoint | Auth Required | Response |
|--------|----------|---------------|----------|
| `GET` | `/health` | No | `{"ok": true, "version": "0.2.0", "ws": "/ws", ...}` |

### WebSocket

| Endpoint | Auth Required | Format |
|----------|---------------|--------|
| `/ws` | **Yes** | `{lat, lon, alt, heading, speed, battery, ts}` |

---

## 🗺️ Frontend Features

### Login Page (`login.html`)
- Clean, modern UI
- Username + password form
- Error messages for invalid login
- Demo credentials displayed
- Responsive design (mobile-friendly)

### Map Page (`map.html`)
- **Leaflet map** (OpenStreetMap tiles)
- **Drone marker** with rotation based on heading
- **Flight path** (polyline, max 2000 points)
- **HUD** (top-left, terminal-style):
  - WebSocket status (Live/Disconnected)
  - Current position (lat, lon)
  - Altitude, heading, speed
  - Battery percentage
  - Follow button (ON/OFF)
  - Logout button

### Map Controller (`map.js`)
```javascript
// Auto-detect ws:// vs wss:// based on page protocol
const WS_PROTOCOL = location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${WS_PROTOCOL}//${location.host}/ws`;

// Features:
// ✓ Auto-reconnection every 1 second on disconnect
// ✓ HUD updates with telemetry data
// ✓ Drone marker rotation + map pan
// ✓ Follow mode (map centers on drone)
// ✓ Polyline max 2000 points
// ✓ Error handling (invalid messages silently ignored)
```

### Styling (`map.css`)
- **Terminal-style HUD** (green monospace text)
- **Responsive grid** (3 columns on desktop, 2 on tablet, 1 on mobile)
- **Status indicators**:
  - 🟢 Live (green, pulsing)
  - 🔴 Disconnected (red)
- **Leaflet customization** (zoom controls, attribution)

---

## 🔌 WebSocket Protocol

### Client Connection

```javascript
// Automatic protocol detection
const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${location.host}/ws`);

// Message received
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log({
        lat: data.lat,        // float, decimal degrees
        lon: data.lon,        // float, decimal degrees
        alt: data.alt,        // float, meters
        heading: data.heading, // float, 0-360 degrees
        speed: data.speed,    // float, m/s
        battery: data.battery, // float, 0-100 %
        ts: data.ts           // int, Unix timestamp
    });
};

// Auto-reconnection (every 1 second if disconnected)
ws.onclose = () => {
    setTimeout(() => {
        // Reconnect logic
    }, 1000);
};
```

### Server Broadcasting

```python
# backend/websocket.py
async def demo_telemetry_loop(manager):
    while True:
        # Generate demo data (Tunis area, circular flight)
        telemetry = {
            "lat": 36.8065,
            "lon": 10.1815,
            "alt": 15.3,
            "heading": 45.0,
            "speed": 2.5,
            "battery": 85.0,
            "ts": 1704067200
        }
        
        # Broadcast to all connected clients
        await manager.broadcast(telemetry)
        
        # Every 0.5 seconds
        await asyncio.sleep(0.5)
```

---

## 🐛 Troubleshooting

### Problem: "Connection Refused" to ws://...

**Solution:** 
1. Ensure server is running: `python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000`
2. Check firewall: `sudo ufw allow 8000/tcp`
3. Verify IP: `ip addr show` (look for 172.20.10.5 or equivalent)

### Problem: Login fails with "Invalid credentials"

**Solution:**
1. Check credentials: `admin` / `admin123`
2. Look for typos in username/password
3. Check browser console for errors: `F12 → Console tab`

### Problem: WebSocket disconnects immediately

**Solution:**
1. Ensure session cookie is valid
2. Check browser DevTools: `F12 → Application → Cookies`
3. Look for session_id cookie with domain matching your IP
4. Check backend logs for "❌ WebSocket: Invalid session" error

### Problem: Map doesn't show

**Solution:**
1. Check network tab: `F12 → Network`
2. Ensure `/map` returns 200 (not 302 redirect)
3. Verify Leaflet CDN is accessible
4. Check console for JavaScript errors

### Problem: Drone doesn't move

**Solution:**
1. Check WebSocket connection status (should show "Live")
2. Open browser console: `F12 → Console`
3. Check for messages like `WebSocket connected` or `Invalid telemetry data`
4. Verify backend is running and logs show `Broadcasting to 1 clients`

---

## 📊 Demo Data

The backend includes a **demo telemetry loop** that generates mock data:

- **Location:** Tunis, Tunisia (36.8065°N, 10.1815°E)
- **Flight pattern:** Circular orbit around starting point
- **Update frequency:** Every 0.5 seconds
- **Data varies:** Altitude, heading, speed, battery percentage

```python
# Simulated parameters:
- Altitude: 10-35 meters
- Speed: 2.5-3.5 m/s
- Heading: 0-360° (rotating)
- Battery: 85-80% (draining)
```

To use **real telemetry**, modify `backend/server.py` `demo_telemetry_loop()`:

```python
async def demo_telemetry_loop(manager):
    while True:
        # Replace with real drone telemetry
        real_data = await get_drone_telemetry()
        await manager.broadcast(real_data)
        await asyncio.sleep(0.5)
```

---

## 🔒 Security Considerations

### Current Implementation (Demo)
- ✅ Session-based authentication
- ✅ HttpOnly cookies (prevents XSS)
- ✅ SameSite protection (prevents CSRF)
- ⚠️ Plaintext passwords (DEMO ONLY)
- ⚠️ In-memory session storage (no persistence)
- ⚠️ No HTTPS (for local development)

### For Production, Add:
1. **Password hashing:** Use `bcrypt` or `argon2`
   ```bash
   pip install bcrypt
   ```

2. **Database:** Replace `ACTIVE_SESSIONS` dict with PostgreSQL/MongoDB

3. **HTTPS:** Use Let's Encrypt + Cloudflare Tunnel
   ```bash
   # Uncomment in auth.py:
   # secure=True,  # Cookies over HTTPS only
   ```

4. **Rate limiting:** Protect `/login` endpoint
   ```bash
   pip install slowapi
   ```

5. **2FA:** Add TOTP (Time-based One-Time Password)

6. **Secrets management:** Use environment variables
   ```python
   import os
   SECRET_KEY = os.getenv("SECRET_KEY")
   ```

---

## 📦 Requirements

```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
python-multipart==0.0.6
pydantic==2.5.0
```

Install with:
```bash
pip install -r requirements.txt
```

---

## 🌐 Accessing from Network

### From Raspberry Pi (local)
```
http://localhost:8000/login
ws://localhost:8000/ws
```

### From another computer on network
```
http://172.20.10.5:8000/login
ws://172.20.10.5:8000/ws
```

### From internet (via Cloudflare Tunnel)
```
https://drone.example.com/login
wss://drone.example.com/ws
```

---

## 📝 Development Notes

### Session Timeout
- **Default:** 24 hours (`SESSION_TIMEOUT = 86400` seconds)
- **Change in:** `backend/auth.py`

### Demo Telemetry Rate
- **Default:** 0.5 seconds
- **Change in:** `backend/server.py` line `await asyncio.sleep(0.5)`

### Demo Area
- **Location:** Tunis, Tunisia
- **Center:** 36.8065°N, 10.1815°E
- **Change in:** `backend/server.py` line `base_lat = 36.8065`

### Maximum Polyline Points
- **Default:** 2000 points
- **Change in:** `frontend/map.js` line `const MAX_POLYLINE_POINTS = 2000`

---

## 📚 Resources

- **FastAPI Docs:** https://fastapi.tiangolo.com/
- **Leaflet Docs:** https://leafletjs.com/
- **WebSocket API:** https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- **OpenStreetMap:** https://www.openstreetmap.org/

---

## 📄 License

This project is part of the RPi Drone Control System.

---

**Happy flying!** 🚁✈️

For issues or questions, check the logs:
```bash
# Terminal where server is running will show:
# ✓ Session created for admin
# ✓ WebSocket: User authenticated: admin
# Broadcasting telemetry to 1 client
```
