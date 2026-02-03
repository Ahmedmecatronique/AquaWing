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
let rgbTimer = null;
let thermalTimer = null;
let rgbSamples = [];
let thermalSamples = [];
let lastRGBObjectURL = null;
let lastThermalObjectURL = null;
const RGB_INTERVAL = 900; // ms
const THERMAL_INTERVAL = 1200; // ms
const SAMPLE_WINDOW_MS = 5000; // sliding window for averages (ms)

// Lightweight Toggle helper (integrated into existing files, no external JS)
(function(){ if (window.Toggles) return; const Toggles = {};
  function isBtn(el){ return el && el.tagName === 'BUTTON' && el.classList && el.classList.contains('toggle-switch'); }
  function isWrap(el){ return el && el.classList && el.classList.contains('ts-wrapper'); }
  Toggles.init = function(el){ if(!el) return; if (isBtn(el)){
      el.setAttribute('aria-pressed', String(el.classList.contains('on')));
      if(!el.querySelector('.ts-control')){ const lbl=document.createElement('span'); lbl.className='ts-label'; lbl.textContent = el.dataset.label || el.getAttribute('data-label') || (el.textContent||'').split(':')[0] || ''; const ctrl=document.createElement('span'); ctrl.className='ts-control'; const knob=document.createElement('span'); knob.className='ts-knob'; ctrl.appendChild(knob); el.innerHTML=''; el.appendChild(lbl); el.appendChild(ctrl); }
      el.addEventListener('click', ()=>{ const newState = !Toggles.getState(el); Toggles.setState(el,newState); el.dispatchEvent(new CustomEvent('togglechange',{detail:{on:newState}})); });
    } else if (isWrap(el)){
      const input = el.querySelector('input[type="checkbox"]'); if(!input) return; if(!el.querySelector('.ts-control')){ const ctrl=document.createElement('span'); ctrl.className='ts-control'; const knob=document.createElement('span'); knob.className='ts-knob'; ctrl.appendChild(knob); el.insertBefore(ctrl, input.nextSibling); }
      el.addEventListener('click', (ev)=>{ if(ev.target && ev.target.tagName==='INPUT') return; input.checked = !input.checked; Toggles.setState(el, input.checked); input.dispatchEvent(new Event('change',{bubbles:true})); }); input.addEventListener('change', ()=> Toggles.setState(el, input.checked)); Toggles.setState(el, !!input.checked);
    } };
  Toggles.setState = function(el,on){ const truth=!!on; if (isBtn(el)){ el.classList.toggle('on',truth); el.classList.toggle('active',truth); el.dataset.state = truth? 'on':'off'; el.setAttribute('aria-pressed', String(truth)); } else if (isWrap(el)){ const input = el.querySelector('input[type="checkbox"]'); if(input) input.checked = truth; el.classList.toggle('on',truth); el.classList.toggle('active',truth); el.dataset.state = truth? 'on':'off'; } else if(el && el.tagName === 'INPUT' && el.type === 'checkbox'){ el.checked = truth; const wrap = el.closest('.ts-wrapper'); if(wrap) wrap.classList.toggle('on',truth); } };
  Toggles.getState = function(el){ if(isBtn(el)) return el.classList.contains('on') || el.dataset.state === 'on'; if(isWrap(el)) return el.classList.contains('on') || el.dataset.state === 'on' || !!(el.querySelector && el.querySelector('input[type="checkbox"]') && el.querySelector('input[type="checkbox"]').checked); if(el && el.tagName === 'INPUT' && el.type === 'checkbox') return !!el.checked; return false; };
  Toggles.initAll = function(){ document.querySelectorAll('button.toggle-switch').forEach(Toggles.init); document.querySelectorAll('.ts-wrapper').forEach(Toggles.init); };
  window.Toggles = Toggles; if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Toggles.initAll); else Toggles.initAll(); })();

// Waypoints state
let waypointsEnabled = false;
let waypoints = [];           // [{lat, lon, seq: 1,2,3...}]
let waypointMarkers = [];     // [L.marker objects]
let routeLine = null;         // L.polyline for route

