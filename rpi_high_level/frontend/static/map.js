// ============================================================================
// CONFIGURATION
// ============================================================================

console.log('map.js loaded');
const WS_RECONNECT_INTERVAL = 1000; // ms
const POLYLINE_MAX_POINTS = 2000;
const MAP_CENTER = [36.8065, 10.1815]; // Tunis
const WS_URL = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
const VIDEO_URL = "/video";

// ============================================================================
// STATE
// ============================================================================

let ws = null;
let map = null;
let droneMarker = null;
let polyline = null;
let followMode = false;
let lastUpdate = 0;
let videoOn = false;
let videoRefreshTimer = null;

// Waypoints state
let waypointsEnabled = false;
let waypoints = [];           // [{lat, lon, seq: 1,2,3...}]
let waypointMarkers = [];     // [L.marker objects]
let routeLine = null;         // L.polyline for route

// ============================================================================
// WEBSOCKET CONNECTION
// ============================================================================

function connectWebSocket() {
    console.log(`Connecting to WebSocket: ${WS_URL}`);


    try {
        ws = new WebSocket(WS_URL);
    } catch (err) {
        console.error('WebSocket construction error', err);
        setTimeout(connectWebSocket, WS_RECONNECT_INTERVAL);
        return;
    }

    ws.onopen = () => {
        console.log('WebSocket connected');
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
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting in ' + WS_RECONNECT_INTERVAL + 'ms');
        setTimeout(connectWebSocket, WS_RECONNECT_INTERVAL);
    };
}

// -------------------------------
// DEMO SIMULATION (no WebSocket)
// -------------------------------
let demoTimer = null;
let demoCounter = 0;
function startDemo() {
    // Create initial marker and polyline if not present
    if (!map) initMap();
    if (!polyline) polyline = L.polyline([], {color: '#ff9f1a', weight:4, opacity:0.9}).addTo(map);

    demoTimer = setInterval(() => {
        demoCounter += 1;
        const angle = (demoCounter * 10) % 360;
        const radius = 0.005; // roughly ~500m
        const lat = MAP_CENTER[0] + radius * Math.cos(angle * Math.PI/180);
        const lon = MAP_CENTER[1] + radius * Math.sin(angle * Math.PI/180);
        const alt = 10 + 5 * Math.sin(demoCounter/5);
        const speed = 2 + Math.abs(Math.sin(demoCounter/4))*3;
        const battery = Math.max(10, 95 - Math.floor(demoCounter/30));

        const telemetry = { lat, lon, alt, heading: angle, speed, battery, ts: Date.now() };
        updateTelemetry(telemetry);
    }, 500);
}

function stopDemo(){ if(demoTimer) { clearInterval(demoTimer); demoTimer = null; } }

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
        color: '#ff9f1a',
        weight: 4,
        opacity: 0.9,
        smoothFactor: 1
    }).addTo(map);
    
    // Initialize drone marker
    createDroneMarker();

    // Add map click listener for waypoints
    map.on('click', (e) => {
        if (waypointsEnabled) {
            addWaypoint(e.latlng.lat, e.latlng.lng);
        }
    });

    // Move Leaflet zoom control to bottom-right so HUD doesn't overlap it
    try{
        if (map && map.zoomControl) map.zoomControl.setPosition('bottomright');
    }catch(e){ console.warn('Could not reposition zoom control', e); }
}

