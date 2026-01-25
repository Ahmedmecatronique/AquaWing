/**
 * Drone Tracking Map - Leaflet Map Controller
 * 
 * Features:
 * - Real-time drone position tracking via WebSocket
 * - Automatic camera follow (optional)
 * - HUD with telemetry display
 * - Local/HTTPS compatible WebSocket URL
 * - Auto-reconnection on disconnect
 */

// ============================================================================
// Configuration
// ============================================================================

// Automatically choose ws:// or wss:// based on current protocol
const WS_PROTOCOL = location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${WS_PROTOCOL}//${location.host}/ws`;

// Max polyline points to keep in memory
const MAX_POLYLINE_POINTS = 2000;

// WebSocket reconnection interval (ms)
const WS_RECONNECT_INTERVAL = 1000;

// ============================================================================
// Global State
// ============================================================================

let map = null;
let droneMarker = null;
let polyline = null;
let droneHeading = 0;
let followMode = false;
let ws = null;
let wsConnected = false;
let lastUpdateTime = null;

let telemetry = {
    lat: 0,
    lon: 0,
    alt: 0,
    heading: 0,
    speed: 0,
    battery: 0,
    ts: 0
};

let polylineCoordinates = [];

// ============================================================================
// Map Initialization
// ============================================================================

function initMap() {
    // Default center: Tunis
    const defaultCenter = [36.8065, 10.1815];
    
    // Create map
    map = L.map('map', {
        center: defaultCenter,
        zoom: 15,
        layers: [
            // OpenStreetMap layer
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap contributors'
            })
        ]
    });

    // Create drone marker with rotation
    const droneIcon = L.divIcon({
        html: `<div style="transform: rotate(${droneHeading}deg); font-size: 30px;">🚁</div>`,
        iconSize: [30, 30],
        className: 'drone-marker'
    });

    droneMarker = L.marker(defaultCenter, { icon: droneIcon })
        .bindPopup('Drone Position')
        .addTo(map);

    // Create polyline for flight path
    polyline = L.polyline([], {
        color: 'blue',
        weight: 2,
        opacity: 0.7,
        dashArray: '5, 5'
    }).addTo(map);

    console.log('Map initialized at', defaultCenter);
}

// ============================================================================
// HUD Updates
// ============================================================================

function updateHUD(data) {
    // Update HUD display
    document.getElementById('hudLat').textContent = data.lat.toFixed(5);
    document.getElementById('hudLon').textContent = data.lon.toFixed(5);
    document.getElementById('hudAlt').textContent = data.alt.toFixed(1) + ' m';
    document.getElementById('hudHeading').textContent = data.heading.toFixed(0) + ' °';
    document.getElementById('hudSpeed').textContent = (data.speed || 0).toFixed(2) + ' m/s';
    document.getElementById('hudBattery').textContent = (data.battery || 0).toFixed(0) + ' %';

    lastUpdateTime = new Date().toLocaleTimeString();
}

function updateWSStatus(connected) {
    wsConnected = connected;
    const statusEl = document.getElementById('wsStatus');
    
    if (connected) {
        statusEl.textContent = 'Live';
        statusEl.className = 'hud-value status-live';
    } else {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'hud-value status-disconnected';
    }
}

// ============================================================================
// Map Updates
// ============================================================================

function updateDronePosition(lat, lon, heading) {
    droneHeading = heading;

    // Update marker position and rotation
    if (droneMarker) {
        droneMarker.setLatLng([lat, lon]);
        
        const droneIcon = L.divIcon({
            html: `<div style="transform: rotate(${heading}deg); font-size: 30px; filter: drop-shadow(0 0 2px rgba(0,0,0,0.5));">🚁</div>`,
            iconSize: [30, 30],
            className: 'drone-marker'
        });
        droneMarker.setIcon(droneIcon);
    }

    // Add point to polyline
    polylineCoordinates.push([lat, lon]);
    
    // Keep only last MAX_POLYLINE_POINTS
    if (polylineCoordinates.length > MAX_POLYLINE_POINTS) {
        polylineCoordinates.shift();
    }
    
    if (polyline) {
        polyline.setLatLngs(polylineCoordinates);
    }

    // Follow mode: center map on drone if enabled
    if (followMode && map) {
        map.panTo([lat, lon], { animate: false });
    }
}

// ============================================================================
// WebSocket Management
// ============================================================================

function connectWebSocket() {
    console.log('Connecting to WebSocket:', WS_URL);
    
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        console.log('WebSocket connected');
        updateWSStatus(true);
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            // Validate data
            if (!data.lat || !data.lon || data.heading === undefined) {
                console.warn('Invalid telemetry data:', data);
                return;
            }

            // Update telemetry
            telemetry = {
                lat: data.lat,
                lon: data.lon,
                alt: data.alt || 0,
                heading: data.heading,
                speed: data.speed || 0,
                battery: data.battery || 0,
                ts: data.ts || Date.now()
            };

            // Update HUD
            updateHUD(telemetry);

            // Update map
            updateDronePosition(data.lat, data.lon, data.heading);

        } catch (error) {
            console.error('Error processing telemetry:', error);
            // Don't crash on invalid data
        }
    };

    ws.onerror = (event) => {
        console.error('WebSocket error:', event);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        updateWSStatus(false);
        
        // Attempt reconnection
        console.log(`Reconnecting in ${WS_RECONNECT_INTERVAL}ms...`);
        setTimeout(connectWebSocket, WS_RECONNECT_INTERVAL);
    };
}

// ============================================================================
// UI Controls
// ============================================================================

function setupControls() {
    // Follow button
    const followBtn = document.getElementById('followBtn');
    if (followBtn) {
        followBtn.addEventListener('click', () => {
            followMode = !followMode;
            followBtn.textContent = followMode ? 'Follow: ON' : 'Follow: OFF';
            followBtn.classList.toggle('active', followMode);
            console.log('Follow mode:', followMode);
        });
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                const response = await fetch('/logout', {
                    method: 'GET',
                    credentials: 'include'
                });
                
                if (response.ok) {
                    window.location.href = '/login';
                }
            } catch (error) {
                console.error('Logout error:', error);
                window.location.href = '/login';
            }
        });
    }
}

// ============================================================================
// Page Load & Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing drone map...');
    
    // Initialize map
    initMap();
    
    // Setup controls
    setupControls();
    
    // Connect to WebSocket
    connectWebSocket();
});

// ============================================================================
// Page Cleanup
// ============================================================================

window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close();
    }
});