// Flight UI state (UI-only, simulated)
let flightStarted = false;    // user clicked START FLIGHT
let missionLocked = false;    // WAIT / MISSION END clicked
let startFlightBtn = null;
let waitBtn = null;
let flightStatusEl = null;

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

    // Update attitude (Artificial Horizon) if IMU data present, fallback to heading display
    try{
        if (typeof updateAttitude === 'function') updateAttitude(data);
        else if (typeof updateCompass === 'function') updateCompass(heading);
    }catch(e){}

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
    // keep flight UI in sync
    updateFlightControls && updateFlightControls();
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
            // Enable START FLIGHT (UI-only) when route saved successfully
            if (startFlightBtn) { startFlightBtn.disabled = false; startFlightBtn.setAttribute('aria-disabled', 'false'); }
            updateFlightControls();
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
function setFollow(enabled){ followMode = !!enabled; if (followBtn && window.Toggles) window.Toggles.setState(followBtn, followMode); if (followToggle && window.Toggles) window.Toggles.setState(followToggle, followMode); }
if (followBtn) followBtn.addEventListener('click', () => setFollow(!followMode));
if (followToggle) followToggle.addEventListener('click', () => setFollow(!followMode));
if (followBtnOverlay) followBtnOverlay.addEventListener('click', () => setFollow(!followMode));

// Wire the control-bar buttons (demo HUD): IDs in map.html control bar
const cbFollow = document.getElementById('follow-toggle');
const cbCenter = document.getElementById('center-btn');
const cbClear = document.getElementById('clear-btn');
if (cbFollow) cbFollow.addEventListener('click', ()=> { setFollow(!followMode); /* visuals handled by Toggles */ });
if (cbCenter) cbCenter.addEventListener('click', ()=> { if (droneMarker) { const p = droneMarker.getLatLng(); map.setView(p, map.getZoom()); } });
if (cbClear) cbClear.addEventListener('click', ()=> { if (polyline) polyline.setLatLngs([]); });

// WAYPOINTS UI LISTENERS
const waypointsToggleBtn = document.getElementById('waypoints-toggle');
const sendRouteBtn = document.getElementById('send-route-btn');
const clearRouteBtn = document.getElementById('clear-route-btn');

