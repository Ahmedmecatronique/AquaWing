// ============================================================================
// CONFIGURATION
// ============================================================================

console.log("✅ map.js loaded");

// Global error handler to catch and log any errors that might block execution
window.addEventListener('error', function(e) {
    console.error('❌ JavaScript Error:', e.error || e.message, e);
    return false; // Don't prevent default error handling
});

// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', function(e) {
    console.error('❌ Unhandled Promise Rejection:', e.reason);
});

// ============================================================================
// URL Configuration - Uses current host (IP or localhost) automatically
// ============================================================================
const WS_RECONNECT_INTERVAL = 1000; // ms
const POLYLINE_MAX_POINTS = 2000;
const MAP_CENTER = [36.8065, 10.1815]; // Tunis

// Get current host (works with both IP address and localhost)
const getBaseURL = () => {
    return location.protocol + "//" + location.host;
};

const getWebSocketURL = () => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return protocol + "//" + location.host + "/ws";
};

// Use current host automatically (IP or localhost)
const WS_URL = getWebSocketURL();
const VIDEO_URL = "/video";
const THERMAL_URL = "/thermal";
const API_BASE = ""; // Relative URLs work with any host

// Helper to build absolute URLs if needed
const buildAbsoluteURL = (path) => {
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('ws://') || path.startsWith('wss://')) {
        return path; // Already absolute
    }
    return getBaseURL() + path;
};

console.log("🌐 WebSocket URL:", WS_URL);
console.log("🌐 Base URL:", getBaseURL());
console.log("🌐 Video URL:", VIDEO_URL);
console.log("🌐 Thermal URL:", THERMAL_URL);

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
let thermalOn = false;
let rgbTimer = null;
let thermalTimer = null;
let rgbSamples = [];
let thermalSamples = [];
let lastRGBObjectURL = null;
let lastThermalObjectURL = null;
const RGB_INTERVAL = 900; // ms
const THERMAL_INTERVAL = 1200; // ms
const SAMPLE_WINDOW_MS = 5000; // sliding window for averages (ms)

// Distance tracking (declared once at top level)
let distanceTraveled = 0;  // meters
let prevTeleLat = null;
let prevTeleLon = null;

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
let savedMissions = [];        // List of saved missions from API
let currentMissionName = null; // Currently loaded mission name

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

            // Server acknowledgement or error
            if (data.type === 'ack') {
                console.log(`✓ ACK ${data.cmd}:`, data);
                if (data.cmd === 'send_route') {
                    showToast(`Route saved: ${data.name} (${data.count} pts)`, 'success');
                    if (startFlightBtn) { startFlightBtn.disabled = false; startFlightBtn.setAttribute('aria-disabled', 'false'); }
                    updateFlightControls();
                }
                return;
            }
            if (data.type === 'error') {
                console.warn('WS error:', data.msg);
                showToast(data.msg, 'error');
                return;
            }

            // Otherwise it's telemetry from backend demo loop.
            // ALWAYS IGNORE backend telemetry — the frontend handles
            // trajectory flight entirely on its own.
            // (Backend circular demo is now disabled by default anyway.)
            // Only accept if we are NOT flying a frontend trajectory.
            if (!frontendFlying && !demoTimer) {
                updateTelemetry(data);
            }
        } catch (err) {
            console.error('Invalid WS data:', err);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        console.error('Failed to connect to:', WS_URL);
        console.error('Current location:', location.href);
    };

    ws.onclose = (event) => {
        console.warn('WebSocket closed. Code:', event.code, 'Reason:', event.reason || 'No reason');
        console.warn('Will attempt to reconnect in', WS_RECONNECT_INTERVAL, 'ms');
        console.log('WebSocket disconnected');
        // Do NOT auto-reconnect — WebSocket will reconnect lazily when needed
    };
}

// -------------------------------
// DEMO SIMULATION (no WebSocket)
// -------------------------------
// State: true when the frontend trajectory demo is actively flying
let frontendFlying = false;

let demoTimer = null;
let demoCounter = 0;
// Demo state (persist across pause/resume)
let demoWpIndex = 0;
let demoProgress = 0;
let demoStepSize = 0.02;
let demoPaused = false;

function startDemo(reset=true) {
    // Create initial marker and polyline if not present
    if (!map) initMap();
    if (!polyline) polyline = L.polyline([], {color: '#ff9f1a', weight:4, opacity:0.9}).addTo(map);

    if (reset) {
        // Clear previous flight path
        polyline.setLatLngs([]);
        demoCounter = 0;
        demoWpIndex = 0;
        demoProgress = 0;
        demoStepSize = 0.02;
        demoPaused = false;
        // Reset distance tracking
        distanceTraveled = 0;
        prevTeleLat = null;
        prevTeleLon = null;
    }

    // Fly along the waypoints trajectory
    if (waypoints.length >= 2) {
        frontendFlying = true;
        demoTimer = setInterval(() => {
            if (demoPaused) return; // do not advance when paused
            demoCounter += 1;
            if (demoWpIndex >= waypoints.length - 1) {
                stopDemo();
                showToast('Trajectory complete — drone arrived', 'success');
                return;
            }
            const from = waypoints[demoWpIndex];
            const to = waypoints[demoWpIndex + 1];
            demoProgress += demoStepSize;
            if (demoProgress >= 1) { demoProgress = 0; demoWpIndex++; }
            if (demoWpIndex >= waypoints.length - 1 && demoProgress > 0) { demoProgress = 1; }
            const lat = from.lat + (to.lat - from.lat) * demoProgress;
            const lon = from.lon + (to.lon - from.lon) * demoProgress;
            const heading = Math.atan2(to.lon - from.lon, to.lat - from.lat) * 180 / Math.PI;
            const alt = 20;
            const speed = 3.0;
            const battery = Math.max(10, 95 - Math.floor(demoCounter / 30));
            const telemetry = { lat, lon, alt, heading, speed, battery, ts: Date.now() };
            updateTelemetry(telemetry);
        }, 500);
    } else {
        showToast('Define at least 2 waypoints to start a mission', 'error');
    }
}

function pauseDemo(){
    if (!frontendFlying) return;
    demoPaused = true;
    if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
}

function resumeDemo(){
    if (!frontendFlying) return;
    if (!demoPaused) return;
    demoPaused = false;
    // Restart interval preserving demoWpIndex/demoProgress
    demoTimer = setInterval(() => {
        if (demoPaused) return;
        demoCounter += 1;
        if (demoWpIndex >= waypoints.length - 1) {
            stopDemo();
            showToast('Trajectory complete — drone arrived', 'success');
            return;
        }
        const from = waypoints[demoWpIndex];
        const to = waypoints[demoWpIndex + 1];
        demoProgress += demoStepSize;
        if (demoProgress >= 1) { demoProgress = 0; demoWpIndex++; }
        if (demoWpIndex >= waypoints.length - 1 && demoProgress > 0) { demoProgress = 1; }
        const lat = from.lat + (to.lat - from.lat) * demoProgress;
        const lon = from.lon + (to.lon - from.lon) * demoProgress;
        const heading = Math.atan2(to.lon - from.lon, to.lat - from.lat) * 180 / Math.PI;
        const alt = 20;
        const speed = 3.0;
        const battery = Math.max(10, 95 - Math.floor(demoCounter / 30));
        const telemetry = { lat, lon, alt, heading, speed, battery, ts: Date.now() };
        updateTelemetry(telemetry);
    }, 500);
}