function createDroneMarker(lat = MAP_CENTER[0], lon = MAP_CENTER[1], heading = 0) {
    // If exists, update position and heading smoothly
    if (droneMarker) {
        droneMarker.setLatLng([lat, lon]);
        // Ensure marker stays above the polyline
        try { droneMarker.setZIndexOffset(1000); droneMarker.bringToFront(); } catch(e){}

        // rotate only the inner SVG icon so Leaflet's positioning transform is preserved
        const el = droneMarker.getElement();
        if (el) {
            const inner = el.querySelector('.drone-icon');
            if (inner) {
                inner.style.transform = `rotate(${heading}deg)`;
            }
        }
        return;
    }

    // Use a small monochrome SVG as an L.icon (data URL) for consistent visibility
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='%23ff7a18' d='M2 21l21-9L2 3l3 7 12 2-12 2z'/></svg>`;
    const iconUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    const planeIcon = L.icon({
        iconUrl: iconUrl,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        className: 'drone-marker-img'
    });

    droneMarker = L.marker([lat, lon], {
        icon: planeIcon,
        zIndexOffset: 1000,
        interactive: false
    }).addTo(map);

    // Ensure visibility above polylines
    try { droneMarker.bringToFront(); droneMarker.setZIndexOffset(1000); } catch(e){}

    // Apply initial heading to the inserted <img>
    const el = droneMarker.getElement();
    if (el) {
        const img = el.querySelector('img');
        if (img) img.style.transform = `rotate(${heading}deg)`;
    }
}

// ============================================================================
// TELEMETRY UPDATE
// ============================================================================

function updateTelemetry(data) {
    const lat = Number(data.lat || data.latitude || 0);
    const lon = Number(data.lon || data.longitude || 0);
    const alt = Number(data.alt || 0);
    const heading = Number(data.heading || 0);
    const speed = Number(data.speed || 0);
    const battery = Number(data.battery || 0);
    const rssi = Number(data.rssi || 0);
    const arm = data.arm || data.armed || false;
    const mode = data.mode || '-';
    const ts = data.ts || data.timestamp || Date.now();

    if (!lat || !lon) return;

    // Telemetry DOM updates
    const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setText('val-lat', lat.toFixed(4));
    setText('val-lon', lon.toFixed(4));
    setText('val-alt', alt.toFixed(1));
    setText('val-heading', Math.round(heading));
    setText('val-speed', speed.toFixed(1));
    setText('val-time', formatTimestamp(ts));

    // Arm & mode
    const armEl = document.getElementById('arm-status');
    if (armEl) {
        armEl.textContent = arm ? 'ARMED' : 'DISARMED';
        armEl.style.background = arm ? 'linear-gradient(90deg,#ffb37a,#ff9f1a)' : 'rgba(255,255,255,0.02)';
        armEl.style.color = arm ? '#021' : '#9fbfb0';
    }
    const modeEl = document.getElementById('mode'); if (modeEl) modeEl.textContent = `MODE: ${mode}`;

    // Battery gauge
    const gauge = document.getElementById('battery-gauge');
    if (gauge) {
        const pct = Math.max(0, Math.min(100, Math.round(battery)));
        gauge.style.setProperty('--battery', pct + '%');
        const pctEl = document.getElementById('battery-percent'); if (pctEl) pctEl.textContent = pct + '%';
    }

    // RSSI
    const rssiFill = document.getElementById('rssi-fill'); if (rssiFill) { const r = Math.max(0, Math.min(100, rssi)); rssiFill.style.width = r + '%'; }
    const rssiVal = document.getElementById('rssi-value'); if (rssiVal) rssiVal.textContent = rssi;

    // Update compass widget
    if (typeof updateCompass === 'function') updateCompass(heading);

    // Update marker (position + heading) and path
    createDroneMarker(lat, lon, heading);
    const latlng = [lat, lon];
    polyline.addLatLng(latlng);

    // Smooth rotation fallback: directly update inner icon if marker exists
    if (droneMarker) {
        const el = droneMarker.getElement();
        if (el) {
            const inner = el.querySelector('.drone-icon');
            if (inner) inner.style.transform = `rotate(${heading}deg)`;
        }
    }
    // Trim polyline
    const pts = polyline.getLatLngs();
    if (pts.length > POLYLINE_MAX_POINTS) {
        polyline.setLatLngs(pts.slice(pts.length - POLYLINE_MAX_POINTS));
    }

    // Follow
    if (followMode) map.panTo(latlng);

    // Update control-bar HUD (demo overlay)
    updateControlBar(lat, lon, alt, speed, battery);
}

function formatTimestamp(ts){
    try{
        const d = new Date(ts * (ts<1e12?1000:1));
        return d.toLocaleTimeString();
    }catch(e){ return '-'; }
}

// ============================================================================
// WAYPOINTS & ROUTE FUNCTIONS
// ============================================================================

/** Calculate distance between two lat/lon points in meters (Haversine) */
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/** Calculate total route distance */
function calculateRouteTotalDistance() {
    if (waypoints.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
        const p1 = waypoints[i];
        const p2 = waypoints[i + 1];
        total += haversineDistanceMeters(p1.lat, p1.lon, p2.lat, p2.lon);
    }
    return total;
}

/** Update distance display in HUD badge */
function updateDistanceDisplay() {
    const distEl = document.getElementById('route-distance');
    if (!distEl) return;
    if (waypoints.length < 2) {
        distEl.style.display = 'none';
        return;
    }
    distEl.style.display = 'block';
    const distMeters = calculateRouteTotalDistance();
    const distKm = (distMeters / 1000).toFixed(2);
    distEl.innerHTML = `Route: <b>${distKm} km</b>`;
}

/** Update send/clear route controls (enabled state) */
function updateRouteControls() {
    if (sendRouteBtn) {
        sendRouteBtn.disabled = waypoints.length < 2;
    }
    if (clearRouteBtn) {
        clearRouteBtn.disabled = waypoints.length === 0;
    }
}

/** Add a waypoint at given lat/lon */
function addWaypoint(lat, lon) {
    if (!waypointsEnabled) return;
    
    // Round to 7 decimals
    lat = Math.round(lat * 1e7) / 1e7;
    lon = Math.round(lon * 1e7) / 1e7;
    
    const seq = waypoints.length + 1;
    waypoints.push({ lat, lon, seq });
    
    // Create numbered marker
    const popupText = `<div style="text-align:center;font-size:12px;color:#0ff;">Waypoint ${seq}<br/>${lat.toFixed(5)}<br/>${lon.toFixed(5)}</div>`;
    const marker = L.marker([lat, lon], {
        icon: L.divIcon({
            html: `<div class="waypoint-marker">${seq}</div>`,
            iconSize: [32, 32],
            className: 'waypoint-icon'
        }),
        draggable: true
    }).bindPopup(popupText).addTo(map);
    
    // Drag event: update waypoint and redraw route
    marker.on('dragend', function() {
        const newPos = marker.getLatLng();
        waypoints[seq - 1].lat = Math.round(newPos.lat * 1e7) / 1e7;
        waypoints[seq - 1].lon = Math.round(newPos.lng * 1e7) / 1e7;
        updateRouteLine();
        updateDistanceDisplay();
    });
    
    // Context menu (right-click) to delete
    marker.on('contextmenu', function(e) {
        deleteWaypoint(seq - 1, marker);
        L.DomEvent.stop(e);
    });
    
    waypointMarkers.push(marker);
    updateRouteLine();
    updateDistanceDisplay();
    updateRouteControls();
}

/** Remove waypoint at index */
function deleteWaypoint(index, marker) {
    if (index < 0 || index >= waypoints.length) return;
    
    waypoints.splice(index, 1);
    map.removeLayer(marker);
    waypointMarkers.splice(index, 1);
    
    // Re-sequence remaining waypoints
    waypoints.forEach((wp, i) => {
        wp.seq = i + 1;
        waypointMarkers[i].setIcon(L.divIcon({
            html: `<div class="waypoint-marker">${i + 1}</div>`,
            iconSize: [32, 32],
            className: 'waypoint-icon'
        }));
    });
    
    updateRouteLine();
    updateDistanceDisplay();
    updateRouteControls();
}

/** Redraw route polyline connecting waypoints */
function updateRouteLine() {
    if (!routeLine) {
        routeLine = L.polyline([], {
            color: '#ff9f1a',
            weight: 3,
            opacity: 0.8,
            dashArray: '5,5',
            smoothFactor: 1
        }).addTo(map);
    }
    
    if (waypoints.length < 2) {
        routeLine.setLatLngs([]);
        return;
    }
    
    const coords = waypoints.map(wp => [wp.lat, wp.lon]);
    routeLine.setLatLngs(coords);
}

/** Clear all waypoints */
function clearAllWaypoints() {
    waypoints = [];
    waypointMarkers.forEach(marker => map.removeLayer(marker));
    waypointMarkers = [];
    if (routeLine) routeLine.setLatLngs([]);
    updateDistanceDisplay();
    updateRouteControls();
}

/** Send route to backend */
async function sendRouteToBackend() {
    if (waypoints.length < 2) {
        showToast('Need at least 2 waypoints to send route', 'error');
        return;
    }
    
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const missionName = `mission_manual_${timestamp}`;
    
    const points = waypoints.map(wp => ({
        seq: wp.seq,
        lat: wp.lat,
        lon: wp.lon,
        alt: 20  // Default altitude
    }));
    
    const payload = {
        name: missionName,
        points: points
    };
    
    try {
        const response = await fetch('/api/missions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            const count = waypoints.length;
            showToast(`Route saved: ${missionName} (${count} pts)`, 'success');
        } else {
            const errText = await response.text();
            showToast(`Save failed: ${response.status} ${errText}`, 'error');
        }
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
        console.error('Route send error:', err);
    }
}

// ============================================================================
// TOAST / NOTIFICATIONS
// ============================================================================

function showToast(message, type='info', timeout=4000) {
    const container = document.getElementById('toast');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<div class="msg">${message}</div>`;
    container.appendChild(t);
    // small delay to allow CSS transition
    requestAnimationFrame(()=> t.classList.add('show'));
    const remove = () => {
        t.classList.remove('show');
        setTimeout(()=> { try { container.removeChild(t); } catch(e){} }, 240);
    };
    setTimeout(remove, timeout);
}

