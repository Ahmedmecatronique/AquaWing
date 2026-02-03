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

// Lightweight Toggle helper (integrated) to avoid external dependency
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
    if (window.Toggles) window.Toggles.setState(btn, followMode);
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