function stopDemo(){
    if(demoTimer) { clearInterval(demoTimer); demoTimer = null; }
    frontendFlying = false;
    // Stop mission timer if mission was active
    if (flightStarted) {
        stopMissionTimer();
        flightStarted = false;
        updateFlightControls();
        // Stop heatmap scan when mission ends
        if (isScanning) {
            stopHeatmapScan();
        }
    }
    demoPaused = false;
    // disable pause/resume controls when stopped
    if (pauseMissionBtn) pauseMissionBtn.disabled = true;
    if (resumeMissionBtn) resumeMissionBtn.disabled = true;
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

// ============================================================================
// HEATMAP MAP INITIALIZATION
// ============================================================================

let heatmapMap = null;
let heatmapMarkers = [];
let heatmapScanInterval = null;
let isScanning = false;
let heatmapHistory = []; // Array of {lat, lon, isDrowning, timestamp}

function initHeatmapMap() {
    const heatmapMapContainer = document.getElementById('heatmap-map');
    if (!heatmapMapContainer) return;
    
    // If map already exists, just invalidate size
    if (heatmapMap) {
        setTimeout(() => {
            try { heatmapMap.invalidateSize(); } catch(e) {}
        }, 100);
        return;
    }
    
    // Create heatmap map centered on Tunis
    heatmapMap = L.map('heatmap-map').setView(MAP_CENTER, 15);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(heatmapMap);
    
    // Move Leaflet zoom control to bottom-right
    try{
        if (heatmapMap && heatmapMap.zoomControl) heatmapMap.zoomControl.setPosition('bottomright');
    }catch(e){ console.warn('Could not reposition heatmap zoom control', e); }
}

// ============================================================================
// HEATMAP DETECTION FUNCTIONS
// ============================================================================

function startHeatmapScan() {
    if (isScanning) {
        return; // Already scanning
    }
    
    isScanning = true;
    
    // Simulate scanning - in production, this would call an API
    heatmapScanInterval = setInterval(() => {
        simulateDetection();
    }, 3000); // Scan every 3 seconds
}

function stopHeatmapScan() {
    isScanning = false;
    if (heatmapScanInterval) {
        clearInterval(heatmapScanInterval);
        heatmapScanInterval = null;
    }
}

function simulateDetection() {
    if (!heatmapMap) return;
    
    // Get current map bounds
    const bounds = heatmapMap.getBounds();
    const center = bounds.getCenter();
    
    // Generate random position within visible map area
    const lat = center.lat + (Math.random() - 0.5) * (bounds.getNorth() - bounds.getSouth()) * 0.8;
    const lon = center.lng + (Math.random() - 0.5) * (bounds.getEast() - bounds.getWest()) * 0.8;
    
    // Randomly determine if it's a drowning case (30% chance) or normal person (70% chance)
    const isDrowning = Math.random() < 0.3;
    
    addHeatmapMarker(lat, lon, isDrowning);
}

function addHeatmapMarker(lat, lon, isDrowning) {
    if (!heatmapMap) return;
    
    // Create marker with appropriate color
    const color = isDrowning ? '#ff4d4d' : '#00ff88';
    const icon = L.divIcon({
        className: 'heatmap-marker',
        html: `<div style="width: 16px; height: 16px; border-radius: 50%; background: ${color}; border: 2px solid white; box-shadow: 0 0 8px ${color};"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });
    
    const marker = L.marker([lat, lon], { icon: icon }).addTo(heatmapMap);
    
    // Add popup with detection info
    const popupText = isDrowning 
        ? '<strong style="color: #ff4d4d;">⚠️ DROWNING CASE DETECTED</strong><br>Location: ' + lat.toFixed(6) + ', ' + lon.toFixed(6)
        : '<strong style="color: #00ff88;">✓ Normal Person</strong><br>Location: ' + lat.toFixed(6) + ', ' + lon.toFixed(6);
    marker.bindPopup(popupText);
    
    heatmapMarkers.push({ marker, isDrowning });
    
    // Add to history
    const now = new Date();
    const historyItem = {
        lat: lat,
        lon: lon,
        isDrowning: isDrowning,
        timestamp: now
    };
    heatmapHistory.unshift(historyItem); // Add to beginning
    
    // Update statistics and history display
    updateHeatmapStats();
    updateHeatmapHistory();
}

function clearHeatmapPoints() {
    // Remove all markers
    heatmapMarkers.forEach(({ marker }) => {
        if (heatmapMap) heatmapMap.removeLayer(marker);
    });
    heatmapMarkers = [];
    
    // Clear history
    heatmapHistory = [];
    
    // Update statistics and history display
    updateHeatmapStats();
    updateHeatmapHistory();
}

function clearHeatmapHistory() {
    heatmapHistory = [];
    updateHeatmapHistory();
}

function updateHeatmapHistory() {
    const historyContent = document.getElementById('heatmap-history-content');
    if (!historyContent) return;
    
    if (heatmapHistory.length === 0) {
        historyContent.innerHTML = '<div class="history-empty">Aucun cas enregistré</div>';
        return;
    }
    
    let html = '';
    heatmapHistory.forEach((item, index) => {
        const date = new Date(item.timestamp);
        const dateStr = date.toLocaleDateString('fr-FR', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
        });
        const timeStr = date.toLocaleTimeString('fr-FR', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        const typeClass = item.isDrowning ? 'drowning' : 'normal';
        const typeText = item.isDrowning ? '⚠️ NOYADE' : '✓ PERSONNE NORMALE';
        
        html += `
            <div class="history-item ${typeClass}" data-index="${index}">
                <div class="history-item-header">
                    <span class="history-item-type ${typeClass}">${typeText}</span>
                    <span class="history-item-time">${dateStr} ${timeStr}</span>
                </div>
                <div class="history-item-position">
                    <div class="history-item-coords">
                        <span class="history-item-coord">LAT: ${item.lat.toFixed(6)}</span>
                        <span class="history-item-coord">LON: ${item.lon.toFixed(6)}</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    historyContent.innerHTML = html;
    
    // Add click handlers to center map on item
    historyContent.querySelectorAll('.history-item').forEach((itemEl, index) => {
        itemEl.addEventListener('click', () => {
            const historyItem = heatmapHistory[index];
            if (heatmapMap && historyItem) {
                heatmapMap.setView([historyItem.lat, historyItem.lon], 18);
                // Find and open marker popup
                const markerData = heatmapMarkers.find(m => 
                    Math.abs(m.marker.getLatLng().lat - historyItem.lat) < 0.0001 &&
                    Math.abs(m.marker.getLatLng().lng - historyItem.lon) < 0.0001
                );
                if (markerData && markerData.marker) {
                    markerData.marker.openPopup();
                }
            }
        });
    });
}

function updateHeatmapStats() {
    const total = heatmapMarkers.length;
    const drowning = heatmapMarkers.filter(m => m.isDrowning).length;
    const normal = total - drowning;
    
    const totalEl = document.getElementById('heatmap-total-detections');
    const drowningEl = document.getElementById('heatmap-drowning-count');
    const normalEl = document.getElementById('heatmap-normal-count');
    
    if (totalEl) totalEl.textContent = total;
    if (drowningEl) drowningEl.textContent = drowning;
    if (normalEl) normalEl.textContent = normal;
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
    
    // Update top bar
    setText('top-battery', `${battery.toFixed(1)}% (${(battery * 0.168).toFixed(1)}V)`);
    setText('top-gps', `${data.gps_sats || 0} SATS (3D FIX)`);
    setText('top-alt', `${alt.toFixed(1)}m`);
    
    // Update bottom bar
    setText('bottom-lat', lat.toFixed(6));
    setText('bottom-lng', lon.toFixed(6));
    
    // System status indicator removed from UI
    
    // Update overview panel
    const setOverviewText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setOverviewText('overview-battery', `${battery.toFixed(0)}%`);
    setOverviewText('overview-battery-volt', `${(battery * 0.168).toFixed(1)}V`);
    setOverviewText('overview-gps', `${data.gps_sats || 0} SATS`);
    setOverviewText('overview-alt', `${alt.toFixed(1)}m`);
    setOverviewText('overview-speed', `${speed.toFixed(1)} m/s`);
    setOverviewText('overview-heading', `${Math.round(heading)}°`);
    const distTraveled = distanceTraveled / 1000;
    setOverviewText('overview-distance', `${distTraveled.toFixed(2)} km`);
    
    // Update speed control panel telemetry
    setOverviewText('speed-panel-battery', `${battery.toFixed(0)}%`);
    setOverviewText('speed-panel-battery-volt', `${(battery * 0.168).toFixed(1)}V`);
    setOverviewText('speed-panel-gps', `${data.gps_sats || 0} SATS`);
    setOverviewText('speed-panel-alt', `${alt.toFixed(1)}m`);
    setOverviewText('speed-panel-speed', `${speed.toFixed(1)} m/s`);
    setOverviewText('speed-panel-heading', `${Math.round(heading)}°`);
    setOverviewText('speed-panel-distance', `${distTraveled.toFixed(2)} km`);
    
    // Update Systems panel
    const setSysText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setSysText('sys-batt-voltage', `${(battery * 0.168).toFixed(1)} V`);
    setSysText('sys-batt-current', `${(data.current || 0).toFixed(1)} A`);
    setSysText('sys-power-cons', `${((battery * 0.168) * (data.current || 0)).toFixed(0)} W`);
    setSysText('sys-bus-voltage', `${(battery * 0.168).toFixed(1)} V`);
    setSysText('sys-batt-temp', `${(data.battery_temp || 30).toFixed(0)}°C`);
    setSysText('sys-imu', 'OK');
    setSysText('sys-gps', data.gps_sats > 0 ? 'FIX' : 'NO FIX');
    setSysText('sys-baro', `${(data.baro_press || 1013).toFixed(0)} hPa`);
    setSysText('sys-compass', 'OK');
    
    // Update motor statuses (simulated)
    for (let i = 1; i <= 3; i++) {
        setSysText(`sys-motor-${i}`, 'OK');
        setSysText(`sys-motor-${i}-temp`, `${(45 + Math.random() * 5).toFixed(0)}°C`);
    }
    
    // Update bottom bar telemetry
    const setBottomText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setBottomText('bottom-uart', 'OK');
    setBottomText('bottom-rpi-temp', '42°C');
    setBottomText('bottom-mag', 'CALIBRATED');

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

    // Distance traveled (accumulate haversine between consecutive telemetry points)
    if (prevTeleLat !== null && prevTeleLon !== null) {
        const seg = haversineDistanceMeters(prevTeleLat, prevTeleLon, lat, lon);
        if (seg < 500) distanceTraveled += seg; // ignore GPS jumps > 500m
    }
    prevTeleLat = lat;
    prevTeleLon = lon;

    // Distance remaining = total route - traveled (clamped to 0)
    const totalRoute = calculateRouteTotalDistance();
    const distRemaining = Math.max(0, totalRoute - distanceTraveled);

    const setText2 = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setText2('dist-traveled', (distanceTraveled / 1000).toFixed(2));
    setText2('dist-remaining', totalRoute > 0 ? (distRemaining / 1000).toFixed(2) : '--');


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

    // Map telemetry fields to system panel when available (non-destructive)
    try {
        if (data.battery_voltage_v !== undefined) simState.battVolt = Number(data.battery_voltage_v);
        if (data.battery_temp_c !== undefined) simState.battTemp = Number(data.battery_temp_c);
        if (Array.isArray(data.motors)) {
            data.motors.forEach((m,i)=>{ if (i<3){ simState.motorRPS[i] = Number(m.rps || simState.motorRPS[i]); simState.motorTemp[i] = Number(m.temp || simState.motorTemp[i]); simState.motorCurrent[i] = Number(m.current || simState.motorCurrent[i]); simState.motorVoltage[i] = Number(m.voltage || simState.motorVoltage[i]); }});
        }
        if (Array.isArray(data.servos)) { data.servos.forEach((s,i)=>{ if (i<6) simState.servoPos[i] = Number(s.pos || simState.servoPos[i]); }); }
        if (data.imu_ok !== undefined) simState.imuOK = !!data.imu_ok;
        if (data.gps_fix !== undefined) simState.gpsFix = !!data.gps_fix;
        if (data.baro_hpa !== undefined) simState.baro = Number(data.baro_hpa);
        // Re-render power panel immediately if telemetry provided
        renderPowerPanel();
    } catch(e){ /* ignore mapping errors */ }

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

/** Send route to backend via WebSocket */
/** Ensure WebSocket is connected (lazy connect) */
function ensureWebSocket() {
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        connectWebSocket();
    }
}

async function sendRouteToBackend() {
    if (waypoints.length < 2) {
        showToast('Need at least 2 waypoints to send route', 'error');
        return;
    }
    
    ensureWebSocket();
    
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const missionName = `mission_manual_${timestamp}`;
    
    const points = waypoints.map(wp => ({
        seq: wp.seq,
        lat: wp.lat,
        lon: wp.lon,
        alt: 20  // Default altitude
    }));
    
    const payload = {
        cmd: 'send_route',
        name: missionName,
        points: points
    };
    
    try {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
        } else {
            showToast('WebSocket connecting... try again in a moment', 'error');
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
        if (sendRouteBtn) sendRouteBtn.style.display = waypointsEnabled ? 'inline-block' : 'none';
        if (clearRouteBtn) clearRouteBtn.style.display = waypointsEnabled ? 'inline-block' : 'none';
        const saveMissionBtn = document.getElementById('save-mission-btn');
        const loadMissionBtn = document.getElementById('load-mission-btn');
        if (saveMissionBtn) saveMissionBtn.style.display = waypointsEnabled ? 'inline-block' : 'none';
        if (loadMissionBtn) loadMissionBtn.style.display = waypointsEnabled ? 'inline-block' : 'none';
        // Show/hide route distance
        const rd = document.getElementById('route-distance'); if (rd) rd.style.display = waypointsEnabled ? 'block' : 'none';
        
        // Clear route when toggling off
        if (!waypointsEnabled) {
            clearAllWaypoints();
        }
    });
}
// ============================================================================
// SYSTEM TEST (frontend-only simulated pre-flight checks)
// ============================================================================
const systemTestBtn = document.getElementById('system-test-btn');
const systemTestModal = document.getElementById('system-test-modal');
const systemTestBody = document.getElementById('system-test-body');
const systemTestClose = document.getElementById('system-test-close');
const systemTestCloseOk = document.getElementById('system-test-close-ok');
const systemTestLog = document.getElementById('system-test-log');
const systemTestLogBody = document.getElementById('system-test-log-body');

function _rnd(p=0.9){ return Math.random() < p; }
function _parseNumberFromId(id, fallback=NaN){ const el=document.getElementById(id); if(!el) return fallback; const v=parseFloat(String(el.textContent||'').replace(/[^0-9.\-]/g,'')); return isNaN(v)?fallback:v; }

function _renderStatus(name, ok, note){ const cls = ok? 'ok':'fail'; const icon = ok? '✔':'✖'; return `<div class="sys-item"><div class="name">${name}</div><div class="status ${cls}">${icon} ${note|| (ok? 'OK':'FAIL')}</div></div>`; }

function runSystemTest() {
  const panel = document.getElementById('system-test-log');
  if (!panel) {
    console.error('SYSTEM TEST PANEL NOT FOUND');
    return;
  }

  // reset
  panel.innerHTML = '';
  panel.setAttribute('aria-hidden', 'false');

  const messages = [
    { t: 'Initializing system test...', c: 'log-info' },
    { t: 'Power system: OK', c: 'log-ok' },
    { t: 'Motor 1: ON', c: 'log-ok' },
    { t: 'Motor 2: ON', c: 'log-ok' },
    { t: 'Motor 3: ON', c: 'log-ok' },
    { t: 'Servo check: OK', c: 'log-ok' },
    { t: 'Sensors check: OK', c: 'log-ok' },
    { t: 'SYSTEM TEST COMPLETED', c: 'log-ok' }
  ];

  let i = 0;
  const interval = 600; // ms
  const timer = setInterval(() => {
    if (i >= messages.length) { clearInterval(timer); return; }
    const line = document.createElement('div');
    line.className = `log-line ${messages[i].c}`;
    line.textContent = messages[i].t;
    panel.appendChild(line);
    panel.scrollTop = panel.scrollHeight;
    i++;
  }, interval);
}

// Clear / append helpers for the log
function appendLog(text, cls='log-info'){
    const body = systemTestLogBody || document.getElementById('system-test-log-body');
    if (!body) return;
    const div = document.createElement('div');
    div.className = `log-line ${cls}`;
    div.textContent = text;
    body.appendChild(div);
    // Auto-scroll
    body.scrollTop = body.scrollHeight;
}

function clearLog(){
    // Cancel pending timers
    if (Array.isArray(systemTestTimers) && systemTestTimers.length){ systemTestTimers.forEach(id=>clearTimeout(id)); systemTestTimers = []; }
    const body = systemTestLogBody || document.getElementById('system-test-log-body'); if (body) body.innerHTML = '';
    const panel = systemTestLog || document.getElementById('system-test-log'); if (panel) panel.setAttribute('aria-hidden','true');
}

// Wire clear button
const systemTestClearBtn = document.getElementById('system-test-clear');
if (systemTestClearBtn) systemTestClearBtn.addEventListener('click', clearLog);

function closeSystemTestModal(){ if (systemTestModal) systemTestModal.setAttribute('aria-hidden','true'); }

document.addEventListener("click", function (e) {
  const btn = e.target.closest("#system-test-btn");
  if (!btn) return;

  console.log("✅ SYSTEM TEST CLICKED");
  runSystemTest();
});
if (systemTestClose) systemTestClose.addEventListener('click', closeSystemTestModal);
if (systemTestCloseOk) systemTestCloseOk.addEventListener('click', closeSystemTestModal);
if (systemTestModal) {
    const bd = systemTestModal.querySelector('.modal-backdrop'); if (bd) bd.addEventListener('click', closeSystemTestModal);
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

// Mission management functions
async function saveMissionToBackend() {
    if (waypoints.length < 2) {
        showToast('Need at least 2 waypoints to save mission', 'error');
        return;
    }
    
    const missionName = prompt('Enter mission name:', currentMissionName || `mission_${Date.now()}`);
    if (!missionName) return;
    
    const points = waypoints.map(wp => ({
        seq: wp.seq,
        lat: wp.lat,
        lon: wp.lon,
        alt: 20  // Default altitude
    }));
    
    try {
        const res = await fetch(API_BASE + '/api/missions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: missionName, points })
        });
        
        if (!res.ok) {
            const err = await res.text();
            throw new Error(err || 'Failed to save mission');
        }
        
        const data = await res.json();
        currentMissionName = missionName;
        showToast(`Mission '${missionName}' saved successfully`, 'success');
        await loadMissionsList();
    } catch (err) {
        console.error('Save mission error:', err);
        showToast(`Failed to save mission: ${err.message}`, 'error');
    }
}

async function loadMissionsList() {
    try {
        const res = await fetch(API_BASE + '/api/missions');
        if (!res.ok) throw new Error('Failed to load missions');
        const data = await res.json();
        savedMissions = data.missions || [];
        return savedMissions;
    } catch (err) {
        console.error('Load missions list error:', err);
        return [];
    }
}

async function loadMissionFromBackend(missionName) {
    try {
        const res = await fetch(API_BASE + `/api/missions/${encodeURIComponent(missionName)}`);
        if (!res.ok) throw new Error('Mission not found');
        const mission = await res.json();
        
        // Clear current waypoints
        clearAllWaypoints();
        
        // Load waypoints from mission
        mission.points.forEach((point, idx) => {
            addWaypoint(point.lat, point.lon);
        });
        
        currentMissionName = missionName;
        showToast(`Mission '${missionName}' loaded (${mission.points.length} waypoints)`, 'success');
    } catch (err) {
        console.error('Load mission error:', err);
        showToast(`Failed to load mission: ${err.message}`, 'error');
    }
}

async function showMissionSelector() {
    const missions = await loadMissionsList();
    if (missions.length === 0) {
        showToast('No saved missions found', 'info');
        return;
    }
    
    const missionName = prompt(`Select mission to load:\n${missions.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\nEnter mission name:`, '');
    if (missionName && missions.includes(missionName)) {
        await loadMissionFromBackend(missionName);
    } else if (missionName) {
        showToast('Mission not found', 'error');
    }
}

// Wire up mission buttons
const saveMissionBtn = document.getElementById('save-mission-btn');
const loadMissionBtn = document.getElementById('load-mission-btn');
if (saveMissionBtn) {
    saveMissionBtn.addEventListener('click', saveMissionToBackend);
}
if (loadMissionBtn) {
    loadMissionBtn.addEventListener('click', showMissionSelector);
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

// START FLIGHT — requires waypoints, then starts demo simulation + sends WS command
if (startFlightBtn) {
    startFlightBtn.addEventListener('click', () => {
        if (startFlightBtn.disabled) return;
        // Block if no route has been defined
        if (waypoints.length < 2) {
            showToast('Define a trajectory first (at least 2 waypoints)', 'error');
            return;
        }
        ensureWebSocket();
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ cmd: 'start_flight' }));
        }
        // Start the drone simulation along the waypoint route
        startDemo();
        // enable pause/resume controls
        if (pauseMissionBtn) pauseMissionBtn.disabled = false;
        if (resumeMissionBtn) resumeMissionBtn.disabled = true;
        flightStarted = true;
        updateFlightControls();
        startMissionTimer(); // Start mission statistics tracking
        // Start heatmap scan automatically when mission starts
        if (!isScanning) {
            startHeatmapScan();
        }
        showToast('Mission started — drone is flying the trajectory', 'success');
    });
}

// WAIT / MISSION END — send abort via WebSocket

// EMERGENCY RTL — Return To Launch (fly back to waypoint 1)
let rtlTimer = null;
const emergencyRtlBtn = document.getElementById('emergency-rtl-btn');
if (emergencyRtlBtn) {
    emergencyRtlBtn.addEventListener('click', () => {
        if (!confirm('EMERGENCY RTL: Le drone va abandonner la mission et retourner au point de départ. Confirmer ?')) return;
        ensureWebSocket();
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ cmd: 'abort' }));
            ws.send(JSON.stringify({ cmd: 'rtl' }));
        }
        // Stop current flight
        stopDemo();
        if (rtlTimer) { clearInterval(rtlTimer); rtlTimer = null; }

        // Get current drone position from the last telemetry marker
        const home = waypoints.length > 0 ? waypoints[0] : null;
        if (!home) { showToast('No home waypoint — cannot RTL', 'error'); return; }

        let curLat = prevTeleLat;
        let curLon = prevTeleLon;
        if (curLat === null || curLon === null) {
            if (droneMarker) { const ll = droneMarker.getLatLng(); curLat = ll.lat; curLon = ll.lng; }
            else { showToast('No drone position — cannot RTL', 'error'); return; }
        }

        const rtlFrom = { lat: curLat, lon: curLon };
        let rtlProgress = 0;
        const rtlStep = 0.02;
        frontendFlying = true;
        showToast('EMERGENCY RTL — Drone returning to position 1', 'warning');

        rtlTimer = setInterval(() => {
            rtlProgress += rtlStep;
            if (rtlProgress >= 1) {
                rtlProgress = 1;
                clearInterval(rtlTimer);
                rtlTimer = null;
                frontendFlying = false;
                showToast('RTL complete — drone at home position', 'success');
            }
            const lat = rtlFrom.lat + (home.lat - rtlFrom.lat) * rtlProgress;
            const lon = rtlFrom.lon + (home.lon - rtlFrom.lon) * rtlProgress;
            const heading = Math.atan2(home.lon - rtlFrom.lon, home.lat - rtlFrom.lat) * 180 / Math.PI;
            const telemetry = { lat, lon, alt: 20, heading, speed: 4.0, battery: 50, ts: Date.now() };
            updateTelemetry(telemetry);
        }, 500);
    });
}

if (waitBtn) {
    waitBtn.addEventListener('click', () => {
        if (waitBtn.disabled) return;
        ensureWebSocket();
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ cmd: 'abort' }));
        }
        // Stop the demo simulation
        stopDemo();
        missionLocked = true;
        // Stop heatmap scan when mission ends
        if (isScanning) {
            stopHeatmapScan();
        }
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

// PRE-FLIGHT CHECK button
const preflightBtn = document.getElementById('preflight-btn');
if (preflightBtn) {
    preflightBtn.addEventListener('click', () => {
        const preflightStatus = document.getElementById('preflight-status');
        if (!preflightStatus) return;
        
        preflightStatus.style.display = 'flex';
        const items = preflightStatus.querySelectorAll('.status-item');
        
        // Simulate pre-flight check
        items.forEach((item, index) => {
            setTimeout(() => {
                const statusEl = item.querySelector('.status');
                if (statusEl) {
                    statusEl.textContent = 'OK';
                    statusEl.className = 'status ok';
                }
            }, (index + 1) * 800);
        });
        
        showToast('Pre-flight check initiated', 'info');
    });
}