if (waypointsToggleBtn) {
    waypointsToggleBtn.addEventListener('click', () => {
        waypointsEnabled = !waypointsEnabled;
        if (window.Toggles) window.Toggles.setState(waypointsToggleBtn, waypointsEnabled);
        
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

// ============================================================================
// FLIGHT CONTROL (UI-only, simulated)
// ============================================================================

startFlightBtn = document.getElementById('start-flight-btn');
waitBtn = document.getElementById('wait-btn');
flightStatusEl = document.getElementById('flight-status');

function updateFlightControls() {
    if (missionLocked) {
        if (startFlightBtn) { startFlightBtn.disabled = true; startFlightBtn.setAttribute('aria-disabled','true'); startFlightBtn.classList.add('locked'); }
        if (waitBtn) { waitBtn.disabled = true; waitBtn.setAttribute('aria-disabled','true'); waitBtn.classList.add('locked'); }
    } else {
        if (startFlightBtn) {
            startFlightBtn.disabled = !!flightStarted;
            startFlightBtn.setAttribute('aria-disabled', String(!!flightStarted));
            startFlightBtn.classList.remove('locked');
        }
        if (waitBtn) {
            waitBtn.disabled = !flightStarted;
            waitBtn.setAttribute('aria-disabled', String(!flightStarted));
            waitBtn.classList.remove('locked');
        }
    }

    // update status badge
    if (flightStatusEl) {
        flightStatusEl.classList.remove('started','waiting','locked');
        if (missionLocked) {
            flightStatusEl.textContent = 'Mission completed – waiting';
            flightStatusEl.classList.add('locked');
        } else if (flightStarted) {
            flightStatusEl.textContent = 'Mission in progress';
            flightStatusEl.classList.add('started');
        } else {
            flightStatusEl.textContent = 'Idle';
        }
    }
}

// START FLIGHT - UI only
if (startFlightBtn) {
    startFlightBtn.addEventListener('click', () => {
        if (startFlightBtn.disabled) return;
        flightStarted = true;
        updateFlightControls();
        showToast('Mission in progress (simulated)', 'success');
    });
}

// WAIT / MISSION END - UI only
if (waitBtn) {
    waitBtn.addEventListener('click', () => {
        if (waitBtn.disabled) return;
        missionLocked = true;
        // VISUAL ONLY: mark mission area locked and disable mission-related controls
        const telemetryPanel = document.querySelector('.telemetry-panel');
        if (telemetryPanel) telemetryPanel.classList.add('mission-locked');
        if (waypointsToggleBtn) { waypointsToggleBtn.disabled = true; waypointsToggleBtn.classList.add('locked-ctrl'); }
        if (sendRouteBtn) { sendRouteBtn.disabled = true; sendRouteBtn.classList.add('locked-ctrl'); }
        if (clearRouteBtn) { clearRouteBtn.disabled = true; clearRouteBtn.classList.add('locked-ctrl'); }

        // disable both action buttons
        if (startFlightBtn) { startFlightBtn.disabled = true; startFlightBtn.setAttribute('aria-disabled','true'); }
        if (waitBtn) { waitBtn.disabled = true; waitBtn.setAttribute('aria-disabled','true'); }

        updateFlightControls();
        showToast('Mission completed — mission UI locked', 'success');
    });
}

// initial sync
updateFlightControls();

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

/* Artificial Horizon update: use IMU pitch & roll to move horizon */
function updateAttitude(data){
    // data may contain pitch, roll, yaw / heading
    const pitchRaw = ('pitch' in data) ? Number(data.pitch) : (data.att_pitch? Number(data.att_pitch) : null);
    const rollRaw = ('roll' in data) ? Number(data.roll) : (data.att_roll? Number(data.att_roll) : null);
    const pitch = (pitchRaw===null || isNaN(pitchRaw))? 0 : pitchRaw;
    const roll = (rollRaw===null || isNaN(rollRaw))? 0 : rollRaw;

    // DOM elements
    const horizon = document.getElementById('att-horizon');
    const pitchEl = document.getElementById('att-pitch');
    const rollEl = document.getElementById('att-roll');

    if (pitchEl) pitchEl.textContent = `${Math.round(pitch)}°`;
    if (rollEl) rollEl.textContent = `${Math.round(roll)}°`;

    if (!horizon) return; // guard

    // Clamp pitch to reasonable range and map to vertical translation
    const maxPitch = 45; // degrees mapped to reasonable translation
    const clampedPitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));

    // Pixel translate: use container size
    const container = horizon.parentElement; // .attitude element
    let px = 0;
    try{
        const h = container ? container.offsetHeight : 100;
        // Scale factor so maxPitch moves horizon by ~h/4
        px = (clampedPitch / maxPitch) * (h / 4);
    }catch(e){ px = (clampedPitch/ maxPitch)*15; }

    // Apply transform: translateY for pitch, rotate for roll
    horizon.style.transform = `translate(-50%,-50%) translateY(${px}px) rotate(${roll}deg)`;
}

// Backwards-compatible: expose updateAttitude and call from telemetry
if (typeof window.updateAttitude === 'undefined') window.updateAttitude = updateAttitude;

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) logoutBtn.addEventListener('click', () => { if (ws) ws.close(); window.location.href='/logout'; });

// Video / Camera controls
const videoToggle = document.getElementById('video-toggle');
const videoImg = document.getElementById('video-stream');
const videoPlaceholder = document.getElementById('video-placeholder');
const videoStatus = document.getElementById('video-status');
const rgbResolutionSelect = document.getElementById('rgb-resolution');
if (rgbResolutionSelect) {
    rgbResolutionSelect.addEventListener('change', (ev)=>{
        const res = ev.target.value;
        // if streaming is active, restart loop with new resolution
        if (videoOn) startRGBLoop(res);
        else {
            const elR = document.getElementById('rgb-res'); if (elR) elR.textContent = res;
        }
    });
}