// ============================================================================
// UI UPDATES
// ============================================================================

function updateWSStatus(status, isLive) {
    console.log('WS', status);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

const followBtn = document.getElementById('follow-btn');
const followToggle = document.getElementById('follow-toggle');
// Support legacy/fallback ID followBtn (overlay)
const followBtnOverlay = document.getElementById('followBtn');
function setFollow(enabled){ followMode = !!enabled; if (followBtn) followBtn.textContent = `Follow: ${followMode ? 'ON':'OFF'}`; if (followToggle) followToggle.textContent = `Follow ${followMode? 'ON':'OFF'}`; }
if (followBtn) followBtn.addEventListener('click', () => setFollow(!followMode));
if (followToggle) followToggle.addEventListener('click', () => setFollow(!followMode));
if (followBtnOverlay) followBtnOverlay.addEventListener('click', () => setFollow(!followMode));

// Wire the control-bar buttons (demo HUD): IDs in map.html control bar
const cbFollow = document.getElementById('follow-toggle');
const cbCenter = document.getElementById('center-btn');
const cbClear = document.getElementById('clear-btn');
if (cbFollow) cbFollow.addEventListener('click', ()=> { setFollow(!followMode); cbFollow.classList.toggle('active', followMode); cbFollow.textContent = `Follow: ${followMode? 'ON':'OFF'}`; });
if (cbCenter) cbCenter.addEventListener('click', ()=> { if (droneMarker) { const p = droneMarker.getLatLng(); map.setView(p, map.getZoom()); } });
if (cbClear) cbClear.addEventListener('click', ()=> { if (polyline) polyline.setLatLngs([]); });

// WAYPOINTS UI LISTENERS
const waypointsToggleBtn = document.getElementById('waypoints-toggle');
const sendRouteBtn = document.getElementById('send-route-btn');
const clearRouteBtn = document.getElementById('clear-route-btn');

if (waypointsToggleBtn) {
    waypointsToggleBtn.addEventListener('click', () => {
        waypointsEnabled = !waypointsEnabled;
        waypointsToggleBtn.textContent = `Waypoints: ${waypointsEnabled ? 'ON' : 'OFF'}`;
        waypointsToggleBtn.classList.toggle('active', waypointsEnabled);
        
        // Show/hide route control buttons
        if (sendRouteBtn) sendRouteBtn.style.display = waypointsEnabled ? 'block' : 'none';
        if (clearRouteBtn) clearRouteBtn.style.display = waypointsEnabled ? 'block' : 'none';
        
        // Clear route when toggling off
        if (!waypointsEnabled) {
            clearAllWaypoints();
        }
    });
}

if (sendRouteBtn) {
    sendRouteBtn.addEventListener('click', () => {
        sendRouteToBackend();
    });
}

if (clearRouteBtn) {
    clearRouteBtn.addEventListener('click', () => {
        clearAllWaypoints();
    });
}

// Update small HUD values in control-bar
function updateControlBar(lat, lon, alt, speed, battery){
    const s = (v)=> (v===undefined?'-':(typeof v==='number'? (Math.round(v*100)/100):v));
    const el = id=>document.getElementById(id);
    if (el('cb-lat')) el('cb-lat').textContent = s(lat);
    if (el('cb-lon')) el('cb-lon').textContent = s(lon);
    if (el('cb-alt')) el('cb-alt').textContent = s(alt);
    if (el('cb-speed')) el('cb-speed').textContent = s(speed);
    if (el('cb-bat')) el('cb-bat').textContent = s(battery);
}

/* Realistic compass update: rotate needle and update numeric display */
function updateCompass(headingDeg) {
    if (headingDeg === null || headingDeg === undefined) return;
    const num = Number(headingDeg) || 0;
    const h = ((num % 360) + 360) % 360;
    const needle = document.getElementById("compass-needle");
    const deg = document.getElementById("compass-deg");
    if (needle) needle.style.transform = `translate(-50%, -50%) rotate(${h+180}deg)`;
    if (deg) deg.textContent = String(Math.round(h)).padStart(3, "0") + "°";
}

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) logoutBtn.addEventListener('click', () => { if (ws) ws.close(); window.location.href='/logout'; });