// Pause / Resume mission controls
const pauseMissionBtn = document.getElementById('pause-mission-btn');
const resumeMissionBtn = document.getElementById('resume-mission-btn');
if (pauseMissionBtn) {
    pauseMissionBtn.addEventListener('click', () => {
        if (pauseMissionBtn.disabled) return;
        pauseDemo();
        if (pauseMissionBtn) pauseMissionBtn.disabled = true;
        if (resumeMissionBtn) resumeMissionBtn.disabled = false;
        flightStarted = false;
        updateFlightControls();
        // Stop heatmap scan when mission is paused
        if (isScanning) {
            stopHeatmapScan();
        }
        showToast('Mission paused', 'info');
    });
}
if (resumeMissionBtn) {
    resumeMissionBtn.addEventListener('click', () => {
        if (resumeMissionBtn.disabled) return;
        resumeDemo();
        if (pauseMissionBtn) pauseMissionBtn.disabled = false;
        if (resumeMissionBtn) resumeMissionBtn.disabled = true;
        flightStarted = true;
        updateFlightControls();
        // Resume mission timer if it was stopped
        if (!missionStartTime) {
            startMissionTimer();
        }
        // Resume heatmap scan when mission resumes
        if (!isScanning) {
            startHeatmapScan();
        }
        showToast('Mission resumed', 'success');
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

// Global click handler for Logout (single handler, minimal)
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "logout-btn") {
    window.location.href = "/logout";
  }
  // Handle sidebar logout button
  if (e.target && (e.target.id === "sidebar-logout-btn" || e.target.closest("#sidebar-logout-btn"))) {
    window.location.href = "/logout";
  }
});

// --- Dev: surface active versions and JS errors in a small banner ---
(function(){
    try{
        const banner = document.getElementById('dev-banner');
        if (banner && window.__MAP_CSS_VERSION && window.__MAP_JS_VERSION) {
            banner.textContent = `Map CSS: ${window.__MAP_CSS_VERSION} • Map JS: ${window.__MAP_JS_VERSION}`;
        }
        const errBox = document.createElement('div'); errBox.id = 'dev-errors'; document.body.appendChild(errBox);
        window.addEventListener('error', (ev)=>{
            if (banner) banner.classList.add('error');
            errBox.style.display = 'block';
            const line = document.createElement('div'); line.textContent = `[ERROR] ${ev.message} @ ${ev.filename}:${ev.lineno}`; errBox.appendChild(line);
            console.error('Dev banner captured error:', ev.message, ev.filename, ev.lineno);
        });
        window.addEventListener('unhandledrejection', (ev)=>{
            if (banner) banner.classList.add('error');
            errBox.style.display = 'block';
            const line = document.createElement('div'); line.textContent = `[PROMISE REJECTION] ${String(ev.reason)}`; errBox.appendChild(line);
            console.error('Dev banner captured rejection:', ev.reason);
        });
        console.log('Dev banner initialized:', window.__MAP_CSS_VERSION, window.__MAP_JS_VERSION);
    }catch(e){ console.warn('Dev banner init failed', e); }
})();

// Video / Camera controls
const videoToggle = document.getElementById('video-toggle');
const videoImg = document.getElementById('video-stream');
const videoPlaceholder = document.getElementById('video-placeholder');
const videoStatus = document.getElementById('video-status');

// Video placeholder timers
const placeholderTimers = new Map();

// Initialize placeholder text change after 5 seconds
function initPlaceholderTimer(placeholderElement) {
    if (!placeholderElement) return;
    
    // Clear existing timer if any
    if (placeholderTimers.has(placeholderElement)) {
        clearTimeout(placeholderTimers.get(placeholderElement));
        placeholderTimers.delete(placeholderElement);
    }
    
    // Detect if this is an RGB camera placeholder
    const isRgbPlaceholder = placeholderElement.id === 'video-placeholder' || 
                              placeholderElement.id === 'optical-video-placeholder';
    
    // Reset text to initial state
    const textEl = placeholderElement.querySelector('.video-placeholder-text');
    if (textEl) {
        if (isRgbPlaceholder) {
            textEl.textContent = 'Connecting to RGB Camera...';
        } else {
            textEl.textContent = 'Connecting to Camera...';
        }
    }
    
    // Set timer to change text after 5 seconds
    const timer = setTimeout(() => {
        if (textEl && placeholderElement.style.display !== 'none') {
            if (isRgbPlaceholder) {
                textEl.textContent = 'Awaiting video signal...';
            } else {
                textEl.textContent = 'Awaiting Signal...';
            }
        }
        placeholderTimers.delete(placeholderElement);
    }, 5000);
    
    placeholderTimers.set(placeholderElement, timer);
}

// Clear placeholder timer when video becomes available
function clearPlaceholderTimer(placeholderElement) {
    if (!placeholderElement) return;
    if (placeholderTimers.has(placeholderElement)) {
        clearTimeout(placeholderTimers.get(placeholderElement));
        placeholderTimers.delete(placeholderElement);
    }
    // Detect if this is an RGB camera placeholder
    const isRgbPlaceholder = placeholderElement.id === 'video-placeholder' || 
                              placeholderElement.id === 'optical-video-placeholder';
    // Reset text to initial state
    const textEl = placeholderElement.querySelector('.video-placeholder-text');
    if (textEl) {
        if (isRgbPlaceholder) {
            textEl.textContent = 'Connecting to RGB Camera...';
        } else {
            textEl.textContent = 'Connecting to Camera...';
        }
    }
}
const rgbResolutionSelect = document.getElementById('rgb-resolution');
const opticalRgbResolutionSelect = document.getElementById('optical-rgb-resolution');
const opticalRgbResolutionSelectMain = document.getElementById('optical-rgb-resolution-main');

// Sync resolution selects
function syncResolutionSelects(value) {
    if (rgbResolutionSelect) rgbResolutionSelect.value = value;
    if (opticalRgbResolutionSelect) opticalRgbResolutionSelect.value = value;
    if (opticalRgbResolutionSelectMain) opticalRgbResolutionSelectMain.value = value;
}

if (rgbResolutionSelect) {
    rgbResolutionSelect.addEventListener('change', (ev)=>{
        const res = ev.target.value;
        syncResolutionSelects(res);
        // if streaming is active, restart loop with new resolution
        if (videoOn) startRGBLoop(res);
        else {
            const elR = document.getElementById('rgb-res'); if (elR) elR.textContent = res;
        }
    });
}

if (opticalRgbResolutionSelect) {
    opticalRgbResolutionSelect.addEventListener('change', (ev)=>{
        const res = ev.target.value;
        syncResolutionSelects(res);
        if (videoOn) startRGBLoop(res);
        else {
            const elR = document.getElementById('rgb-res'); if (elR) elR.textContent = res;
        }
    });
}

if (opticalRgbResolutionSelectMain) {
    opticalRgbResolutionSelectMain.addEventListener('change', (ev)=>{
        const res = ev.target.value;
        syncResolutionSelects(res);
        if (videoOn) startRGBLoop(res);
        else {
            const elR = document.getElementById('rgb-res'); if (elR) elR.textContent = res;
        }
    });
}

async function fetchBlob(url){
    try {
        // Use relative URLs - they work with any host (IP or localhost)
        const r = await fetch(url, {
            cache: 'no-store',
            credentials: 'include',
            mode: 'cors'
        });
        if (!r.ok) {
            console.warn('Fetch failed:', r.status, r.statusText, 'for URL:', url);
            return null;
        }
        const b = await r.blob();
        return b;
    } catch(e){
        console.error('Fetch blob error:', e, 'for URL:', url);
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

let rgbAiTimer = null;

function drawDetectionsOnCanvas(canvasId, detections){
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rectW = canvas.offsetWidth;
    const rectH = canvas.offsetHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rectW * dpr);
    canvas.height = Math.round(rectH * dpr);
    canvas.style.width = rectW + 'px';
    canvas.style.height = rectH + 'px';
    ctx.setTransform(dpr,0,0,dpr,0,0); // scale drawing to DPR
    // clear
    ctx.clearRect(0,0,rectW,rectH);
    detections.forEach(det => {
        const x = det.x * rectW;
        const y = det.y * rectH;
        const bw = det.w * rectW;
        const bh = det.h * rectH;
        
        // Enhanced bounding box with confidence indicator
        ctx.strokeStyle = det.color || '#ff9f1a';
        ctx.lineWidth = Math.max(2, Math.round(Math.min(rectW,rectH)*0.006));
        ctx.strokeRect(x,y,bw,bh);
        
        // Confidence bar at top of bounding box
        const confBarWidth = (det.conf / 100) * bw;
        ctx.fillStyle = det.color || '#ff9f1a';
        ctx.fillRect(x, y - 4, confBarWidth, 3);
        
        // Label with background for better visibility
        const labelText = `${det.label} – ${det.conf}%`;
        const fontSize = Math.max(12, Math.round(rectW*0.03));
        ctx.font = `${fontSize}px Outfit, sans-serif`;
        const textMetrics = ctx.measureText(labelText);
        const textBgWidth = textMetrics.width + 8;
        const textBgHeight = fontSize + 4;
        
        // Semi-transparent background for text
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(x + 2, y + 2, textBgWidth, textBgHeight);
        
        // Text
        ctx.fillStyle = det.color || '#ff9f1a';
        ctx.fillText(labelText, x + 6, y + fontSize + 2);
        
        // Corner markers for better visibility
        const cornerSize = 8;
        ctx.strokeStyle = det.color || '#ff9f1a';
        ctx.lineWidth = 2;
        // Top-left
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + cornerSize, y);
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + cornerSize);
        ctx.stroke();
        // Top-right
        ctx.beginPath();
        ctx.moveTo(x + bw, y);
        ctx.lineTo(x + bw - cornerSize, y);
        ctx.moveTo(x + bw, y);
        ctx.lineTo(x + bw, y + cornerSize);
        ctx.stroke();
        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(x, y + bh);
        ctx.lineTo(x + cornerSize, y + bh);
        ctx.moveTo(x, y + bh);
        ctx.lineTo(x, y + bh - cornerSize);
        ctx.stroke();
        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(x + bw, y + bh);
        ctx.lineTo(x + bw - cornerSize, y + bh);
        ctx.moveTo(x + bw, y + bh);
        ctx.lineTo(x + bw, y + bh - cornerSize);
        ctx.stroke();
    });
}
function clearOverlay(canvasId){ const c=document.getElementById(canvasId); if(!c) return; const ctx=c.getContext('2d'); ctx && ctx.clearRect(0,0,c.width,c.height); }

// Enhanced AI detection types
const DETECTION_TYPES = {
    rgb: [
        { label: 'Person', color: '#ff9f1a', prob: 0.4 },
        { label: 'Vehicle', color: '#00ff88', prob: 0.2 },
        { label: 'Obstacle', color: '#ff6b6b', prob: 0.15 },
        { label: 'Landing Zone', color: '#2b6efb', prob: 0.1 }
    ],
    thermal: [
        { label: 'Heat Source', color: '#ff9f1a', prob: 0.5 },
        { label: 'Floating Object', color: '#00ff88', prob: 0.3 },
        { label: 'Water Disturbance', color: '#2b6efb', prob: 0.2 }
    ]
};

function simulateRGBDetections(){
    // only simulate small detections when RGB is on
    if (!videoOn) return;
    const detections = [];
    const rand = Math.random();
    let cumulativeProb = 0;
    
    for (const type of DETECTION_TYPES.rgb) {
        cumulativeProb += type.prob;
        if (rand < cumulativeProb) {
            const conf = 70 + Math.round(Math.random() * 25);
            detections.push({
                x: 0.15 + Math.random() * 0.5,
                y: 0.15 + Math.random() * 0.5,
                w: 0.2 + Math.random() * 0.15,
                h: 0.2 + Math.random() * 0.2,
                label: type.label,
                conf: conf,
                color: type.color
            });
            
            const aiEl = document.getElementById('rgb-ai');
            if (aiEl) {
                aiEl.textContent = `${type.label} detected – ${conf}% confidence`;
                aiEl.style.color = type.color;
            }
            break;
        }
    }
    
    if (detections.length === 0) {
        const aiEl = document.getElementById('rgb-ai');
        if (aiEl) aiEl.textContent = '';
    }
    
    drawDetectionsOnCanvas('rgb-overlay', detections);
}

function simulateThermalDetections(){
    if (!thermalOn) return;
    const detections = [];
    const rand = Math.random();
    let cumulativeProb = 0;
    
    for (const type of DETECTION_TYPES.thermal) {
        cumulativeProb += type.prob;
        if (rand < cumulativeProb) {
            const conf = 65 + Math.round(Math.random() * 30);
            detections.push({
                x: 0.2 + Math.random() * 0.5,
                y: 0.2 + Math.random() * 0.5,
                w: 0.2 + Math.random() * 0.2,
                h: 0.2 + Math.random() * 0.25,
                label: type.label,
                conf: conf,
                color: type.color
            });
            
            const aiEl = document.getElementById('thermal-ai');
            if (aiEl) {
                aiEl.textContent = `${type.label} detected – ${conf}% confidence`;
                aiEl.style.color = type.color;
            }
            break;
        }
    }
    
    if (detections.length === 0) {
        const aiEl = document.getElementById('thermal-ai');
        if (aiEl) aiEl.textContent = '';
    }
    
    drawDetectionsOnCanvas('thermal-overlay', detections);
}

function startRGBLoop(res){
    stopRGBLoop();
    // initial fetch immediately
    fetchAndDisplayRGB(res);
    rgbTimer = setInterval(()=> fetchAndDisplayRGB(res), RGB_INTERVAL);
    // start AI overlay simulation
    if (rgbAiTimer) clearInterval(rgbAiTimer);
    rgbAiTimer = setInterval(simulateRGBDetections, 1200);
    simulateRGBDetections();
}
function stopRGBLoop(){ if (rgbTimer) { clearInterval(rgbTimer); rgbTimer = null; } try{ if (lastRGBObjectURL) { URL.revokeObjectURL(lastRGBObjectURL); lastRGBObjectURL = null; } }catch(e){} if (videoImg) videoImg.src = ''; const elB = document.getElementById('rgb-bitrate'); if (elB) elB.textContent = '0 kb/s'; const elR = document.getElementById('rgb-res'); if (elR) elR.textContent = '--'; if (videoStatus) videoStatus.className = 'status-dot off'; if (rgbAiTimer) { clearInterval(rgbAiTimer); rgbAiTimer = null; } clearOverlay('rgb-overlay'); document.getElementById('rgb-ai') && (document.getElementById('rgb-ai').textContent = ''); }

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

let thermalAiTimer = null;
function startThermalLoop(){ stopThermalLoop(); fetchAndDisplayThermal(); thermalTimer = setInterval(()=> fetchAndDisplayThermal(), THERMAL_INTERVAL); if (thermalAiTimer) clearInterval(thermalAiTimer); thermalAiTimer = setInterval(simulateThermalDetections, 1400); simulateThermalDetections(); }
function stopThermalLoop(){ if (thermalTimer) { clearInterval(thermalTimer); thermalTimer = null; } try{ if (lastThermalObjectURL) { URL.revokeObjectURL(lastThermalObjectURL); lastThermalObjectURL = null; } }catch(e){} if (thermalImg) thermalImg.src = ''; const elF = document.getElementById('thermal-fps'); if (elF) elF.textContent = '0 fps'; const elR = document.getElementById('thermal-res'); if (elR) elR.textContent = '--'; if (thermalStatus) thermalStatus.className = 'status-dot off'; if (thermalAiTimer) { clearInterval(thermalAiTimer); thermalAiTimer = null; } clearOverlay('thermal-overlay'); document.getElementById('thermal-ai') && (document.getElementById('thermal-ai').textContent = ''); }

// cleanup on unload
window.addEventListener('beforeunload', ()=>{
    stopRGBLoop(); stopThermalLoop(); if (rgbTimer) clearInterval(rgbTimer); if (thermalTimer) clearInterval(thermalTimer);
});