async function fetchBlob(url){
    try {
        const r = await fetch(url, {cache:'no-store'});
        if (!r.ok) return null;
        const b = await r.blob();
        return b;
    } catch(e){
        return null;
    }
}

function updateSamples(samples, size){
    const now = Date.now();
    samples.push({ts: now, size});
    const cutoff = now - SAMPLE_WINDOW_MS;
    while(samples.length && samples[0].ts < cutoff) samples.shift();
    const total = samples.reduce((s,x)=>s+x.size, 0);
    const windowSec = Math.max(0.001, (now - (samples.length? samples[0].ts : now))/1000);
    return total / windowSec; // bytes/sec
}

async function fetchAndDisplayRGB(res){
    if (!videoImg) return;
    const url = VIDEO_URL + '?res=' + encodeURIComponent(res) + '&_=' + Date.now();
    const blob = await fetchBlob(url);
    if (!blob) {
        if (videoStatus) videoStatus.className = 'status-dot off';
        return;
    }
    // set image
    try { if (lastRGBObjectURL) URL.revokeObjectURL(lastRGBObjectURL); } catch(e){}
    const obj = URL.createObjectURL(blob); lastRGBObjectURL = obj; videoImg.src = obj;

    // update stats
    const bps = updateSamples(rgbSamples, blob.size);
    const kb = (bps/1024).toFixed(1);
    const elB = document.getElementById('rgb-bitrate'); if (elB) elB.textContent = `${kb} kb/s`;
    const elR = document.getElementById('rgb-res'); if (elR) elR.textContent = res;
    if (videoStatus) videoStatus.className = 'status-dot on';
}

function startRGBLoop(res){
    stopRGBLoop();
    // initial fetch immediately
    fetchAndDisplayRGB(res);
    rgbTimer = setInterval(()=> fetchAndDisplayRGB(res), RGB_INTERVAL);
}
function stopRGBLoop(){ if (rgbTimer) { clearInterval(rgbTimer); rgbTimer = null; } try{ if (lastRGBObjectURL) { URL.revokeObjectURL(lastRGBObjectURL); lastRGBObjectURL = null; } }catch(e){} if (videoImg) videoImg.src = ''; const elB = document.getElementById('rgb-bitrate'); if (elB) elB.textContent = '0 kb/s'; const elR = document.getElementById('rgb-res'); if (elR) elR.textContent = '--'; if (videoStatus) videoStatus.className = 'status-dot off'; }

// Thermal fetch (if backend exists)
const thermalImg = document.getElementById('thermal-stream');
const thermalPlaceholder = document.getElementById('thermal-placeholder');
const thermalStatus = document.getElementById('thermal-status');

async function fetchAndDisplayThermal(){
    const panel = document.querySelector('.camera-panel.thermal');
    const base = panel && panel.dataset && panel.dataset.url ? panel.dataset.url : '/thermal';
    const url = base + '?_=' + Date.now();
    const blob = await fetchBlob(url);
    if (!blob) { if (thermalStatus) thermalStatus.className = 'status-dot off'; return; }
    try { if (lastThermalObjectURL) URL.revokeObjectURL(lastThermalObjectURL); } catch(e){}
    const obj = URL.createObjectURL(blob); lastThermalObjectURL = obj; if (thermalImg) thermalImg.src = obj;

    // stats
    const now = Date.now(); thermalSamples.push({ts:now});
    const cutoff = now - SAMPLE_WINDOW_MS; while(thermalSamples.length && thermalSamples[0].ts < cutoff) thermalSamples.shift();
    const windowSec = Math.max(0.001, (now - (thermalSamples.length? thermalSamples[0].ts : now))/1000);
    const fps = (thermalSamples.length / windowSec).toFixed(1);
    const elF = document.getElementById('thermal-fps'); if (elF) elF.textContent = `${fps} fps`;
    const elR = document.getElementById('thermal-res'); if (elR && blob) elR.textContent = `${blob.size} bytes`;
    if (thermalStatus) thermalStatus.className = 'status-dot on';
}

