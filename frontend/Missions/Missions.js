function callParent(name, ...args) {
    try {
        const fn = window.parent && window.parent[name];
        if (typeof fn === "function") return fn(...args);
    } catch (_e) {
        // Ignore cross-frame errors.
    }
    return undefined;
}

function toast(message, kind = "info") {
    if (callParent("showToast", message, kind) === undefined) {
        console.log(`[${kind}] ${message}`);
    }
}

const MISSION_MAP_CENTER = [36.8065, 10.1815];
let missionMap = null;
let missionPolyline = null;
let missionWaypoints = [];
let missionWaypointMarkers = [];
let missionDroneMarker = null;
let missionTrackLine = null;
let missionTimer = null;
let missionSegmentIndex = 0;
let missionSegmentProgress = 0;
let missionRunning = false;

function updateWaypointCount() {
    const count = document.getElementById("waypoint-count");
    if (count) count.textContent = String(missionWaypoints.length);
}

function syncWaypointsToParent() {
    callParent("setMissionWaypoints", missionWaypoints);
}

function redrawMissionPath() {
    if (!missionMap || !missionPolyline) return;
    missionPolyline.setLatLngs(missionWaypoints.map((wp) => [wp.lat, wp.lon]));
}

function addMissionWaypoint(lat, lon) {
    if (!missionMap) return;
    const wp = { lat, lon };
    missionWaypoints.push(wp);
    const idx = missionWaypoints.length;
    const marker = L.marker([lat, lon], {
        title: `WP ${idx}`,
        icon: L.divIcon({
            className: "mission-waypoint-icon",
            html: `<span>${idx}</span>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
        }),
    }).addTo(missionMap);
    missionWaypointMarkers.push(marker);
    redrawMissionPath();
    updateWaypointCount();
    syncWaypointsToParent();
}

function clearMissionWaypoints() {
    missionWaypoints = [];
    missionWaypointMarkers.forEach((m) => missionMap && missionMap.removeLayer(m));
    missionWaypointMarkers = [];
    redrawMissionPath();
    updateWaypointCount();
    syncWaypointsToParent();
}

function refreshWaypointMarkerLabels() {
    missionWaypointMarkers.forEach((marker, index) => {
        const n = index + 1;
        marker.setIcon(
            L.divIcon({
                className: "mission-waypoint-icon",
                html: `<span>${n}</span>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15],
            }),
        );
        marker.options.title = `WP ${n}`;
    });
}

function initMissionMap() {
    const node = document.getElementById("mission-map");
    if (!node || typeof L === "undefined") return;
    missionMap = L.map(node).setView(MISSION_MAP_CENTER, 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
    }).addTo(missionMap);

    missionPolyline = L.polyline([], { color: "#ff9f1a", weight: 4, opacity: 0.9 }).addTo(missionMap);
    missionPolyline.setStyle({
        color: "#ff9f1a",
        weight: 4,
        opacity: 0.95,
        dashArray: "10 8",
        lineCap: "round",
        lineJoin: "round",
    });
    missionMap.on("click", (e) => addMissionWaypoint(e.latlng.lat, e.latlng.lng));

    missionTrackLine = L.polyline([], {
        color: "#00d4ff",
        weight: 3,
        opacity: 0.85,
    }).addTo(missionMap);

    missionDroneMarker = L.marker(MISSION_MAP_CENTER, {
        icon: L.divIcon({
            className: "mission-drone-icon",
            html: '<span class="mission-drone-glyph">✈</span>',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
        }),
        title: "Drone",
    }).addTo(missionMap);

    setTimeout(() => missionMap && missionMap.invalidateSize(), 120);
    updateWaypointCount();
}

function updateMissionDrone(lat, lon, headingDeg) {
    if (!missionMap || !missionDroneMarker || !missionTrackLine) return;
    missionDroneMarker.setLatLng([lat, lon]);
    const el = missionDroneMarker.getElement();
    const glyph = el ? el.querySelector(".mission-drone-glyph") : null;
    if (glyph) glyph.style.transform = `rotate(${headingDeg}deg)`;
    const pts = missionTrackLine.getLatLngs();
    pts.push([lat, lon]);
    if (pts.length > 1200) pts.shift();
    missionTrackLine.setLatLngs(pts);
}

function resetMissionAnimationPath() {
    missionSegmentIndex = 0;
    missionSegmentProgress = 0;
    if (missionTrackLine) missionTrackLine.setLatLngs([]);
}

function startMissionAnimation(reset = true) {
    if (!missionWaypoints.length || missionWaypoints.length < 2) return;
    if (reset) resetMissionAnimationPath();
    missionRunning = true;
    if (missionTimer) clearInterval(missionTimer);
    missionTimer = setInterval(() => {
        if (missionSegmentIndex >= missionWaypoints.length - 1) {
            stopMissionAnimation();
            return;
        }
        const a = missionWaypoints[missionSegmentIndex];
        const b = missionWaypoints[missionSegmentIndex + 1];
        missionSegmentProgress += 0.04;
        if (missionSegmentProgress >= 1) {
            missionSegmentProgress = 0;
            missionSegmentIndex += 1;
        }
        const lat = a.lat + (b.lat - a.lat) * missionSegmentProgress;
        const lon = a.lon + (b.lon - a.lon) * missionSegmentProgress;
        const heading = Math.atan2(b.lon - a.lon, b.lat - a.lat) * 180 / Math.PI;
        updateMissionDrone(lat, lon, heading);
        missionMap.setView([lat, lon], missionMap.getZoom(), { animate: true });
    }, 500);
}