function setVideo(on){
    videoOn = !!on;
    if (videoToggle && window.Toggles) window.Toggles.setState(videoToggle, videoOn);
    if (videoToggle) videoToggle.textContent = videoOn ? 'RGB: ON' : 'RGB: OFF';
    const opticalVideoToggle = document.getElementById('optical-video-toggle');
    const opticalVideoToggleMain = document.getElementById('optical-video-toggle-main');
    if (opticalVideoToggle) opticalVideoToggle.textContent = videoOn ? 'RGB: ON' : 'RGB: OFF';
    if (opticalVideoToggleMain) opticalVideoToggleMain.textContent = videoOn ? 'RGB: ON' : 'RGB: OFF';
    if (videoStatus) videoStatus.className = `status-dot ${videoOn? 'on':'off'}`;
    if (videoOn) {
        if (videoPlaceholder) {
            videoPlaceholder.style.display = 'none';
            clearPlaceholderTimer(videoPlaceholder);
        }
        const opticalVideoPlaceholder = document.getElementById('optical-video-placeholder');
        if (opticalVideoPlaceholder) {
            opticalVideoPlaceholder.style.display = 'none';
            clearPlaceholderTimer(opticalVideoPlaceholder);
        }
        const res = (rgbResolutionSelect && rgbResolutionSelect.value) ? rgbResolutionSelect.value : '1280x720';
        startRGBLoop(res);
    } else {
        if (videoPlaceholder) {
            videoPlaceholder.style.display = 'flex';
            initPlaceholderTimer(videoPlaceholder);
        }
        const opticalVideoPlaceholder = document.getElementById('optical-video-placeholder');
        if (opticalVideoPlaceholder) {
            opticalVideoPlaceholder.style.display = 'flex';
            initPlaceholderTimer(opticalVideoPlaceholder);
        }
        stopRGBLoop();
    }
}

if (videoToggle) videoToggle.addEventListener('click', ()=> setVideo(!videoOn));

// Connect optical panel video toggle (settings panel)
const opticalVideoToggle = document.getElementById('optical-video-toggle');
if (opticalVideoToggle) {
    opticalVideoToggle.addEventListener('click', () => {
        setVideo(!videoOn);
        // Sync button text
        opticalVideoToggle.textContent = videoOn ? 'RGB: ON' : 'RGB: OFF';
        const opticalVideoToggleMain = document.getElementById('optical-video-toggle-main');
        if (opticalVideoToggleMain) opticalVideoToggleMain.textContent = videoOn ? 'RGB: ON' : 'RGB: OFF';
    });
}

// Connect optical cameras view video toggle
const opticalVideoToggleMain = document.getElementById('optical-video-toggle-main');
if (opticalVideoToggleMain) {
    opticalVideoToggleMain.addEventListener('click', () => {
        setVideo(!videoOn);
        // Sync button text
        opticalVideoToggleMain.textContent = videoOn ? 'RGB: ON' : 'RGB: OFF';
        if (opticalVideoToggle) opticalVideoToggle.textContent = videoOn ? 'RGB: ON' : 'RGB: OFF';
    });
}

// ── Thermal ON/OFF ──
const thermalToggle = document.getElementById('thermal-toggle');

function setThermal(on){
    thermalOn = !!on;
    if (thermalToggle && window.Toggles) window.Toggles.setState(thermalToggle, thermalOn);
    if (thermalToggle) thermalToggle.textContent = thermalOn ? 'Thermal: ON' : 'Thermal: OFF';
    const opticalThermalToggle = document.getElementById('optical-thermal-toggle');
    const opticalThermalToggleMain = document.getElementById('optical-thermal-toggle-main');
    if (opticalThermalToggle) opticalThermalToggle.textContent = thermalOn ? 'Thermal: ON' : 'Thermal: OFF';
    if (opticalThermalToggleMain) opticalThermalToggleMain.textContent = thermalOn ? 'Thermal: ON' : 'Thermal: OFF';
    if (thermalStatus) thermalStatus.className = `status-dot ${thermalOn ? 'on' : 'off'}`;
    if (thermalStatus) thermalStatus.textContent = thermalOn ? 'ON' : 'OFF';
    if (thermalOn) {
        if (thermalPlaceholder) {
            thermalPlaceholder.style.display = 'none';
            clearPlaceholderTimer(thermalPlaceholder);
        }
        const opticalThermalPlaceholder = document.getElementById('optical-thermal-placeholder');
        if (opticalThermalPlaceholder) {
            opticalThermalPlaceholder.style.display = 'none';
            clearPlaceholderTimer(opticalThermalPlaceholder);
        }
        startThermalLoop();
    } else {
        if (thermalPlaceholder) {
            thermalPlaceholder.style.display = 'flex';
            initPlaceholderTimer(thermalPlaceholder);
        }
        const opticalThermalPlaceholder = document.getElementById('optical-thermal-placeholder');
        if (opticalThermalPlaceholder) {
            opticalThermalPlaceholder.style.display = 'flex';
            initPlaceholderTimer(opticalThermalPlaceholder);
        }
        stopThermalLoop();
    }
}

if (thermalToggle) thermalToggle.addEventListener('click', ()=> setThermal(!thermalOn));

// Connect optical panel thermal toggle (settings panel)
const opticalThermalToggle = document.getElementById('optical-thermal-toggle');
if (opticalThermalToggle) {
    opticalThermalToggle.addEventListener('click', () => {
        setThermal(!thermalOn);
        // Sync button text
        opticalThermalToggle.textContent = thermalOn ? 'Thermal: ON' : 'Thermal: OFF';
        const opticalThermalToggleMain = document.getElementById('optical-thermal-toggle-main');
        if (opticalThermalToggleMain) opticalThermalToggleMain.textContent = thermalOn ? 'Thermal: ON' : 'Thermal: OFF';
    });
}

// Connect optical cameras view thermal toggle
const opticalThermalToggleMain = document.getElementById('optical-thermal-toggle-main');
if (opticalThermalToggleMain) {
    opticalThermalToggleMain.addEventListener('click', () => {
        setThermal(!thermalOn);
        // Sync button text
        opticalThermalToggleMain.textContent = thermalOn ? 'Thermal: ON' : 'Thermal: OFF';
        if (opticalThermalToggle) opticalThermalToggle.textContent = thermalOn ? 'Thermal: ON' : 'Thermal: OFF';
    });
}

// Sync optical panel video streams with main streams
function syncOpticalStreams() {
    const opticalVideoStream = document.getElementById('optical-video-stream');
    const opticalThermalStream = document.getElementById('optical-thermal-stream');
    const opticalVideoPlaceholder = document.getElementById('optical-video-placeholder');
    const opticalThermalPlaceholder = document.getElementById('optical-thermal-placeholder');
    
    if (opticalVideoStream && videoImg) {
        opticalVideoStream.src = videoImg.src;
        if (opticalVideoPlaceholder) {
            opticalVideoPlaceholder.style.display = videoPlaceholder ? videoPlaceholder.style.display : 'none';
        }
    }
    
    if (opticalThermalStream) {
        const thermalImg = document.getElementById('thermal-stream');
        if (thermalImg) {
            opticalThermalStream.src = thermalImg.src;
        }
        if (opticalThermalPlaceholder) {
            const thermalPlaceholder = document.getElementById('thermal-placeholder');
            if (thermalPlaceholder) {
                opticalThermalPlaceholder.style.display = thermalPlaceholder.style.display;
            }
        }
    }
    
    // Sync AI analysis comments
    const rgbAiText = document.getElementById('rgb-ai');
    const thermalAiText = document.getElementById('thermal-ai');
    const opticalRgbAiText = document.getElementById('optical-rgb-ai-text');
    const opticalThermalAiText = document.getElementById('optical-thermal-ai-text');
    
    if (rgbAiText && opticalRgbAiText) {
        const aiComment = rgbAiText.textContent.trim();
        if (aiComment) {
            opticalRgbAiText.textContent = aiComment;
            opticalRgbAiText.style.color = '#00ffc8';
        } else {
            opticalRgbAiText.textContent = 'No detections';
            opticalRgbAiText.style.color = 'rgba(234, 242, 255, 0.5)';
        }
    }
    
    if (thermalAiText && opticalThermalAiText) {
        const aiComment = thermalAiText.textContent.trim();
        if (aiComment) {
            opticalThermalAiText.textContent = aiComment;
            opticalThermalAiText.style.color = '#00ffc8';
        } else {
            opticalThermalAiText.textContent = 'No detections';
            opticalThermalAiText.style.color = 'rgba(234, 242, 255, 0.5)';
        }
    }
}

// Update optical streams periodically
setInterval(syncOpticalStreams, 100);

// Optical Settings Panel - Parameter Controls
const rgbBrightness = document.getElementById('rgb-brightness');
const rgbContrast = document.getElementById('rgb-contrast');
const rgbSaturation = document.getElementById('rgb-saturation');
const aiConfidenceThreshold = document.getElementById('ai-confidence-threshold');

if (rgbBrightness) {
    const brightnessVal = document.getElementById('rgb-brightness-val');
    rgbBrightness.addEventListener('input', (e) => {
        const val = e.target.value;
        if (brightnessVal) brightnessVal.textContent = val + '%';
        // Apply brightness to video stream
        const videoStream = document.getElementById('optical-video-stream');
        if (videoStream) videoStream.style.filter = `brightness(${val}%) contrast(${rgbContrast?.value || 50}%) saturate(${rgbSaturation?.value || 50}%)`;
    });
}

if (rgbContrast) {
    const contrastVal = document.getElementById('rgb-contrast-val');
    rgbContrast.addEventListener('input', (e) => {
        const val = e.target.value;
        if (contrastVal) contrastVal.textContent = val + '%';
        const videoStream = document.getElementById('optical-video-stream');
        if (videoStream) videoStream.style.filter = `brightness(${rgbBrightness?.value || 50}%) contrast(${val}%) saturate(${rgbSaturation?.value || 50}%)`;
    });
}

if (rgbSaturation) {
    const saturationVal = document.getElementById('rgb-saturation-val');
    rgbSaturation.addEventListener('input', (e) => {
        const val = e.target.value;
        if (saturationVal) saturationVal.textContent = val + '%';
        const videoStream = document.getElementById('optical-video-stream');
        if (videoStream) videoStream.style.filter = `brightness(${rgbBrightness?.value || 50}%) contrast(${rgbContrast?.value || 50}%) saturate(${val}%)`;
    });
}

if (aiConfidenceThreshold) {
    const thresholdVal = document.getElementById('ai-confidence-threshold-val');
    aiConfidenceThreshold.addEventListener('input', (e) => {
        const val = e.target.value;
        if (thresholdVal) thresholdVal.textContent = val + '%';
        // Store threshold for AI detection filtering
        window.aiConfidenceThreshold = val / 100;
    });
}

// ── Map ON/OFF ──
const mapToggleBtn = document.getElementById('map-toggle');
const mapCanvas = document.getElementById('map');
let mapVisible = true;

function setMapVisible(on){
    mapVisible = !!on;
    if (mapCanvas) mapCanvas.style.display = mapVisible ? '' : 'none';
    if (mapToggleBtn) {
        mapToggleBtn.textContent = mapVisible ? 'Map: ON' : 'Map: OFF';
        mapToggleBtn.className = mapVisible ? 'ctrl-btn btn-primary' : 'ctrl-btn btn-ghost';
    }
    if (mapVisible && map) {
        setTimeout(()=>{ try { map.invalidateSize(); } catch(e){} }, 100);
    }
}

