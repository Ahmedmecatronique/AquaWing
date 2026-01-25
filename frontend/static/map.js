// ============================================================================
// CONFIGURATION
// ============================================================================

const WS_RECONNECT_INTERVAL = 1000; // ms
const POLYLINE_MAX_POINTS = 2000;
const MAP_CENTER = [36.8065, 10.1815]; // Tunis

// ============================================================================
// STATE
// ============================================================================

let ws = null;
let map = null;
let droneMarker = null;
let polyline = null;
let followMode = false;
let lastUpdate = 0;

// ============================================================================
// WEBSOCKET CONNECTION
// ============================================================================

function connectWebSocket() {
    // Auto-protocol detection: use wss:// for HTTPS, ws:// for HTTP
    const WS_PROTOCOL = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const WS_URL = `${WS_PROTOCOL}//${location.host}/ws`;
    
    console.log(`Connecting to WebSocket: ${WS_URL}`);
    
    ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        updateWSStatus('Live', true);
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            updateTelemetry(data);
        } catch (err) {
            console.error('Invalid telemetry data:', err);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateWSStatus('Error', false);
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting in ' + WS_RECONNECT_INTERVAL + 'ms');
        updateWSStatus('Disconnected', false);
        setTimeout(connectWebSocket, WS_RECONNECT_INTERVAL);
    };
}

// ============================================================================
// MAP INITIALIZATION
// ============================================================================

function initMap() {
    // Create map centered on Tunis
    map = L.map('map').setView(MAP_CENTER, 15);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
    
    // Initialize polyline (flight path)
    polyline = L.polyline([], {
        color: '#00ff00',
        weight: 2,
        opacity: 0.7,
        smoothFactor: 1
    }).addTo(map);
    
    // Initialize drone marker
    createDroneMarker();
}

function createDroneMarker(lat = MAP_CENTER[0], lon = MAP_CENTER[1], heading = 0) {
    if (droneMarker) {
        map.removeLayer(droneMarker);
    }
    
    const iconHtml = `
        <div style="
            transform: rotate(${heading}deg);
            font-size: 24px;
            filter: drop-shadow(0 0 2px rgba(0,255,0,0.8));
        ">
            🚁
        </div>
    `;
    
    droneMarker = L.marker([lat, lon], {
        icon: L.divIcon({
            html: iconHtml,
            iconSize: [30, 30],
            className: 'drone-marker'
        })
    }).addTo(map);
}

// ============================================================================
// TELEMETRY UPDATE
// ============================================================================

function updateTelemetry(data) {
    const {lat, lon, alt, heading, speed, battery, ts} = data;
    
    if (!lat || !lon) return;
    
    // Update HUD
    document.getElementById('hud-lat').textContent = lat.toFixed(4);
    document.getElementById('hud-lon').textContent = lon.toFixed(4);
    document.getElementById('hud-alt').textContent = alt.toFixed(1);
    document.getElementById('hud-heading').textContent = heading.toFixed(0);
    document.getElementById('hud-speed').textContent = speed.toFixed(1);
    document.getElementById('hud-battery').textContent = Math.round(battery);
    
    // Update marker position and rotation
    createDroneMarker(lat, lon, heading);
    
    // Add to polyline (flight path)
    const latlng = [lat, lon];
    polyline.addLatLng(latlng);
    
    // Limit polyline points to prevent memory issues
    if (polyline.getLatLngs().length > POLYLINE_MAX_POINTS) {
        const allPoints = polyline.getLatLngs();
        polyline.setLatLngs(allPoints.slice(1));
    }
    
    // Follow mode: center map on drone
    if (followMode) {
        map.panTo(latlng);
    }
}

// ============================================================================
// UI UPDATES
// ============================================================================

function updateWSStatus(status, isLive) {
    const wsStatus = document.getElementById('ws-status');
    wsStatus.textContent = `● ${status}`;
    wsStatus.className = `status-indicator ${isLive ? 'live' : 'dead'}`;
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

document.getElementById('follow-btn').addEventListener('click', () => {
    followMode = !followMode;
    const btn = document.getElementById('follow-btn');
    btn.textContent = `Follow: ${followMode ? 'ON' : 'OFF'}`;
    btn.classList.toggle('active', followMode);
});

document.getElementById('logout-btn').addEventListener('click', () => {
    if (ws) {
        ws.close();
    }
    window.location.href = '/logout';
});

// ============================================================================
// INITIALIZATION
// ============================================================================

window.addEventListener('load', () => {
    console.log('Initializing RPi Drone Control Map...');
    initMap();
    connectWebSocket();
});

// Reconnect WebSocket on page visibility change
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (!ws || ws.readyState === WebSocket.CLOSED)) {
        console.log('Page became visible, reconnecting WebSocket');
        connectWebSocket();
    }
});