function pauseMissionAnimation() {
    if (!missionRunning) return;
    if (missionTimer) clearInterval(missionTimer);
    missionTimer = null;
}

function resumeMissionAnimation() {
    if (!missionRunning || missionTimer) return;
    startMissionAnimation(false);
}

function stopMissionAnimation() {
    missionRunning = false;
    if (missionTimer) clearInterval(missionTimer);
    missionTimer = null;
}

function startEmergencyRtl() {
    if (!missionMap || !missionDroneMarker) {
        toast("Carte mission indisponible", "error");
        return;
    }

    const home = missionWaypoints.length ? missionWaypoints[0] : { lat: MISSION_MAP_CENTER[0], lon: MISSION_MAP_CENTER[1] };
    const current = missionDroneMarker.getLatLng();
    if (!current) {
        toast("Position drone indisponible", "error");
        return;
    }

    // Stop current mission flow and switch to direct shortest-path return.
    stopMissionAnimation();
    callParent("stopDemo");

    const startLat = current.lat;
    const startLon = current.lng;
    const endLat = home.lat;
    const endLon = home.lon;
    let progress = 0;

    // Highlight RTL path (direct segment from current point to home).
    missionPolyline?.setLatLngs([
        [startLat, startLon],
        [endLat, endLon],
    ]);

    if (missionTimer) clearInterval(missionTimer);
    missionTimer = setInterval(() => {
        progress += 0.05;
        if (progress >= 1) progress = 1;

        const lat = startLat + (endLat - startLat) * progress;
        const lon = startLon + (endLon - startLon) * progress;
        const heading = Math.atan2(endLon - startLon, endLat - startLat) * 180 / Math.PI;
        updateMissionDrone(lat, lon, heading);
        missionMap.setView([lat, lon], missionMap.getZoom(), { animate: true });

        if (progress >= 1) {
            if (missionTimer) clearInterval(missionTimer);
            missionTimer = null;
            toast("RTL terminé - retour au point de départ", "success");
        }
    }, 180);
}

function runPreflight() {
    const panel = document.getElementById("preflight-status");
    if (!panel) return;
    panel.style.display = "block";
    const items = panel.querySelectorAll(".status");
    items.forEach((item, idx) => {
        item.className = "status wait";
        item.textContent = "WAIT";
        setTimeout(() => {
            item.className = "status ok";
            item.textContent = "OK";
        }, 400 + idx * 450);
    });
}

window.addEventListener("DOMContentLoaded", () => {
    initMissionMap();
    const startBtn = document.getElementById("start-flight-btn");
    const pauseBtn = document.getElementById("pause-mission-btn");
    const resumeBtn = document.getElementById("resume-mission-btn");
    const preflightBtn = document.getElementById("preflight-btn");
    const rtlBtn = document.getElementById("emergency-rtl-btn");
    const endBtn = document.getElementById("wait-btn");
    const clearWaypointsBtn = document.getElementById("clear-waypoints-btn");

    if (startBtn) {
        startBtn.addEventListener("click", () => {
            if (missionWaypoints.length < 2) {
                toast("Ajoutez au moins 2 waypoints sur la carte", "error");
                return;
            }
            syncWaypointsToParent();
            callParent("startDemo", true);
            startMissionAnimation(true);
            toast("Mission started", "success");
        });
    }

    if (pauseBtn) {
        pauseBtn.addEventListener("click", () => {
            callParent("pauseDemo");
            pauseMissionAnimation();
            toast("Mission paused", "info");
        });
    }

    if (resumeBtn) {
        resumeBtn.addEventListener("click", () => {
            callParent("resumeDemo");
            resumeMissionAnimation();
            toast("Mission resumed", "success");
        });
    }

    if (preflightBtn) {
        preflightBtn.addEventListener("click", () => {
            runPreflight();
            toast("Pre-flight check completed", "success");
        });
    }

    if (rtlBtn) {
        rtlBtn.addEventListener("click", () => {
            startEmergencyRtl();
        });
    }

    if (endBtn) {
        endBtn.addEventListener("click", () => {
            callParent("stopDemo");
            stopMissionAnimation();
            toast("Mission ended", "success");
        });
    }

    if (clearWaypointsBtn) {
        clearWaypointsBtn.addEventListener("click", () => {
            clearMissionWaypoints();
            toast("Waypoints cleared", "info");
        });
    }

    missionMap?.on("contextmenu", (e) => {
        if (!missionMap || !missionWaypoints.length) return;
        let nearestIdx = -1;
        let nearestDist = Infinity;
        missionWaypoints.forEach((wp, idx) => {
            const d = missionMap.distance([wp.lat, wp.lon], e.latlng);
            if (d < nearestDist) {
                nearestDist = d;
                nearestIdx = idx;
            }
        });
        if (nearestIdx >= 0 && nearestDist < 40) {
            const marker = missionWaypointMarkers[nearestIdx];
            if (marker && missionMap) missionMap.removeLayer(marker);
            missionWaypointMarkers.splice(nearestIdx, 1);
            missionWaypoints.splice(nearestIdx, 1);
            refreshWaypointMarkerLabels();
            redrawMissionPath();
            updateWaypointCount();
            syncWaypointsToParent();
            toast("Waypoint removed", "info");
        }
    });
});