if (mapToggleBtn) mapToggleBtn.addEventListener('click', ()=> setMapVisible(!mapVisible));

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
    // WebSocket connects lazily when user sends a command (to avoid backend circular demo telemetry)
    // Demo does NOT auto-start — user must define a trajectory then click START FLIGHT
    setVideo(false);
    setThermal(false);
    // Ensure route controls initial state
    updateRouteControls();
    
    // Initialize navigation
    const navDashboard = document.getElementById('nav-dashboard');
    const navMissions = document.getElementById('nav-missions');
    const navSystems = document.getElementById('nav-systems');
    const navOptical = document.getElementById('nav-optical');
    const navPid = document.getElementById('nav-pid');
    const navHeatmap = document.getElementById('nav-heatmap');
    const navSettings = document.getElementById('nav-settings');
    
    // Get panels from hidden dashboard-grid
    const telemetryPanel = document.querySelector('.telemetry-panel');
    const powerPanel = document.querySelector('.power-panel');
    const rightColumn = document.querySelector('.right-column');
    const camsArea = document.querySelector('.cams-area');
    
    function setActiveNav(activeEl) {
        [navDashboard, navMissions, navSystems, navOptical, navPid, navHeatmap, navSettings].forEach(el => {
            if (el) {
                el.classList.remove('nav-active');
            }
        });
        if (activeEl) activeEl.classList.add('nav-active');
        
        // Show/hide content based on navigation
        if (activeEl === navDashboard) {
            // Dashboard: show system overview, map, cameras, and speed control panel
            const dashboardCams = document.querySelector('.dashboard-cams');
            const speedControlPanel = document.getElementById('speed-control-panel');
            const missionsPanel = document.getElementById('missions-panel');
            const systemsPanel = document.getElementById('systems-panel');
            const opticalPanel = document.getElementById('optical-panel');
            const opticalCamerasView = document.getElementById('optical-cameras-view');
            const mainContent = document.querySelector('.main-content');
            const mapContainer = document.querySelector('.map-container');
            
            // Show speed control panel
            if (speedControlPanel) {
                speedControlPanel.style.display = 'flex';
                console.log('Speed control panel shown');
            }
            
            // Hide other panels
            if (missionsPanel) missionsPanel.style.display = 'none';
            if (systemsPanel) systemsPanel.style.display = 'none';
            if (opticalPanel) opticalPanel.style.display = 'none';
            if (opticalCamerasView) opticalCamerasView.style.display = 'none';
            const pidPanel = document.getElementById('pid-panel');
            if (pidPanel) pidPanel.style.display = 'none';
            const settingsPanel = document.getElementById('settings-panel');
            if (settingsPanel) settingsPanel.style.display = 'none';
            const heatmapPanel = document.getElementById('heatmap-panel');
            if (heatmapPanel) heatmapPanel.style.display = 'none';
            
            if (mainContent) {
                mainContent.style.display = 'flex';
                mainContent.classList.remove('missions-view');
            }
            if (dashboardCams) dashboardCams.style.display = 'grid';
            if (mapContainer) {
                mapContainer.style.display = 'block';
                mapContainer.style.flex = '0 0 35%';
            }
            if (rightColumn) rightColumn.style.display = 'flex';
        } else if (activeEl === navMissions) {
            // Missions: show missions panel and map
            const speedControlPanel = document.getElementById('speed-control-panel');
            const missionsPanel = document.getElementById('missions-panel');
            const systemsPanel = document.getElementById('systems-panel');
            const opticalPanel = document.getElementById('optical-panel');
            const mainContent = document.querySelector('.main-content');
            const mapContainer = document.querySelector('.map-container');
            
            // Hide other panels
            if (speedControlPanel) speedControlPanel.style.display = 'none';
            if (systemsPanel) systemsPanel.style.display = 'none';
            if (opticalPanel) opticalPanel.style.display = 'none';
            const pidPanel = document.getElementById('pid-panel');
            if (pidPanel) pidPanel.style.display = 'none';
            const settingsPanelMissions = document.getElementById('settings-panel');
            if (settingsPanelMissions) settingsPanelMissions.style.display = 'none';
            const heatmapPanelMissions = document.getElementById('heatmap-panel');
            if (heatmapPanelMissions) heatmapPanelMissions.style.display = 'none';
            
            // Show missions panel
            if (missionsPanel) {
                missionsPanel.style.display = 'flex';
                console.log('Missions panel shown');
            }
            
            // Show main content with map
            if (mainContent) {
                mainContent.style.display = 'flex';
                mainContent.classList.add('missions-view');
                // Hide all cameras, show only map
                const dashboardCams = document.querySelector('.dashboard-cams');
                const camsArea = document.querySelector('.cams-area');
                const opticalCamerasView = document.getElementById('optical-cameras-view');
                if (dashboardCams) dashboardCams.style.display = 'none';
                if (camsArea) camsArea.style.display = 'none';
                if (opticalCamerasView) opticalCamerasView.style.display = 'none';
                // Show map container
                if (mapContainer) {
                    mapContainer.style.display = 'block';
                    mapContainer.style.flex = '1';
                }
            }
            
            // Enable waypoints by default
            if (waypointsToggleBtn && !waypointsEnabled) {
                waypointsEnabled = true;
                if (window.Toggles) window.Toggles.setState(waypointsToggleBtn, true);
                const sendRouteBtn = document.getElementById('send-route-btn');
                const clearRouteBtn = document.getElementById('clear-route-btn');
                const saveMissionBtn = document.getElementById('save-mission-btn');
                const loadMissionBtn = document.getElementById('load-mission-btn');
                if (sendRouteBtn) sendRouteBtn.style.display = 'inline-block';
                if (clearRouteBtn) clearRouteBtn.style.display = 'inline-block';
                if (saveMissionBtn) saveMissionBtn.style.display = 'inline-block';
                if (loadMissionBtn) loadMissionBtn.style.display = 'inline-block';
            }
            
            // Ensure map is visible and resized
            if (map) {
                setTimeout(() => {
                    try {
                        map.invalidateSize();
                    } catch(e) {
                        console.warn('Map resize error:', e);
                    }
                }, 100);
            }
        } else if (activeEl === navSystems) {
            // Systems: show systems panel
            const speedControlPanel = document.getElementById('speed-control-panel');
            const missionsPanel = document.getElementById('missions-panel');
            const systemsPanel = document.getElementById('systems-panel');
            const opticalPanel = document.getElementById('optical-panel');
            const mainContent = document.querySelector('.main-content');
            const dashboardCams = document.querySelector('.dashboard-cams');
            
            if (speedControlPanel) speedControlPanel.style.display = 'none';
            if (missionsPanel) missionsPanel.style.display = 'none';
            if (systemsPanel) {
                systemsPanel.style.display = 'flex';
                console.log('Systems panel shown');
            }
            if (opticalPanel) opticalPanel.style.display = 'none';
            const pidPanelSystems = document.getElementById('pid-panel');
            if (pidPanelSystems) pidPanelSystems.style.display = 'none';
            const settingsPanelSystems = document.getElementById('settings-panel');
            if (settingsPanelSystems) settingsPanelSystems.style.display = 'none';
            const heatmapPanelSystems = document.getElementById('heatmap-panel');
            if (heatmapPanelSystems) heatmapPanelSystems.style.display = 'none';
            // Hide main content
            if (mainContent) mainContent.style.display = 'none';
            if (dashboardCams) dashboardCams.style.display = 'none';
        } else if (activeEl === navOptical) {
            // Optical: show optical settings panel and cameras view (NO PID panel)
            const speedControlPanel = document.getElementById('speed-control-panel');
            const missionsPanel = document.getElementById('missions-panel');
            const systemsPanel = document.getElementById('systems-panel');
            const opticalPanel = document.getElementById('optical-panel');
            const opticalCamerasView = document.getElementById('optical-cameras-view');
            const pidPanel = document.getElementById('pid-panel');
            const settingsPanel = document.getElementById('settings-panel');
            const mainContent = document.querySelector('.main-content');
            const dashboardCams = document.querySelector('.dashboard-cams');
            
            if (speedControlPanel) speedControlPanel.style.display = 'none';
            if (missionsPanel) missionsPanel.style.display = 'none';
            if (systemsPanel) systemsPanel.style.display = 'none';
            // Hide PID panel in Optical view
            if (pidPanel) pidPanel.style.display = 'none';
            // Hide Settings panel in Optical view
            if (settingsPanel) settingsPanel.style.display = 'none';
            const heatmapPanelOptical = document.getElementById('heatmap-panel');
            if (heatmapPanelOptical) heatmapPanelOptical.style.display = 'none';
            if (opticalPanel) {
                opticalPanel.style.display = 'flex';
                console.log('Optical settings panel shown');
            }
            if (opticalCamerasView) {
                opticalCamerasView.style.display = 'flex';
                console.log('Optical cameras view shown');
            }
            // Hide main content
            if (mainContent) mainContent.style.display = 'none';
            if (dashboardCams) dashboardCams.style.display = 'none';
            // Auto-enable cameras
            if (!videoOn) setVideo(true);
            if (!thermalOn) setThermal(true);
        } else if (activeEl === navPid) {
            // PID Settings: show PID settings panel
            const speedControlPanel = document.getElementById('speed-control-panel');
            const missionsPanel = document.getElementById('missions-panel');
            const systemsPanel = document.getElementById('systems-panel');
            const opticalPanel = document.getElementById('optical-panel');
            const opticalCamerasView = document.getElementById('optical-cameras-view');
            const pidPanel = document.getElementById('pid-panel');
            const settingsPanel = document.getElementById('settings-panel');
            const mainContent = document.querySelector('.main-content');
            const dashboardCams = document.querySelector('.dashboard-cams');
            const mainLayout = document.querySelector('.main-layout');
            
            if (speedControlPanel) speedControlPanel.style.display = 'none';
            if (missionsPanel) missionsPanel.style.display = 'none';
            if (systemsPanel) systemsPanel.style.display = 'none';
            if (opticalPanel) opticalPanel.style.display = 'none';
            if (opticalCamerasView) opticalCamerasView.style.display = 'none';
            // Hide Settings panel in PID view
            if (settingsPanel) settingsPanel.style.display = 'none';
            const heatmapPanelPid = document.getElementById('heatmap-panel');
            if (heatmapPanelPid) heatmapPanelPid.style.display = 'none';
            // Hide main content
            if (mainContent) mainContent.style.display = 'none';
            if (dashboardCams) dashboardCams.style.display = 'none';
            
            // Show PID panel
            if (pidPanel) {
                pidPanel.style.display = 'flex';
                console.log('PID settings panel shown');
                // Force display of default values immediately, then load from API
                ensurePidValuesVisible();
                // Load PID values from API (with small delay to ensure DOM is ready)
                setTimeout(() => {
                    loadPidSettings();
                }, 200);
            }
        } else if (activeEl === navHeatmap) {
            // Heatmap: show heatmap panel with map
            const speedControlPanel = document.getElementById('speed-control-panel');
            const missionsPanel = document.getElementById('missions-panel');
            const systemsPanel = document.getElementById('systems-panel');
            const opticalPanel = document.getElementById('optical-panel');
            const opticalCamerasView = document.getElementById('optical-cameras-view');
            const pidPanel = document.getElementById('pid-panel');
            const settingsPanel = document.getElementById('settings-panel');
            const heatmapPanel = document.getElementById('heatmap-panel');
            const mainContent = document.querySelector('.main-content');
            const dashboardCams = document.querySelector('.dashboard-cams');
            
            if (speedControlPanel) speedControlPanel.style.display = 'none';
            if (missionsPanel) missionsPanel.style.display = 'none';
            if (systemsPanel) systemsPanel.style.display = 'none';
            if (opticalPanel) opticalPanel.style.display = 'none';
            if (opticalCamerasView) opticalCamerasView.style.display = 'none';
            if (pidPanel) pidPanel.style.display = 'none';
            if (settingsPanel) settingsPanel.style.display = 'none';
            // Hide main content
            if (mainContent) mainContent.style.display = 'none';
            if (dashboardCams) dashboardCams.style.display = 'none';
            
            // Show heatmap panel
            if (heatmapPanel) {
                heatmapPanel.style.display = 'flex';
                console.log('Heatmap panel shown');
                // Ensure it's in the main layout
                const mainLayout = document.querySelector('.main-layout');
                if (mainLayout && !mainLayout.contains(heatmapPanel)) {
                    mainLayout.appendChild(heatmapPanel);
                }
                // Initialize heatmap map if not already initialized
                setTimeout(() => {
                    initHeatmapMap();
                }, 100);
            }
        } else if (activeEl === navSettings) {
            // Settings: show settings panel
            const speedControlPanel = document.getElementById('speed-control-panel');
            const missionsPanel = document.getElementById('missions-panel');
            const systemsPanel = document.getElementById('systems-panel');
            const opticalPanel = document.getElementById('optical-panel');
            const opticalCamerasView = document.getElementById('optical-cameras-view');
            const pidPanel = document.getElementById('pid-panel');
            const settingsPanel = document.getElementById('settings-panel');
            const mainContent = document.querySelector('.main-content');
            const dashboardCams = document.querySelector('.dashboard-cams');
            
            if (speedControlPanel) speedControlPanel.style.display = 'none';
            if (missionsPanel) missionsPanel.style.display = 'none';
            if (systemsPanel) systemsPanel.style.display = 'none';
            if (opticalPanel) opticalPanel.style.display = 'none';
            if (opticalCamerasView) opticalCamerasView.style.display = 'none';
            if (pidPanel) pidPanel.style.display = 'none';
            const heatmapPanelSettings = document.getElementById('heatmap-panel');
            if (heatmapPanelSettings) heatmapPanelSettings.style.display = 'none';
            if (settingsPanel) {
                settingsPanel.style.display = 'flex';
                console.log('Settings panel shown');
            }
            // Hide main content
            if (mainContent) mainContent.style.display = 'none';
            if (dashboardCams) dashboardCams.style.display = 'none';
        }
    }
    
    if (navDashboard) {
        navDashboard.addEventListener('click', () => {
            console.log('Dashboard clicked');
            setActiveNav(navDashboard);
        });
    }
    if (navMissions) {
        navMissions.addEventListener('click', () => {
            console.log('Missions clicked');
            setActiveNav(navMissions);
        });
    }
    if (navSystems) {
        navSystems.addEventListener('click', () => {
            console.log('Systems clicked');
            setActiveNav(navSystems);
        });
    }
    if (navOptical) {
        navOptical.addEventListener('click', () => {
            console.log('Optical clicked');
            setActiveNav(navOptical);
        });
    }
    if (navPid) {
        navPid.addEventListener('click', () => {
            console.log('PID Settings clicked');
            setActiveNav(navPid);
        });
    }
    if (navHeatmap) {
        navHeatmap.addEventListener('click', () => {
            console.log('Heatmap clicked');
            setActiveNav(navHeatmap);
        });
    }
    if (navSettings) {
        navSettings.addEventListener('click', () => {
            console.log('Settings clicked');
            setActiveNav(navSettings);
        });
    }
    
    // Wire up speed control in sidebar
    const speedControlSidebar = document.getElementById('speed-control-sidebar');
    const speedValueDisplay = document.getElementById('speed-value-display');
    if (speedControlSidebar && speedValueDisplay) {
        speedControlSidebar.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            speedValueDisplay.textContent = val.toFixed(1);
            // Also update the main speed control if it exists
            const mainSpeedControl = document.getElementById('speed-control');
            if (mainSpeedControl) {
                mainSpeedControl.value = val;
                const setSpeedValue = document.getElementById('set-speed-value');
                if (setSpeedValue) setSpeedValue.textContent = val.toFixed(1);
            }
            // Send via WebSocket
            if (ws && ws.readyState === WebSocket.OPEN) {
                try { ws.send(JSON.stringify({cmd:'set_speed', value: val})); } catch(e) { console.warn('WS send failed', e); }
            }
        });
    }
    
    // Sync main speed control with sidebar
    const mainSpeedControl = document.getElementById('speed-control');
    if (mainSpeedControl && speedControlSidebar) {
        mainSpeedControl.addEventListener('input', (e) => {
            speedControlSidebar.value = e.target.value;
            if (speedValueDisplay) speedValueDisplay.textContent = parseFloat(e.target.value).toFixed(1);
        });
    }

    // ensure leaflet map is correctly sized after layout changes
    setTimeout(()=>{ try { if (map && typeof map.invalidateSize === 'function') map.invalidateSize(); } catch(e){} }, 250);
    
    // Heatmap panel controls
    const heatmapClearBtn = document.getElementById('heatmap-clear-btn');
    
    if (heatmapClearBtn) {
        heatmapClearBtn.addEventListener('click', () => {
            clearHeatmapPoints();
        });
    }
    
    const heatmapClearHistoryBtn = document.getElementById('heatmap-clear-history-btn');
    if (heatmapClearHistoryBtn) {
        heatmapClearHistoryBtn.addEventListener('click', () => {
            clearHeatmapHistory();
        });
    }
    
    // Menu toggle button
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    if (menuToggleBtn) {
        menuToggleBtn.addEventListener('click', () => {
            const sidebar = document.querySelector('.left-sidebar');
            if (!sidebar) return;
            
            const isHidden = sidebar.classList.contains('hidden');
            if (isHidden) {
                sidebar.classList.remove('hidden');
                menuToggleBtn.classList.remove('active');
            } else {
                sidebar.classList.add('hidden');
                menuToggleBtn.classList.add('active');
            }
            
            // Invalidate map size after sidebar toggle
            setTimeout(() => {
                try {
                    if (map && typeof map.invalidateSize === 'function') map.invalidateSize();
                    if (heatmapMap && typeof heatmapMap.invalidateSize === 'function') heatmapMap.invalidateSize();
                } catch(e) {}
            }, 300);
        });
    }
});

// Simulation state with smoothing helper (must be declared before use)
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
    compassOK: true,
    battLowThreshold: 10.8,
    motorMaxTemp: 85
};

// Settings & Sidebar wiring (Dashboard / Systèmes / Caméra)
(function(){
    // default thresholds (already set in simState declaration above)
    if (typeof simState.battLowThreshold === 'undefined') simState.battLowThreshold = 10.8;
    if (typeof simState.motorMaxTemp === 'undefined') simState.motorMaxTemp = 85;

    const navDashboard = document.getElementById('nav-dashboard');
    const navSystems = document.getElementById('nav-systems');
    const navCamera = document.getElementById('nav-camera');

    function clearNavActive(){ [navDashboard, navSystems, navCamera].forEach(n=>{ if(n){ n.classList.remove('nav-active'); n.setAttribute('aria-pressed','false'); }}); }
    function activateNav(el){ if(!el) return; clearNavActive(); el.classList.add('nav-active'); el.setAttribute('aria-pressed','true'); }

    function showDashboard(){ activateNav(navDashboard); const telemetry = document.querySelector('.telemetry-panel'); if (telemetry) telemetry.style.display = 'flex'; if (powerPanel) powerPanel.style.display = 'none'; const right = document.querySelector('.right-column'); if (right) right.style.display = 'flex'; }
    function showSystems(){ activateNav(navSystems); // show power panel and settings
        const telemetry = document.querySelector('.telemetry-panel'); if (telemetry) telemetry.style.display = 'none'; if (powerPanel) powerPanel.style.display = 'flex'; const settings = document.getElementById('system-settings'); if (settings) settings.style.display = 'block'; if (typeof powerPanel.scrollIntoView === 'function') powerPanel.scrollIntoView({behavior:'smooth'});
    }
    function showCamera(){ activateNav(navCamera); const telemetry = document.querySelector('.telemetry-panel'); if (telemetry) telemetry.style.display = 'flex'; if (powerPanel) powerPanel.style.display = 'none'; // ensure both camera feeds on
        if (!videoOn) setVideo(true); if (!thermalOn) setThermal(true); const cams = document.querySelector('.cams-area'); if (cams) cams.scrollIntoView({behavior:'smooth'});
    }

    if (navDashboard) navDashboard.addEventListener('click', showDashboard);
    if (navSystems) navSystems.addEventListener('click', showSystems);
    if (navCamera) navCamera.addEventListener('click', showCamera);
    // keyboard accessibility
    [navDashboard,navSystems,navCamera].forEach(el=>{ if(!el) return; el.addEventListener('keydown', (ev)=>{ if(ev.key==='Enter' || ev.key===' ') { ev.preventDefault(); el.click(); }}); });

    // Settings controls
    const battLowInput = document.getElementById('setting-batt-low');
    const battLowVal = document.getElementById('setting-batt-low-val');
    const motorMaxInput = document.getElementById('setting-motor-max-temp');
    const motorMaxVal = document.getElementById('setting-motor-max-temp-val');
    const applyBtn = document.getElementById('apply-settings-btn');

    if (battLowInput && battLowVal){ battLowVal.textContent = battLowInput.value + ' V'; battLowInput.addEventListener('input', (e)=> battLowVal.textContent = e.target.value + ' V'); }
    if (motorMaxInput && motorMaxVal){ motorMaxVal.textContent = motorMaxInput.value + '°C'; motorMaxInput.addEventListener('input', (e)=> motorMaxVal.textContent = e.target.value + '°C'); }
    if (applyBtn){ applyBtn.addEventListener('click', ()=>{
        if (battLowInput) simState.battLowThreshold = parseFloat(battLowInput.value);
        if (motorMaxInput) simState.motorMaxTemp = parseFloat(motorMaxInput.value);
        showToast('Settings applied', 'success');
        renderPowerPanel();
    }); }

    // start on dashboard
    try { showDashboard(); } catch(e){}
})();