function startThermalLoop(){ stopThermalLoop(); fetchAndDisplayThermal(); thermalTimer = setInterval(()=> fetchAndDisplayThermal(), THERMAL_INTERVAL); }
function stopThermalLoop(){ if (thermalTimer) { clearInterval(thermalTimer); thermalTimer = null; } try{ if (lastThermalObjectURL) { URL.revokeObjectURL(lastThermalObjectURL); lastThermalObjectURL = null; } }catch(e){} if (thermalImg) thermalImg.src = ''; const elF = document.getElementById('thermal-fps'); if (elF) elF.textContent = '0 fps'; const elR = document.getElementById('thermal-res'); if (elR) elR.textContent = '--'; if (thermalStatus) thermalStatus.className = 'status-dot off'; }

// cleanup on unload
window.addEventListener('beforeunload', ()=>{
    stopRGBLoop(); stopThermalLoop(); if (rgbTimer) clearInterval(rgbTimer); if (thermalTimer) clearInterval(thermalTimer);
});

function setVideo(on){
    videoOn = !!on;
    if (videoToggle && window.Toggles) window.Toggles.setState(videoToggle, videoOn);
    if (videoStatus) videoStatus.className = `status-dot ${videoOn? 'on':'off'}`;
    if (videoOn) {
        if (videoPlaceholder) videoPlaceholder.style.display = 'none';
        const res = (rgbResolutionSelect && rgbResolutionSelect.value) ? rgbResolutionSelect.value : '1280x720';
        startRGBLoop(res);
    } else {
        if (videoPlaceholder) videoPlaceholder.style.display = 'flex';
        stopRGBLoop();
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
    // Start thermal monitoring (graceful if backend not available)
    try{ startThermalLoop(); }catch(e){}
    // Ensure route controls initial state
    updateRouteControls();

    // ensure leaflet map is correctly sized after layout changes
    setTimeout(()=>{ try { if (map && typeof map.invalidateSize === 'function') map.invalidateSize(); } catch(e){} }, 250);
});

// keep map layout consistent on window resize
window.addEventListener('resize', ()=>{ try { if (map && typeof map.invalidateSize === 'function') map.invalidateSize(); } catch(e){} });


// ============================================================================
// Power & Motors Panel: Tabs, visibility and simulated data (UI-only)
// ============================================================================

const tabTelemetry = document.getElementById('tab-telemetry');
const tabPower = document.getElementById('tab-power');
const powerPanel = document.querySelector('.power-panel');

function showTelemetryPanel() {
    const telemetry = document.querySelector('.telemetry-panel');
    if (telemetry) telemetry.style.display = 'flex';
    if (powerPanel) powerPanel.style.display = 'none';
    if (tabTelemetry) { tabTelemetry.classList.add('active'); tabTelemetry.setAttribute('aria-selected','true'); }
    if (tabPower) { tabPower.classList.remove('active'); tabPower.setAttribute('aria-selected','false'); }
}

function showPowerPanel() {
    const telemetry = document.querySelector('.telemetry-panel');
    if (telemetry) telemetry.style.display = 'none';
    if (powerPanel) powerPanel.style.display = 'flex';
    if (tabTelemetry) { tabTelemetry.classList.remove('active'); tabTelemetry.setAttribute('aria-selected','false'); }
    if (tabPower) { tabPower.classList.add('active'); tabPower.setAttribute('aria-selected','true'); }
}

if (tabTelemetry) tabTelemetry.addEventListener('click', showTelemetryPanel);
if (tabPower) tabPower.addEventListener('click', showPowerPanel);

// Simulation state with smoothing helper
const simState = {
    motorSpeed: [20,20,20],
    motorRPS: [5,5,5],
    motorCurrent: [1.2,1.2,1.2],
    motorVoltage: [12.6,12.6,12.6],
    motorTemp: [30,30,30],
    servoPos: [10,10,10,10,10,10],
    battVolt: 12.6,
    battCurrent: 0.8,
    battTemp: 30.0,
    busVolt: 12.6,
    powerCons: 10,
    imuOK: true,
    gpsFix: true,
    baro: 1013,
    airTemp: 22,
    humidity: 45,
    compassOK: true
};