// Video toggle
const videoToggle = document.getElementById('video-toggle');
const videoImg = document.getElementById('video-stream');
const videoPlaceholder = document.getElementById('video-placeholder');
const videoStatus = document.getElementById('video-status');

function setVideo(on){
    videoOn = !!on;
    if (videoToggle) videoToggle.textContent = `Video: ${videoOn ? 'ON' : 'OFF'}`;
    if (videoStatus) videoStatus.className = `status-dot ${videoOn? 'on':'off'}`;
    if (videoOn) {
        if (videoPlaceholder) videoPlaceholder.style.display = 'none';
        if (videoImg) videoImg.src = VIDEO_URL + '?_=' + Date.now();
        // start refresh loop for non-MJPEG fallback
        if (!videoRefreshTimer) videoRefreshTimer = setInterval(()=>{ if(videoOn && videoImg) videoImg.src = VIDEO_URL + '?_=' + Date.now(); }, 1200);
    } else {
        if (videoPlaceholder) videoPlaceholder.style.display = 'flex';
        if (videoImg) videoImg.src = '';
        if (videoRefreshTimer) { clearInterval(videoRefreshTimer); videoRefreshTimer = null; }
    }
}

if (videoToggle) videoToggle.addEventListener('click', ()=> setVideo(!videoOn));

// Speed control: slider sends WS command {cmd:'set_speed', value: <number>} and updates UI
const speedControl = document.getElementById('speed-control');
const setSpeedValue = document.getElementById('set-speed-value');
if (speedControl) {
    speedControl.addEventListener('input', (ev)=>{
        const v = Number(ev.target.value);
        if (setSpeedValue) setSpeedValue.textContent = v.toFixed(1);
        if (ws && ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({cmd:'set_speed', value: v})); } catch(e) { console.warn('WS send failed', e); }
        }
    });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

window.addEventListener('load', () => {
    console.log('Initializing RPi Drone Control Map...');
    initMap();
    // In demo mode don't connect to WebSocket. Start simulated telemetry instead.
    //connectWebSocket();
    startDemo();
    setVideo(false);
    // Ensure route controls initial state
    updateRouteControls();
});

// Reconnect WebSocket on page visibility change
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (!ws || ws.readyState === WebSocket.CLOSED)) {
        console.log('Page became visible, reconnecting WebSocket');
        connectWebSocket();
    }
});