// keep map layout consistent on window resize
window.addEventListener('resize', ()=>{ try { if (map && typeof map.invalidateSize === 'function') map.invalidateSize(); } catch(e){} try{ if (videoOn) simulateRGBDetections(); if (thermalOn) simulateThermalDetections(); } catch(e){} });


// ============================================================================
// Power & Motors Panel: Tabs, visibility and simulated data (UI-only)
// ============================================================================

const tabTelemetry = document.getElementById('tab-telemetry');
const tabPower = document.getElementById('tab-power');
const tabPid = document.getElementById('tab-pid');
const powerPanel = document.querySelector('.power-panel');

function showTelemetryPanel() {
    const telemetry = document.querySelector('.telemetry-panel');
    if (telemetry) telemetry.style.display = 'flex';
    if (powerPanel) powerPanel.style.display = 'none';
    // show telemetry main, hide pid panel
    const pidPanel = document.getElementById('pid-panel'); if (pidPanel) pidPanel.style.display = 'none';
    if (tabTelemetry) { tabTelemetry.classList.add('active'); tabTelemetry.setAttribute('aria-selected','true'); }
    if (tabPower) { tabPower.classList.remove('active'); tabPower.setAttribute('aria-selected','false'); }
    if (tabPid) { tabPid.classList.remove('active'); tabPid.setAttribute('aria-selected','false'); }
}

function showPowerPanel() {
    const telemetry = document.querySelector('.telemetry-panel');
    if (telemetry) telemetry.style.display = 'none';
    if (powerPanel) powerPanel.style.display = 'flex';
    if (tabTelemetry) { tabTelemetry.classList.remove('active'); tabTelemetry.setAttribute('aria-selected','false'); }
    if (tabPower) { tabPower.classList.add('active'); tabPower.setAttribute('aria-selected','true'); }
    if (tabPid) { tabPid.classList.remove('active'); tabPid.setAttribute('aria-selected','false'); }
}

function showPidPanel() {
    console.log('showPidPanel() called');
    const telemetry = document.querySelector('.telemetry-panel');
    if (telemetry) telemetry.style.display = 'flex';
    if (powerPanel) powerPanel.style.display = 'none';
    const pidPanel = document.getElementById('pid-panel'); if (pidPanel) pidPanel.style.display = 'flex';
    if (tabTelemetry) { tabTelemetry.classList.remove('active'); tabTelemetry.setAttribute('aria-selected','false'); }
    if (tabPower) { tabPower.classList.remove('active'); tabPower.setAttribute('aria-selected','false'); }
    if (tabPid) { tabPid.classList.add('active'); tabPid.setAttribute('aria-selected','true'); }
    fetchPidGains();
}

if (tabTelemetry) tabTelemetry.addEventListener('click', showTelemetryPanel);
if (tabPower) tabPower.addEventListener('click', showPowerPanel);
if (tabPid) tabPid.addEventListener('click', showPidPanel);


// PID panel helpers
async function fetchPidGains() {
    console.log('fetchPidGains()');
    try {
        const res = await fetch(API_BASE + '/api/pid');
        if (!res.ok) throw new Error('Failed to fetch PID gains');
        const data = await res.json();
        console.log('PID gains received', data);
        const axis = document.getElementById('pid-axis');
        const kp = document.getElementById('pid-kp');
        const ki = document.getElementById('pid-ki');
        const kd = document.getElementById('pid-kd');
        if (axis && kp && ki && kd) {
            const a = axis.value || 'pitch';
            const gains = data[a] || { kp:1, ki:0, kd:0 };
            kp.value = gains.kp;
            ki.value = gains.ki;
            kd.value = gains.kd;
        }
    } catch (err) {
        console.warn('fetchPidGains error', err);
    }
}

// Fetch PID gains on initial load so fields are populated even if user doesn't click the tab
try { fetchPidGains(); } catch(e) { console.warn('initial fetchPidGains failed', e); }

async function applyPidUpdate() {
    const axis = document.getElementById('pid-axis').value;
    const kp = parseFloat(document.getElementById('pid-kp').value || 0);
    const ki = parseFloat(document.getElementById('pid-ki').value || 0);
    const kd = parseFloat(document.getElementById('pid-kd').value || 0);
    try {
        const res = await fetch(API_BASE + '/api/pid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ axis, kp, ki, kd })
        });
        if (!res.ok) {
            const txt = await res.text();
            throw new Error(txt || 'PID update failed');
        }
        const j = await res.json();
        showToast(`PID ${axis} updated (${j.sent_to_mcu ? 'sent to MCU' : 'local only'})`, 'success');
    } catch (err) {
        console.error('applyPidUpdate error', err);
        showToast('PID update failed', 'error');
    }
}

// wire up buttons
const pidApplyBtn = document.getElementById('pid-apply');
const pidRefreshBtn = document.getElementById('pid-refresh');
if (pidApplyBtn) pidApplyBtn.addEventListener('click', applyPidUpdate);
if (pidRefreshBtn) pidRefreshBtn.addEventListener('click', fetchPidGains);

// Ensure PID values are visible (set defaults immediately)
function ensurePidValuesVisible() {
    const rollP = document.getElementById('pid-roll-p');
    const rollI = document.getElementById('pid-roll-i');
    const rollD = document.getElementById('pid-roll-d');
    const pitchP = document.getElementById('pid-pitch-p');
    const pitchI = document.getElementById('pid-pitch-i');
    const pitchD = document.getElementById('pid-pitch-d');
    const yawP = document.getElementById('pid-yaw-p');
    const yawI = document.getElementById('pid-yaw-i');
    const yawD = document.getElementById('pid-yaw-d');
    const altP = document.getElementById('pid-alt-p');
    const altI = document.getElementById('pid-alt-i');
    const altD = document.getElementById('pid-alt-d');
    
    // Set default values immediately
    if (rollP && (!rollP.value || rollP.value === '')) rollP.value = 4.5;
    if (rollI && (!rollI.value || rollI.value === '')) rollI.value = 0.45;
    if (rollD && (!rollD.value || rollD.value === '')) rollD.value = 0.05;
    if (pitchP && (!pitchP.value || pitchP.value === '')) pitchP.value = 4.5;
    if (pitchI && (!pitchI.value || pitchI.value === '')) pitchI.value = 0.45;
    if (pitchD && (!pitchD.value || pitchD.value === '')) pitchD.value = 0.05;
    if (yawP && (!yawP.value || yawP.value === '')) yawP.value = 4.5;
    if (yawI && (!yawI.value || yawI.value === '')) yawI.value = 0.45;
    if (yawD && (!yawD.value || yawD.value === '')) yawD.value = 0.05;
    if (altP && (!altP.value || altP.value === '')) altP.value = 1.0;
    if (altI && (!altI.value || altI.value === '')) altI.value = 0.1;
    if (altD && (!altD.value || altD.value === '')) altD.value = 0.01;
}

// Load PID settings for the new PID panel
async function loadPidSettings() {
    console.log('Loading PID settings from API...');
    
    // Get all input elements first
    const rollP = document.getElementById('pid-roll-p');
    const rollI = document.getElementById('pid-roll-i');
    const rollD = document.getElementById('pid-roll-d');
    const pitchP = document.getElementById('pid-pitch-p');
    const pitchI = document.getElementById('pid-pitch-i');
    const pitchD = document.getElementById('pid-pitch-d');
    const yawP = document.getElementById('pid-yaw-p');
    const yawI = document.getElementById('pid-yaw-i');
    const yawD = document.getElementById('pid-yaw-d');
    const altP = document.getElementById('pid-alt-p');
    const altI = document.getElementById('pid-alt-i');
    const altD = document.getElementById('pid-alt-d');
    
    // Check if elements exist
    if (!rollP || !rollI || !rollD || !pitchP || !pitchI || !pitchD || !yawP || !yawI || !yawD || !altP || !altI || !altD) {
        console.warn('PID input elements not found, using default values');
        // Set default values if elements exist
        if (rollP) rollP.value = 4.5;
        if (rollI) rollI.value = 0.45;
        if (rollD) rollD.value = 0.05;
        if (pitchP) pitchP.value = 4.5;
        if (pitchI) pitchI.value = 0.45;
        if (pitchD) pitchD.value = 0.05;
        if (yawP) yawP.value = 4.5;
        if (yawI) yawI.value = 0.45;
        if (yawD) yawD.value = 0.05;
        if (altP) altP.value = 1.0;
        if (altI) altI.value = 0.1;
        if (altD) altD.value = 0.01;
        return;
    }
    
    try {
        const res = await fetch(API_BASE + '/api/pid');
        if (!res.ok) {
            throw new Error(`Failed to fetch PID gains: ${res.status}`);
        }
        const data = await res.json();
        console.log('PID gains received:', data);
        
        // Update Roll PID
        if (data.roll) {
            rollP.value = data.roll.kp !== undefined ? data.roll.kp : 4.5;
            rollI.value = data.roll.ki !== undefined ? data.roll.ki : 0.45;
            rollD.value = data.roll.kd !== undefined ? data.roll.kd : 0.05;
        } else {
            rollP.value = 4.5;
            rollI.value = 0.45;
            rollD.value = 0.05;
        }
        
        // Update Pitch PID
        if (data.pitch) {
            pitchP.value = data.pitch.kp !== undefined ? data.pitch.kp : 4.5;
            pitchI.value = data.pitch.ki !== undefined ? data.pitch.ki : 0.45;
            pitchD.value = data.pitch.kd !== undefined ? data.pitch.kd : 0.05;
        } else {
            pitchP.value = 4.5;
            pitchI.value = 0.45;
            pitchD.value = 0.05;
        }
        
        // Update Yaw PID
        if (data.yaw) {
            yawP.value = data.yaw.kp !== undefined ? data.yaw.kp : 4.5;
            yawI.value = data.yaw.ki !== undefined ? data.yaw.ki : 0.45;
            yawD.value = data.yaw.kd !== undefined ? data.yaw.kd : 0.05;
        } else {
            yawP.value = 4.5;
            yawI.value = 0.45;
            yawD.value = 0.05;
        }
        
        // Update Altitude PID
        if (data.altitude) {
            altP.value = data.altitude.kp !== undefined ? data.altitude.kp : 1.0;
            altI.value = data.altitude.ki !== undefined ? data.altitude.ki : 0.1;
            altD.value = data.altitude.kd !== undefined ? data.altitude.kd : 0.01;
        } else {
            altP.value = 1.0;
            altI.value = 0.1;
            altD.value = 0.01;
        }
        
        console.log('PID settings loaded successfully');
    } catch (err) {
        console.error('Error loading PID settings:', err);
        // Set default values on error
        rollP.value = 4.5;
        rollI.value = 0.45;
        rollD.value = 0.05;
        pitchP.value = 4.5;
        pitchI.value = 0.45;
        pitchD.value = 0.05;
        yawP.value = 4.5;
        yawI.value = 0.45;
        yawD.value = 0.05;
        altP.value = 1.0;
        altI.value = 0.1;
        altD.value = 0.01;
        console.log('Using default PID values due to API error');
    }
}

// Save PID settings
async function savePidSettings() {
    console.log('Saving PID settings...');
    try {
        const updates = [];
        
        // Roll
        const rollP = document.getElementById('pid-roll-p');
        const rollI = document.getElementById('pid-roll-i');
        const rollD = document.getElementById('pid-roll-d');
        if (rollP && rollI && rollD) {
            updates.push({
                axis: 'roll',
                kp: parseFloat(rollP.value) || 0,
                ki: parseFloat(rollI.value) || 0,
                kd: parseFloat(rollD.value) || 0
            });
        }
        
        // Pitch
        const pitchP = document.getElementById('pid-pitch-p');
        const pitchI = document.getElementById('pid-pitch-i');
        const pitchD = document.getElementById('pid-pitch-d');
        if (pitchP && pitchI && pitchD) {
            updates.push({
                axis: 'pitch',
                kp: parseFloat(pitchP.value) || 0,
                ki: parseFloat(pitchI.value) || 0,
                kd: parseFloat(pitchD.value) || 0
            });
        }
        
        // Yaw
        const yawP = document.getElementById('pid-yaw-p');
        const yawI = document.getElementById('pid-yaw-i');
        const yawD = document.getElementById('pid-yaw-d');
        if (yawP && yawI && yawD) {
            updates.push({
                axis: 'yaw',
                kp: parseFloat(yawP.value) || 0,
                ki: parseFloat(yawI.value) || 0,
                kd: parseFloat(yawD.value) || 0
            });
        }
        
        // Altitude
        const altP = document.getElementById('pid-alt-p');
        const altI = document.getElementById('pid-alt-i');
        const altD = document.getElementById('pid-alt-d');
        if (altP && altI && altD) {
            updates.push({
                axis: 'altitude',
                kp: parseFloat(altP.value) || 0,
                ki: parseFloat(altI.value) || 0,
                kd: parseFloat(altD.value) || 0
            });
        }
        
        // Send all updates
        let successCount = 0;
        for (const update of updates) {
            try {
                const res = await fetch(API_BASE + '/api/pid', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(update)
                });
                if (res.ok) {
                    successCount++;
                }
            } catch (e) {
                console.error(`Failed to update ${update.axis}:`, e);
            }
        }
        
        if (successCount === updates.length) {
            showToast('PID settings saved successfully', 'success');
        } else {
            showToast(`Saved ${successCount}/${updates.length} PID settings`, 'warning');
        }
    } catch (err) {
        console.error('Error saving PID settings:', err);
        showToast('Failed to save PID settings', 'error');
    }
}

// Reset PID settings to defaults
function resetPidSettings() {
    // Roll
    const rollP = document.getElementById('pid-roll-p');
    const rollI = document.getElementById('pid-roll-i');
    const rollD = document.getElementById('pid-roll-d');
    if (rollP && rollI && rollD) {
        rollP.value = 4.5;
        rollI.value = 0.45;
        rollD.value = 0.05;
    }
    
    // Pitch
    const pitchP = document.getElementById('pid-pitch-p');
    const pitchI = document.getElementById('pid-pitch-i');
    const pitchD = document.getElementById('pid-pitch-d');
    if (pitchP && pitchI && pitchD) {
        pitchP.value = 4.5;
        pitchI.value = 0.45;
        pitchD.value = 0.05;
    }
    
    // Yaw
    const yawP = document.getElementById('pid-yaw-p');
    const yawI = document.getElementById('pid-yaw-i');
    const yawD = document.getElementById('pid-yaw-d');
    if (yawP && yawI && yawD) {
        yawP.value = 4.5;
        yawI.value = 0.45;
        yawD.value = 0.05;
    }
    
    // Altitude
    const altP = document.getElementById('pid-alt-p');
    const altI = document.getElementById('pid-alt-i');
    const altD = document.getElementById('pid-alt-d');
    if (altP && altI && altD) {
        altP.value = 1.0;
        altI.value = 0.1;
        altD.value = 0.01;
    }
    
    showToast('PID settings reset to defaults', 'info');
}

// Wire up PID panel buttons
document.addEventListener('DOMContentLoaded', () => {
    const pidSaveBtn = document.getElementById('pid-save-btn');
    const pidResetBtn = document.getElementById('pid-reset-btn');
    
    if (pidSaveBtn) {
        pidSaveBtn.addEventListener('click', savePidSettings);
    }
    if (pidResetBtn) {
        pidResetBtn.addEventListener('click', resetPidSettings);
    }
});