function smooth(val, target, alpha=0.15){ return val + (target - val) * alpha; }

function randomDrift(v, range){ return v + (Math.random()*2-1) * range; }

function updatePowerSim() {
    // Random targets and smooth towards them
    for (let i=0;i<3;i++){
        const tSpeed = Math.max(0, Math.min(100, simState.motorSpeed[i] + (Math.random()*10-5)));
        simState.motorSpeed[i] = smooth(simState.motorSpeed[i], tSpeed, 0.2);
        const tCur = Math.max(0, simState.motorCurrent[i] + (Math.random()*0.4-0.2));
        simState.motorCurrent[i] = smooth(simState.motorCurrent[i]||1,tCur,0.15);
        const tTemp = Math.max(20, simState.motorTemp[i] + (Math.random()*4-2));
        simState.motorTemp[i] = smooth(simState.motorTemp[i], tTemp, 0.12);
    }
    for (let i=0;i<6;i++){ const t = Math.max(0, Math.min(180, simState.servoPos[i] + (Math.random()*8-4))); simState.servoPos[i] = smooth(simState.servoPos[i], t, 0.18); }
    simState.battVolt = smooth(simState.battVolt, Math.max(10.5, 12.6 + (Math.random()*0.2-0.1)), 0.06);
    simState.battCurrent = smooth(simState.battCurrent, Math.max(0, simState.battCurrent + (Math.random()*0.6-0.3)), 0.08);
    // battery temperature increases slightly with current draw and ambient temp
    const targetBattTemp = Math.max(15, (simState.airTemp || 20) + simState.battCurrent * 6 + (Math.random()*2-1));
    simState.battTemp = smooth(simState.battTemp, targetBattTemp, 0.06);

    simState.powerCons = Math.max(0, simState.battVolt * simState.battCurrent);
    simState.busVolt = smooth(simState.busVolt, simState.battVolt + (Math.random()*0.05-0.02), 0.08);
    simState.baro = smooth(simState.baro, 1010 + Math.random()*6, 0.04);
    simState.airTemp = smooth(simState.airTemp, 18 + Math.random()*12, 0.03);
    simState.humidity = smooth(simState.humidity, 30 + Math.random()*50, 0.04);

    // Status toggles occasionally
    simState.imuOK = Math.random() > 0.02; simState.gpsFix = Math.random() > 0.05; simState.compassOK = Math.random() > 0.03;
}

