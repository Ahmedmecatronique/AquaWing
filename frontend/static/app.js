/*
 * Frontend Dashboard Application
 * 
 * Handles:
 * - REST API communication (/api/status)
 * - WebSocket telemetry streaming (/ws/telemetry)
 * - Dashboard updates
 * 
 * TODO: Add error handling and reconnection logic
 * TODO: Implement map for drone position
 */

// ============================================================================
// Global State
// ============================================================================

let wsConnection = null;
let restHealthy = false;
let wsHealthy = false;

// ============================================================================
// REST API Communication
// ============================================================================

async function getStatus() {
    try {
        const response = await fetch('/api/status');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        updateStatusDisplay(data);
        setRestStatus(true);
        addLog('Status updated from REST API');
        return data;
    } catch (error) {
        console.error('Error fetching status:', error);
        setRestStatus(false);
        addLog(`REST API error: ${error.message}`);
    }
}

// ============================================================================
// WebSocket Communication
// ============================================================================

function connectWebSocket() {
    try {
        // Determine WebSocket protocol based on current page protocol
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;
        
        console.log('Connecting to WebSocket:', wsUrl);
        wsConnection = new WebSocket(wsUrl);
        
        wsConnection.onopen = (event) => {
            console.log('WebSocket connected');
            setWsStatus(true);
            addLog('WebSocket connection established');
        };
        
        wsConnection.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                
                if (message.type === 'telemetry' && message.data) {
                    updateTelemetryDisplay(message.data);
                    updateLastUpdate();
                } else if (message.type === 'status' && message.data) {
                    updateStatusDisplay(message.data);
                    updateLastUpdate();
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
                addLog(`WebSocket parse error: ${error.message}`);
            }
        };
        
        wsConnection.onerror = (error) => {
            console.error('WebSocket error:', error);
            setWsStatus(false);
            addLog('WebSocket error occurred');
        };
        
        wsConnection.onclose = (event) => {
            console.log('WebSocket closed:', event.code, event.reason);
            setWsStatus(false);
            addLog(`WebSocket connection closed (code: ${event.code})`);
            
            // Attempt to reconnect after 3 seconds
            setTimeout(() => {
                if (!wsHealthy) {
                    addLog('Attempting to reconnect WebSocket...');
                    connectWebSocket();
                }
            }, 3000);
        };
    } catch (error) {
        console.error('Error connecting WebSocket:', error);
        setWsStatus(false);
        addLog(`WebSocket connection error: ${error.message}`);
    }
}

// ============================================================================
// Display Updates
// ============================================================================

function updateStatusDisplay(status) {
    if (status.armed !== undefined) {
        document.getElementById('statusArmed').textContent = status.armed ? 'Yes' : 'No';
    }
    if (status.mode !== undefined) {
        document.getElementById('statusMode').textContent = status.mode || 'STABILIZE';
    }
    if (status.battery_percent !== undefined) {
        document.getElementById('statusBattery').textContent = 
            status.battery_percent.toFixed(1) + '%';
    }
    if (status.gps_fix !== undefined) {
        document.getElementById('statusGPS').textContent = status.gps_fix ? 'Yes' : 'No';
    }
}

function updateTelemetryDisplay(telemetry) {
    if (telemetry.altitude_m !== undefined) {
        document.getElementById('telemetryAltitude').textContent = 
            telemetry.altitude_m.toFixed(2) + ' m';
    }
    
    if (telemetry.velocity_mps !== undefined) {
        document.getElementById('telemetryVelocity').textContent = 
            telemetry.velocity_mps.toFixed(2) + ' m/s';
    }
    
    if (telemetry.heading_deg !== undefined) {
        document.getElementById('telemetryHeading').textContent = 
            telemetry.heading_deg.toFixed(1) + '°';
    }
    
    if (telemetry.position_lat !== undefined && telemetry.position_lon !== undefined) {
        document.getElementById('telemetryPosition').textContent = 
            telemetry.position_lat.toFixed(5) + '°, ' + telemetry.position_lon.toFixed(5) + '°';
    }
    
    if (telemetry.roll_deg !== undefined) {
        document.getElementById('telemetryRoll').textContent = 
            telemetry.roll_deg.toFixed(1) + '°';
    }
    
    if (telemetry.pitch_deg !== undefined) {
        document.getElementById('telemetryPitch').textContent = 
            telemetry.pitch_deg.toFixed(1) + '°';
    }
    
    if (telemetry.yaw_deg !== undefined) {
        document.getElementById('telemetryYaw').textContent = 
            telemetry.yaw_deg.toFixed(1) + '°';
    }
    
    if (telemetry.battery_voltage_v !== undefined) {
        document.getElementById('telemetryBatteryVoltage').textContent = 
            telemetry.battery_voltage_v.toFixed(1) + ' V';
    }
}

function updateLastUpdate() {
    const now = new Date().toLocaleTimeString();
    document.getElementById('lastUpdate').textContent = now;
}

function setRestStatus(healthy) {
    restHealthy = healthy;
    const element = document.getElementById('restStatus');
    if (healthy) {
        element.textContent = 'Connected';
        element.className = 'value status-connected';
    } else {
        element.textContent = 'Disconnected';
        element.className = 'value status-disconnected';
    }
    updateConnectionIndicator();
}

function setWsStatus(healthy) {
    wsHealthy = healthy;
    const element = document.getElementById('wsStatus');
    if (healthy) {
        element.textContent = 'Connected';
        element.className = 'value status-connected';
    } else {
        element.textContent = 'Disconnected';
        element.className = 'value status-disconnected';
    }
    updateConnectionIndicator();
}

function updateConnectionIndicator() {
    const indicator = document.getElementById('connectionStatus');
    if (restHealthy && wsHealthy) {
        indicator.textContent = 'Connected';
        indicator.className = 'status-indicator status-connected';
    } else if (restHealthy || wsHealthy) {
        indicator.textContent = 'Partial';
        indicator.className = 'status-indicator status-partial';
    } else {
        indicator.textContent = 'Disconnected';
        indicator.className = 'status-indicator status-disconnected';
    }
}

// ============================================================================
// Event Logging
// ============================================================================

function addLog(message) {
    const logElement = document.getElementById('eventLog');
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.textContent = `[${timestamp}] ${message}`;
    
    logElement.insertBefore(logEntry, logElement.firstChild);
    
    // Keep only last 50 entries
    while (logElement.children.length > 50) {
        logElement.removeChild(logElement.lastChild);
    }
}

// ============================================================================
// Initialization
// ============================================================================

function init() {
    addLog('Dashboard initialized');
    
    // Fetch initial status
    getStatus();
    
    // Connect WebSocket
    connectWebSocket();
    
    // Poll status every 5 seconds as backup
    setInterval(() => {
        if (restHealthy) {
            getStatus();
        }
    }, 5000);
}

// Initialize on page load
window.addEventListener('load', init);