/* 'Open PID' quick button removed (UI change) */

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
        const motorMax = typeof simState.motorMaxTemp === 'number' ? simState.motorMaxTemp : 85;
        const tmpClassTarget = (tmpVal > motorMax) ? 'status-critical' : (tmpVal > (motorMax - 15)) ? 'status-warn' : 'status-normal';
        const curClassTarget = (curVal > 8) ? 'status-critical' : (curVal > 5) ? 'status-warn' : 'status-normal';
        if (tmp) tmp.className = 'metric-val ' + tmpClassTarget;
        if (cur) cur.className = 'metric-val ' + curClassTarget;
        
        // Enhanced motor health monitoring
        const motorCard = document.getElementById('motor-card-' + (i+1));
        if (motorCard) {
            const healthScore = calculateMotorHealth(i);
            if (healthScore < 50) {
                motorCard.style.borderColor = 'rgba(255, 77, 77, 0.4)';
                motorCard.style.boxShadow = '0 0 12px rgba(255, 77, 77, 0.12)';
            } else if (healthScore < 75) {
                motorCard.style.borderColor = 'rgba(255, 179, 71, 0.4)';
                motorCard.style.boxShadow = '0 0 8px rgba(255, 179, 71, 0.08)';
            } else {
                motorCard.style.borderColor = 'rgba(0, 255, 136, 0.2)';
                motorCard.style.boxShadow = '0 0 6px rgba(0, 255, 136, 0.06)';
            }
        }
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
    const bvEl = document.getElementById('batt-voltage'); if (bvEl){ const v = simState.battVolt; const battLow = (typeof simState.battLowThreshold === 'number') ? simState.battLowThreshold : 10.8; const battWarn = battLow + 0.5; if (v < battLow) bvEl.className = 'metric-val status-critical'; else if (v < battWarn) bvEl.className = 'metric-val status-warn'; else bvEl.className = 'metric-val status-normal'; }
    
    // Enhanced system health summary
    updateSystemHealthSummary();
}

function calculateMotorHealth(motorIndex) {
    const temp = simState.motorTemp[motorIndex] || 30;
    const current = simState.motorCurrent[motorIndex] || 0;
    const voltage = simState.motorVoltage[motorIndex] || 12.6;
    const motorMax = typeof simState.motorMaxTemp === 'number' ? simState.motorMaxTemp : 85;
    
    let health = 100;
    // Temperature penalty
    if (temp > motorMax) health -= 40;
    else if (temp > (motorMax - 15)) health -= 20;
    else if (temp > (motorMax - 30)) health -= 10;
    
    // Current penalty
    if (current > 8) health -= 30;
    else if (current > 5) health -= 15;
    
    // Voltage penalty
    if (voltage < 10.5) health -= 25;
    else if (voltage < 11.5) health -= 10;
    
    return Math.max(0, Math.min(100, health));
}

function updateSystemHealthSummary() {
    // Calculate overall system health
    let totalHealth = 0;
    let count = 0;
    
    // Motor health
    for (let i = 0; i < 3; i++) {
        totalHealth += calculateMotorHealth(i);
        count++;
    }
    
    // Battery health
    const battHealth = calculateBatteryHealth();
    totalHealth += battHealth;
    count++;
    
    // Sensor health
    const sensorHealth = calculateSensorHealth();
    totalHealth += sensorHealth;
    count++;
    
    const overallHealth = Math.round(totalHealth / count);
    
    // Update power panel header if element exists
    const powerHeader = document.querySelector('.power-header .telemetry-title');
    if (powerHeader) {
        const healthColor = overallHealth >= 75 ? 'var(--good)' : overallHealth >= 50 ? '#ffb347' : 'var(--bad)';
        powerHeader.innerHTML = `POWER • MOTORS • SERVOS • SENSORS <span style="color:${healthColor};font-size:12px;margin-left:8px;">Health: ${overallHealth}%</span>`;
    }
}

function calculateBatteryHealth() {
    const volt = simState.battVolt || 12.6;
    const temp = simState.battTemp || 30;
    const battLow = (typeof simState.battLowThreshold === 'number') ? simState.battLowThreshold : 10.8;
    
    let health = 100;
    if (volt < battLow) health -= 50;
    else if (volt < (battLow + 0.5)) health -= 25;
    else if (volt < (battLow + 1.0)) health -= 10;
    
    if (temp > 65) health -= 30;
    else if (temp > 50) health -= 15;
    
    return Math.max(0, Math.min(100, health));
}

function calculateSensorHealth() {
    let health = 100;
    if (!simState.imuOK) health -= 25;
    if (!simState.gpsFix) health -= 25;
    if (!simState.compassOK) health -= 15;
    return Math.max(0, Math.min(100, health));
}

// Start simulation loop (UI-only)
let powerInterval = null;
function startPowerSimulation(){ if (powerInterval) return; powerInterval = setInterval(()=>{ updatePowerSim(); renderPowerPanel(); }, 700); }
function stopPowerSimulation(){ if (powerInterval){ clearInterval(powerInterval); powerInterval = null; } }

// start simulation when panel is visible (but keep running to keep states fresh)
startPowerSimulation();



// No auto-reconnect on visibility change — WebSocket connects lazily when needed

// ============================================================================
// AI DETECTION PANEL - Dashboard (under thermal camera)
// ============================================================================

// Simulated AI Detection Data
const aiDetectionData = {
    mode: 'Standby', // 'Human Search', 'Thermal Assist', 'Standby'
    confidence: 0,
    riskLevel: 'LOW', // 'LOW', 'MEDIUM', 'HIGH'
    lastDetection: null
};

// Detection modes configuration
const detectionModes = {
    'Human Search': {
        class: 'mode-human',
        color: '#00ff88'
    },
    'Thermal Assist': {
        class: 'mode-thermal',
        color: '#ff9f1a'
    },
    'Standby': {
        class: 'mode-standby',
        color: '#999'
    }
};

// Update AI Detection Panel
function updateAIDetectionPanelDashboard() {
    // Update Detection Mode
    const modeText = document.getElementById('ai-mode-text-dashboard');
    const modeBadge = document.getElementById('ai-mode-badge-dashboard');
    if (modeText && modeBadge) {
        modeText.textContent = aiDetectionData.mode;
        // Remove all mode classes
        Object.values(detectionModes).forEach(mode => {
            modeBadge.classList.remove(mode.class);
        });
        // Add current mode class
        const currentMode = detectionModes[aiDetectionData.mode];
        if (currentMode) {
            modeBadge.classList.add(currentMode.class);
        }
    }
    
    // Update Confidence
    const confValue = document.getElementById('ai-confidence-value-dashboard');
    const confFill = document.getElementById('ai-confidence-fill-dashboard');
    if (confValue && confFill) {
        const confidence = Math.round(aiDetectionData.confidence);
        confValue.textContent = `${confidence}%`;
        confFill.style.width = `${confidence}%`;
        
        // Update color based on confidence level
        confFill.classList.remove('low', 'medium', 'high');
        if (confidence < 40) {
            confFill.classList.add('low');
        } else if (confidence < 70) {
            confFill.classList.add('medium');
        } else {
            confFill.classList.add('high');
        }
    }
    
    // Update Risk Level
    const riskText = document.getElementById('ai-risk-text');
    const riskBadge = document.getElementById('ai-risk-badge');
    if (riskText && riskBadge) {
        riskText.textContent = aiDetectionData.riskLevel;
        // Remove all risk classes
        riskBadge.classList.remove('risk-low', 'risk-medium', 'risk-high');
        // Add current risk class
        riskBadge.classList.add(`risk-${aiDetectionData.riskLevel.toLowerCase()}`);
    }
    
    // Update Last Detection Timestamp
    const timestamp = document.getElementById('ai-timestamp-dashboard');
    if (timestamp) {
        if (aiDetectionData.lastDetection) {
            const date = new Date(aiDetectionData.lastDetection);
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            timestamp.textContent = `${hours}:${minutes}:${seconds}`;
        } else {
            timestamp.textContent = '--:--:--';
        }
    }
}

// Simulate AI Detection Updates
function simulateAIDetection() {
    // Randomly change mode (less frequent)
    if (Math.random() < 0.02) { // 2% chance per update
        const modes = Object.keys(detectionModes);
        aiDetectionData.mode = modes[Math.floor(Math.random() * modes.length)];
    }
    
    // Update confidence (simulate detection activity)
    if (aiDetectionData.mode !== 'Standby') {
        // Simulate confidence fluctuations
        const change = (Math.random() - 0.5) * 10; // -5 to +5
        aiDetectionData.confidence = Math.max(0, Math.min(100, aiDetectionData.confidence + change));
        
        // Occasionally trigger a detection
        if (Math.random() < 0.05 && aiDetectionData.confidence > 30) { // 5% chance if confidence > 30%
            aiDetectionData.lastDetection = Date.now();
            
            // Update risk level based on confidence
            if (aiDetectionData.confidence > 70) {
                aiDetectionData.riskLevel = 'HIGH';
            } else if (aiDetectionData.confidence > 40) {
                aiDetectionData.riskLevel = 'MEDIUM';
            } else {
                aiDetectionData.riskLevel = 'LOW';
            }
            
            // Trigger victim detection alert if confidence > 85%
            if (aiDetectionData.confidence > 85) {
                checkAlertConditions({ ai: { confidence: aiDetectionData.confidence } });
            }
            
            // Increment detection count if mission is active
            if (missionStartTime !== null) {
                missionDetectionCount++;
            }
        }
    } else {
        // In standby, gradually decrease confidence
        aiDetectionData.confidence = Math.max(0, aiDetectionData.confidence - 2);
        if (aiDetectionData.confidence === 0) {
            aiDetectionData.riskLevel = 'LOW';
        }
    }
    
    // Update the panel
    updateAIDetectionPanelDashboard();
}

// Initialize AI Detection Panel
function initAIDetectionPanel() {
    // Set initial values
    aiDetectionData.mode = 'Standby';
    aiDetectionData.confidence = 0;
    aiDetectionData.riskLevel = 'LOW';
    aiDetectionData.lastDetection = null;
    
    // Initial update
    updateAIDetectionPanelDashboard();
    
    // Start simulation loop (update every 500ms)
    setInterval(simulateAIDetection, 500);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAIDetectionPanel);
} else {
    initAIDetectionPanel();
}

// ============================================================================
// ENHANCED DASHBOARD FEATURES - Professional Mission Control Interface
// ============================================================================

// Global System Status Bar - Health Indicators
let systemHealth = {
    connection: 'offline',
    fc: 'unknown',
    gps: 'offline',
    battery: 'unknown'
};

function updateSystemHealth() {
    // Connection status
    const connDot = document.getElementById('health-connection-dot');
    const connLabel = document.getElementById('health-connection-label');
    if (connDot && connLabel) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            connDot.className = 'health-dot healthy';
            connLabel.textContent = 'CONNECTED';
            systemHealth.connection = 'healthy';
        } else if (ws && ws.readyState === WebSocket.CONNECTING) {
            connDot.className = 'health-dot warning';
            connLabel.textContent = 'CONNECTING';
            systemHealth.connection = 'warning';
        } else {
            connDot.className = 'health-dot offline';
            connLabel.textContent = 'OFFLINE';
            systemHealth.connection = 'offline';
        }
    }
    
    // GPS status
    const gpsDot = document.getElementById('health-gps-dot');
    if (gpsDot) {
        const gpsSats = parseInt(document.getElementById('speed-panel-gps')?.textContent || '0');
        if (gpsSats >= 6) {
            gpsDot.className = 'health-dot healthy';
            systemHealth.gps = 'healthy';
        } else if (gpsSats > 0) {
            gpsDot.className = 'health-dot warning';
            systemHealth.gps = 'warning';
        } else {
            gpsDot.className = 'health-dot offline';
            systemHealth.gps = 'offline';
        }
    }
    
    // Battery status
    const battDot = document.getElementById('health-battery-dot');
    const battLabel = document.getElementById('health-battery-label');
    if (battDot && battLabel) {
        const battText = document.getElementById('speed-panel-battery')?.textContent || '100%';
        const battPercent = parseInt(battText) || 100;
        if (battPercent > 50) {
            battDot.className = 'health-dot healthy';
            systemHealth.battery = 'healthy';
        } else if (battPercent > 20) {
            battDot.className = 'health-dot warning';
            systemHealth.battery = 'warning';
        } else {
            battDot.className = 'health-dot critical';
            systemHealth.battery = 'critical';
        }
        battLabel.textContent = `${battPercent}%`;
    }
    
    // FC status (simulated - would come from telemetry)
    const fcDot = document.getElementById('health-fc-dot');
    if (fcDot) {
        // Assume healthy if connected
        if (ws && ws.readyState === WebSocket.OPEN) {
            fcDot.className = 'health-dot healthy';
            systemHealth.fc = 'healthy';
        } else {
            fcDot.className = 'health-dot offline';
            systemHealth.fc = 'offline';
        }
    }
}

// Update health indicators every 2 seconds
setInterval(updateSystemHealth, 2000);
updateSystemHealth();

// Enhanced Drone Marker with Smooth Animation
let lastHeading = 0;
function updateDroneMarkerAnimation(lat, lon, heading) {
    if (!droneMarker) return;
    
    // Smooth heading interpolation
    let targetHeading = heading;
    let diff = targetHeading - lastHeading;
    
    // Handle wrap-around (e.g., 359 -> 1)
    if (Math.abs(diff) > 180) {
        if (diff > 0) diff -= 360;
        else diff += 360;
    }
    
    // Smooth interpolation
    lastHeading += diff * 0.2; // 20% per frame for smoothness
    if (Math.abs(diff) < 0.1) lastHeading = targetHeading;
    
    // Normalize heading
    while (lastHeading < 0) lastHeading += 360;
    while (lastHeading >= 360) lastHeading -= 360;
    
    // Update marker rotation with smooth transition
    const el = droneMarker.getElement();
    if (el) {
        const inner = el.querySelector('.drone-icon') || el.querySelector('img');
        if (inner) {
            inner.style.transition = 'transform 0.2s ease-out';
            inner.style.transform = `rotate(${lastHeading}deg)`;
        }
    }
}

// Mission Runtime Stats
let missionStartTime = null;
let missionStartLat = null;
let missionStartLon = null;
let missionPath = [];
let missionArea = 0;
let missionDetectionCount = 0; // Track number of detections
// distanceTraveled is already declared at top level (line 77)
let prevMissionLat = null;
let prevMissionLon = null;

function startMissionTimer() {
    missionStartTime = Date.now();
    missionStartLat = null;
    missionStartLon = null;
    missionPath = [];
    missionArea = 0;
    missionDetectionCount = 0;
    distanceTraveled = 0;
    prevMissionLat = null;
    prevMissionLon = null;
    updateMissionRuntime();
    updateMissionStatsCard();
    
    // Show mission stats card
    const statsCard = document.getElementById('mission-stats-card');
    if (statsCard) statsCard.style.display = 'block';
}

function stopMissionTimer() {
    missionStartTime = null;
    const statsEl = document.getElementById('mission-runtime-stats');
    if (statsEl) statsEl.style.display = 'none';
    
    // Hide mission stats card
    const statsCard = document.getElementById('mission-stats-card');
    if (statsCard) statsCard.style.display = 'none';
    
    // Reset values
    missionDetectionCount = 0;
    distanceTraveled = 0;
    prevMissionLat = null;
    prevMissionLon = null;
}