function renderPowerPanel() {
    // Motors: update slider, rps, current, voltage, temp
    for (let i=0;i<3;i++){
        const pct = Math.round(simState.motorSpeed[i]);
        const slider = document.getElementById('motor'+(i+1)+'-power'); if (slider) { slider.value = pct; slider.style.background = `linear-gradient(90deg, var(--accent) ${pct}%, rgba(255,255,255,0.03) ${pct}%)`; }
        const pval = document.getElementById('motor'+(i+1)+'-power-val'); if (pval) pval.textContent = pct + '%';

        const rps = (simState.motorRPS[i]||0);
        const rpsEl = document.getElementById('motor'+(i+1)+'-rps'); if (rpsEl) rpsEl.textContent = rps.toFixed(1) + ' tr/s';

        const cur = document.getElementById('motor'+(i+1)+'-current'); if (cur) cur.textContent = simState.motorCurrent[i].toFixed(2) + ' A';
        const volt = document.getElementById('motor'+(i+1)+'-voltage'); if (volt) volt.textContent = simState.motorVoltage[i].toFixed(2) + ' V';
        const tmp = document.getElementById('motor'+(i+1)+'-temp'); if (tmp) tmp.textContent = Math.round(simState.motorTemp[i]) + '°C';

        // color coding
        const tmpVal = simState.motorTemp[i];
        const curVal = simState.motorCurrent[i];
        const tmpClassTarget = (tmpVal > 85) ? 'status-critical' : (tmpVal > 70) ? 'status-warn' : 'status-normal';
        const curClassTarget = (curVal > 8) ? 'status-critical' : (curVal > 5) ? 'status-warn' : 'status-normal';
        if (tmp) tmp.className = 'metric-val ' + tmpClassTarget;
        if (cur) cur.className = 'metric-val ' + curClassTarget;
    }

    // Remove aggregated motor-temps display if present
    const tempsEl = document.getElementById('motor-temps'); if (tempsEl) tempsEl.textContent = `M1: ${Math.round(simState.motorTemp[0])}°C • M2: ${Math.round(simState.motorTemp[1])}°C • M3: ${Math.round(simState.motorTemp[2])}°C`;

    // Servos
    for (let i=0;i<6;i++){ const pct = Math.max(0,Math.min(100, Math.round(simState.servoPos[i]/180*100))); const bar = document.getElementById('servo'+(i+1)+'-pos'); if (bar) bar.style.width = pct + '%'; const v = document.getElementById('servo'+(i+1)+'-val'); if (v) v.textContent = Math.round(simState.servoPos[i]) + '°'; }

    // Power
    const bv = document.getElementById('batt-voltage'); if (bv) bv.textContent = simState.battVolt.toFixed(2) + ' V';
    const bc = document.getElementById('batt-current'); if (bc) bc.textContent = simState.battCurrent.toFixed(2) + ' A';
    const pc = document.getElementById('power-cons'); if (pc) pc.textContent = Math.round(simState.powerCons) + ' W';
    const bus = document.getElementById('bus-voltage'); if (bus) bus.textContent = simState.busVolt.toFixed(2) + ' V';
    // Battery temperature
    const bt = document.getElementById('batt-temp'); if (bt) bt.textContent = Math.round(simState.battTemp) + '°C';
    // color coding: warn if > 50°C, critical if > 65°C
    const btEl = document.getElementById('batt-temp'); if (btEl){ const t = simState.battTemp; if (t > 65) btEl.className = 'metric-val status-critical'; else if (t > 50) btEl.className = 'metric-val status-warn'; else btEl.className = 'metric-val status-normal'; }

    // Sensors
    const imu = document.getElementById('imu-status'); if (imu) { imu.textContent = simState.imuOK ? 'OK' : 'WARN'; imu.className = 'metric-val ' + (simState.imuOK ? 'status-normal' : 'status-warn'); }
    const gps = document.getElementById('gps-status'); if (gps) { gps.textContent = simState.gpsFix ? 'FIX' : 'NO FIX'; gps.className = 'metric-val ' + (simState.gpsFix ? 'status-normal' : 'status-warn'); }
    const baro = document.getElementById('baro-press'); if (baro) baro.textContent = Math.round(simState.baro) + ' hPa';
    const at = document.getElementById('air-temp'); if (at) at.textContent = Math.round(simState.airTemp) + '°C';
    const hum = document.getElementById('humidity'); if (hum) hum.textContent = Math.round(simState.humidity) + '%';
    const comp = document.getElementById('compass-status'); if (comp) { comp.textContent = simState.compassOK ? 'OK' : 'WARN'; comp.className = 'metric-val ' + (simState.compassOK ? 'status-normal' : 'status-warn'); }

    // Color coding (critical thresholds)
    // battery low
    const bvEl = document.getElementById('batt-voltage'); if (bvEl){ const v = simState.battVolt; if (v < 10.8) bvEl.className = 'metric-val status-critical'; else if (v < 11.3) bvEl.className = 'metric-val status-warn'; else bvEl.className = 'metric-val status-normal'; }
}

// Start simulation loop (UI-only)
let powerInterval = null;
function startPowerSimulation(){ if (powerInterval) return; powerInterval = setInterval(()=>{ updatePowerSim(); renderPowerPanel(); }, 700); }
function stopPowerSimulation(){ if (powerInterval){ clearInterval(powerInterval); powerInterval = null; } }

// start simulation when panel is visible (but keep running to keep states fresh)
startPowerSimulation();



// Reconnect WebSocket on page visibility change
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (!ws || ws.readyState === WebSocket.CLOSED)) {
        console.log('Page became visible, reconnecting WebSocket');
        connectWebSocket();
    }
});