function updateMissionRuntime() {
    if (!missionStartTime) return;
    
    const statsEl = document.getElementById('mission-runtime-stats');
    if (!statsEl) return;
    
    statsEl.style.display = 'flex';
    
    // Update time
    const elapsed = Date.now() - missionStartTime;
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const timeEl = document.getElementById('runtime-time');
    if (timeEl) {
        timeEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    
    // Update distance
    const distEl = document.getElementById('runtime-distance');
    if (distEl) {
        const dist = (distanceTraveled / 1000).toFixed(2);
        distEl.textContent = `${dist} km`;
    }
    
    // Update area (simplified - would need proper polygon calculation)
    const areaEl = document.getElementById('runtime-area');
    if (areaEl && missionPath.length > 2) {
        // Simple approximation: bounding box area
        const lats = missionPath.map(p => p.lat);
        const lons = missionPath.map(p => p.lon);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);
        
        // Rough area calculation (not accurate for large distances)
        const area = ((maxLat - minLat) * 111) * ((maxLon - minLon) * 111 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180));
        areaEl.textContent = `${Math.abs(area).toFixed(2)} km²`;
    } else if (areaEl) {
        areaEl.textContent = '0.00 km²';
    }
}

// Update Mission Statistics Card
function updateMissionStatsCard() {
    if (!missionStartTime) return;
    
    const statsCard = document.getElementById('mission-stats-card');
    if (!statsCard) return;
    
    // Update timer
    const elapsed = Date.now() - missionStartTime;
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const timeEl = document.getElementById('mission-stat-time');
    if (timeEl) {
        timeEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    
    // Update distance (in km)
    const distEl = document.getElementById('mission-stat-distance');
    if (distEl) {
        const distKm = (distanceTraveled / 1000).toFixed(2);
        distEl.textContent = `${distKm} km`;
    }
    
    // Update area scanned (in m²)
    const areaEl = document.getElementById('mission-stat-area');
    if (areaEl) {
        let areaM2 = 0;
        if (missionPath.length > 2) {
            // Calculate area using bounding box approximation
            const lats = missionPath.map(p => p.lat);
            const lons = missionPath.map(p => p.lon);
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            const minLon = Math.min(...lons);
            const maxLon = Math.max(...lons);
            
            // Convert to meters (rough approximation)
            const latDist = (maxLat - minLat) * 111000; // 1 degree ≈ 111 km
            const lonDist = (maxLon - minLon) * 111000 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
            areaM2 = Math.abs(latDist * lonDist);
        }
        
        // Format with appropriate unit
        if (areaM2 >= 1000000) {
            areaEl.textContent = `${(areaM2 / 1000000).toFixed(2)} km²`;
        } else if (areaM2 >= 1000) {
            areaEl.textContent = `${(areaM2 / 1000).toFixed(1)} k m²`;
        } else {
            areaEl.textContent = `${Math.round(areaM2)} m²`;
        }
    }
    
    // Update detection count
    const detectionsEl = document.getElementById('mission-stat-detections');
    if (detectionsEl) {
        detectionsEl.textContent = missionDetectionCount.toString();
    }
}

// Update mission stats every second
setInterval(() => {
    updateMissionRuntime();
    updateMissionStatsCard();
}, 1000);

// Track mission path and calculate distance
function addMissionPathPoint(lat, lon) {
    if (!missionStartTime) return;
    if (missionStartLat === null) {
        missionStartLat = lat;
        missionStartLon = lon;
    }
    missionPath.push({ lat, lon });
    // Keep only last 1000 points
    if (missionPath.length > 1000) missionPath.shift();
    
    // Calculate distance traveled
    if (prevMissionLat !== null && prevMissionLon !== null) {
        const dist = calculateDistance(prevMissionLat, prevMissionLon, lat, lon);
        distanceTraveled += dist;
    }
    prevMissionLat = lat;
    prevMissionLon = lon;
}

// Calculate distance between two coordinates (Haversine formula) in meters
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// AI Detection Panel
let aiDetectionState = {
    confidence: 0,
    mode: 'SEARCH',
    thermalAssist: false,
    detections: []
};

function updateAIDetectionPanel(data) {
    // Update confidence
    const confValue = document.getElementById('ai-confidence-value');
    const confFill = document.getElementById('ai-confidence-fill');
    if (confValue && confFill) {
        const confidence = data.confidence || 0;
        confValue.textContent = Math.round(confidence);
        confFill.style.width = `${confidence}%`;
        aiDetectionState.confidence = confidence;
    }
    
    // Update mode
    const modeText = document.getElementById('ai-mode-text');
    if (modeText) {
        const mode = data.mode || 'SEARCH';
        modeText.textContent = mode;
        aiDetectionState.mode = mode;
    }
    
    // Update thermal assist
    const thermalStatus = document.getElementById('ai-thermal-status');
    const thermalText = document.getElementById('ai-thermal-text');
    const thermalDot = thermalStatus?.querySelector('.ai-status-dot');
    if (thermalStatus && thermalText && thermalDot) {
        const active = data.thermalAssist || false;
        if (active) {
            thermalDot.classList.add('active');
            thermalText.textContent = 'ACTIVE';
        } else {
            thermalDot.classList.remove('active');
            thermalText.textContent = 'INACTIVE';
        }
        aiDetectionState.thermalAssist = active;
    }
    
    // Update detections list
    const detectionsList = document.getElementById('ai-detections-list');
    if (detectionsList && data.detections) {
        if (data.detections.length === 0) {
            detectionsList.innerHTML = '<div class="ai-detection-item"><span class="detection-type">No detections</span></div>';
        } else {
            detectionsList.innerHTML = data.detections.slice(0, 5).map(det => 
                `<div class="ai-detection-item">
                    <span class="detection-type">${det.type || 'Unknown'}</span>
                    <span style="color: rgba(234,242,255,0.6);"> - ${Math.round(det.confidence || 0)}%</span>
                </div>`
            ).join('');
        }
        aiDetectionState.detections = data.detections;
    }
}

// Dynamic Alerts System - Enhanced with condition monitoring
const alertConditions = {
    batteryLow: { active: false, threshold: 25 },
    gpsLost: { active: false },
    windHigh: { active: false, threshold: 35 },
    victimDetected: { active: false, threshold: 85 }
};


// Alert tracking to prevent duplicates
const activeAlerts = new Map(); // Map<alertKey, alertElement>

function showAlert(title, message, type = 'info', duration = 6000, alertKey = null) {
    // Use alertKey to prevent duplicates, or generate from title if not provided
    const key = alertKey || title.toLowerCase().replace(/\s+/g, '-');
    
    // Check if alert already exists
    if (activeAlerts.has(key)) {
        const existingAlert = activeAlerts.get(key);
        // Update existing alert instead of creating duplicate
        const messageEl = existingAlert.querySelector('.alert-message');
        if (messageEl) messageEl.textContent = message;
        return key;
    }
    
    const container = document.getElementById('alerts-container');
    if (!container) return null;
    
    const icons = {
        info: 'ℹ️',
        warning: '⚠️',
        error: '❌',
        success: '✅',
        battery: '🔋',
        gps: '📡',
        wind: '💨',
        victim: '🆘'
    };
    
    // Determine icon based on title or type
    let icon = icons[type] || icons.info;
    const titleLower = title.toLowerCase();
    if (titleLower.includes('battery')) icon = icons.battery;
    else if (titleLower.includes('gps')) icon = icons.gps;
    else if (titleLower.includes('wind')) icon = icons.wind;
    else if (titleLower.includes('victim') || titleLower.includes('detection')) icon = icons.victim;
    
    const alert = document.createElement('div');
    alert.className = `alert-toast ${type}`;
    alert.dataset.alertKey = key;
    alert.innerHTML = `
        <span class="alert-icon">${icon}</span>
        <div class="alert-content">
            <div class="alert-title">${title}</div>
            <div class="alert-message">${message}</div>
        </div>
    `;
    
    container.appendChild(alert);
    activeAlerts.set(key, alert);
    
    // Auto-remove after duration (6 seconds default)
    setTimeout(() => {
        removeAlert(key);
    }, duration);
    
    return key;
}

function removeAlert(alertKey) {
    const alert = activeAlerts.get(alertKey);
    if (!alert) return;
    
    alert.classList.add('removing');
    setTimeout(() => {
        if (alert.parentNode) {
            alert.parentNode.removeChild(alert);
        }
        activeAlerts.delete(alertKey);
    }, 400);
}

// Tactical Mode Toggle
const TACTICAL_MODE_KEY = 'aquawing_tactical_mode';
let tacticalMode = false;

// Load tactical mode from localStorage
function loadTacticalMode() {
    try {
        const saved = localStorage.getItem(TACTICAL_MODE_KEY);
        if (saved === 'true') {
            tacticalMode = true;
            // Apply immediately if DOM is ready
            if (document.body) {
                applyTacticalMode(true);
            }
        }
    } catch (e) {
        console.warn('Failed to load tactical mode from localStorage:', e);
    }
}

// Load tactical mode - defer to avoid blocking other code
try {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadTacticalMode);
    } else {
        // Use setTimeout to ensure DOM is fully ready and don't block
        setTimeout(loadTacticalMode, 0);
    }
} catch (e) {
    console.warn('Failed to initialize tactical mode loader:', e);
}

// Apply tactical mode state
function applyTacticalMode(enable) {
    if (!document.body) return; // Safety check - don't execute if body doesn't exist
    
    const body = document.body;
    const toggleBtn = document.getElementById('tactical-mode-toggle');
    const label = document.getElementById('tactical-mode-label');
    
    if (enable) {
        body.classList.add('tactical-mode');
        if (toggleBtn) toggleBtn.classList.add('active');
        if (label) label.textContent = 'TACTICAL ON';
    } else {
        body.classList.remove('tactical-mode');
        if (toggleBtn) toggleBtn.classList.remove('active');
        if (label) label.textContent = 'TACTICAL';
    }
}

function toggleTacticalMode() {
    tacticalMode = !tacticalMode;
    
    // Save to localStorage
    localStorage.setItem(TACTICAL_MODE_KEY, tacticalMode.toString());
    
    // Apply changes
    applyTacticalMode(tacticalMode);
    
    // Show alert
    if (tacticalMode) {
        showAlert('Tactical Mode', 'Tactical mode activated', 'warning', 3000);
    } else {
        showAlert('Tactical Mode', 'Tactical mode deactivated', 'info', 3000);
    }
}

// Initialize tactical mode toggle
document.addEventListener('DOMContentLoaded', () => {
    // Ensure tactical mode is applied (in case DOM wasn't ready earlier)
    if (tacticalMode) {
        applyTacticalMode(true);
    }
    
    const tacticalBtn = document.getElementById('tactical-mode-toggle');
    if (tacticalBtn) {
        tacticalBtn.addEventListener('click', toggleTacticalMode);
    }
    
    // Hook into mission start/stop
    const originalStartFlight = window.startFlight;
    if (typeof originalStartFlight === 'function') {
        window.startFlight = function() {
            startMissionTimer();
            return originalStartFlight.apply(this, arguments);
        };
    }
    
    // Initialize placeholders for visible ones on page load
    const allPlaceholders = [
        document.getElementById('video-placeholder'),
        document.getElementById('thermal-placeholder'),
        document.getElementById('optical-video-placeholder'),
        document.getElementById('optical-thermal-placeholder')
    ];
    
    allPlaceholders.forEach(placeholder => {
        if (placeholder && placeholder.style.display !== 'none') {
            initPlaceholderTimer(placeholder);
        }
    });
});

// Enhanced telemetry update to include new features
// Wrap enhancement in DOMContentLoaded to ensure all functions are defined
document.addEventListener('DOMContentLoaded', function() {
    // Wait a bit to ensure updateTelemetry is defined (it's a function declaration, so it should be hoisted)
    setTimeout(function() {
        if (typeof updateTelemetry === 'function') {
            const originalUpdateTelemetry = updateTelemetry;
            updateTelemetry = function(data) {
                // Call original function
                try {
                    originalUpdateTelemetry(data);
                } catch(e) {
                    console.error('Error in original updateTelemetry:', e);
                }
                
                // Update system health
                try {
                    if (typeof updateSystemHealth === 'function') {
                        updateSystemHealth();
                    }
                } catch(e) {
                    console.error('Error in updateSystemHealth:', e);
                }
                
                // Update drone marker with smooth animation
                try {
                    const lat = Number(data.lat || data.latitude || 0);
                    const lon = Number(data.lon || data.longitude || 0);
                    const heading = Number(data.heading || 0);
                    if (lat && lon) {
                        if (typeof updateDroneMarkerAnimation === 'function') {
                            updateDroneMarkerAnimation(lat, lon, heading);
                        }
                        if (typeof addMissionPathPoint === 'function') {
                            addMissionPathPoint(lat, lon);
                        }
                    }
                } catch(e) {
                    console.error('Error updating drone marker:', e);
                }
                
                // Update AI detection if data available
                try {
                    if (data.ai && typeof updateAIDetectionPanel === 'function') {
                        updateAIDetectionPanel(data.ai);
                    }
                } catch(e) {
                    console.error('Error updating AI detection:', e);
                }
                
                // Alert System - Check trigger conditions
                try {
                    if (typeof checkAlertConditions === 'function') {
                        checkAlertConditions(data);
                    }
                } catch(e) {
                    console.error('Error checking alert conditions:', e);
                }
            };
        } else {
            console.warn('updateTelemetry function not found, enhancement skipped');
        }
    }, 100);
});

// Check alert conditions and trigger alerts
function checkAlertConditions(data) {
    // 1. Battery < 25%
    const battery = Number(data.battery || 0);
    if (battery > 0 && battery < alertConditions.batteryLow.threshold) {
        if (!alertConditions.batteryLow.active) {
            const severity = battery < 15 ? 'error' : 'warning';
            showAlert(
                'Low Battery',
                `Battery at ${battery.toFixed(0)}% - Consider returning to base`,
                severity,
                6000,
                'battery-low'
            );
            alertConditions.batteryLow.active = true;
        }
    } else {
        alertConditions.batteryLow.active = false;
    }
    
    // 2. GPS Lost (0 satellites)
    const gpsSats = data.gps_sats || 0;
    if (gpsSats === 0) {
        if (!alertConditions.gpsLost.active) {
            showAlert(
                'GPS Signal Lost',
                'No GPS satellites detected - Navigation may be impaired',
                'error',
                6000,
                'gps-lost'
            );
            alertConditions.gpsLost.active = true;
        }
    } else {
        alertConditions.gpsLost.active = false;
    }
    
    // 3. Wind > 35 km/h (simulated from telemetry or separate data)
    const windSpeed = data.wind_speed || data.wind || simulatedWindSpeed || 0; // km/h
    if (windSpeed > alertConditions.windHigh.threshold) {
        if (!alertConditions.windHigh.active) {
            showAlert(
                'High Wind Warning',
                `Wind speed: ${windSpeed.toFixed(1)} km/h - Flight may be unstable`,
                'warning',
                6000,
                'wind-high'
            );
            alertConditions.windHigh.active = true;
        }
    } else {
        alertConditions.windHigh.active = false;
    }
    
    // 4. AI Detects Victim > 85% confidence
    const aiConfidence = data.ai?.confidence || aiDetectionData?.confidence || 0;
    if (aiConfidence > alertConditions.victimDetected.threshold) {
        if (!alertConditions.victimDetected.active) {
            showAlert(
                'Victim Detected',
                `AI confidence: ${aiConfidence.toFixed(0)}% - Human detected in thermal imaging`,
                'error',
                6000,
                'victim-detected'
            );
            alertConditions.victimDetected.active = true;
        }
    } else {
        // Only reset if confidence drops significantly below threshold
        if (aiConfidence < (alertConditions.victimDetected.threshold - 10)) {
            alertConditions.victimDetected.active = false;
        }
    }
}

// Simulate wind speed for testing (would come from telemetry in real system)
let simulatedWindSpeed = 20; // km/h
function simulateWindSpeed() {
    // Simulate wind fluctuations
    const change = (Math.random() - 0.5) * 5; // -2.5 to +2.5 km/h
    simulatedWindSpeed = Math.max(0, Math.min(50, simulatedWindSpeed + change));
    
    // Check wind condition
    checkAlertConditions({ wind_speed: simulatedWindSpeed });
}

// Start wind simulation (update every 2 seconds)
setInterval(simulateWindSpeed, 2000);

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        updateSystemHealth();
        showAlert('System Ready', 'Mission control interface initialized', 'success', 3000);
    });
} else {
    updateSystemHealth();
    showAlert('System Ready', 'Mission control interface initialized', 'success', 3000);
}
