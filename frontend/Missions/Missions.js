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

/** Identique au marqueur `createDroneMarker` du dashboard (`Dashboard.js`) — même SVG papier-plane orange. */
const MISSION_DRONE_PLANE_ICON = (function missionDronePlaneIconIIFE() {
    const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='%23ff7a18' d='M2 21l21-9L2 3l3 7 12 2-12 2z'/></svg>`;
    const iconUrl = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
    return L.icon({
        iconUrl,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        className: "drone-marker-img mission-drone-marker-img",
    });
})();

let missionMap = null;
let missionRouteSolid = null;
let missionRouteDash = null;
/** Flèche(s) au milieu du segment actif — même logique que la maquette dashboard. */
let missionRouteArrowMarkers = [];
let missionWaypoints = [];
let missionWaypointMarkers = [];
let missionDroneMarker = null;
let missionTrackLine = null;
let missionTimer = null;
let missionSegmentIndex = 0;
let missionSegmentProgress = 0;
let missionRunning = false;
let missionFollowMode = true;
let missionWaypointsEnabled = true;
/** Pendant un remplacement des WP depuis le dashboard — ne pas rappeler parent.setMissionWaypoints. */
let missionApplyingFromDashboard = false;

function pullWaypointsFromDashboardParent() {
    try {
        const fn = window.parent && window.parent.getDashboardWaypointsForMission;
        if (typeof fn !== "function") return;
        const pts = fn.call(window.parent);
        if (Array.isArray(pts) && pts.length > 0) {
            window.applyDashboardWaypoints(pts);
        }
    } catch (_e) {
        /* page mission autonome ou parent sans API */
    }
}

function updateWaypointCount() {
    const count = document.getElementById("waypoint-count");
    if (count) count.textContent = String(missionWaypoints.length);
}

function syncWaypointsToParent() {
    if (missionApplyingFromDashboard) return;
    callParent("setMissionWaypoints", missionWaypoints);
}

function bearingDegreesNorthClockwise(fromLat, fromLng, toLat, toLng) {
    const φ1 = (fromLat * Math.PI) / 180;
    const φ2 = (toLat * Math.PI) / 180;
    const Δλ = ((toLng - fromLng) * Math.PI) / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function clearMissionRouteArrows() {
    missionRouteArrowMarkers.forEach((m) => {
        try {
            missionMap && missionMap.removeLayer(m);
        } catch (_e) {
            /* noop */
        }
    });
    missionRouteArrowMarkers = [];
}

function addMissionSegmentArrow(lat1, lon1, lat2, lon2) {
    if (!missionMap) return;
    const midLat = (lat1 + lat2) / 2;
    const midLon = (lon1 + lon2) / 2;
    const brg = bearingDegreesNorthClockwise(lat1, lon1, lat2, lon2);
    const marker = L.marker([midLat, midLon], {
        icon: L.divIcon({
            className: "mission-path-arrow-wrap",
            html: `<span class="mission-path-arrow" style="transform:rotate(${brg}deg)">▲</span>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
        }),
        interactive: false,
        zIndexOffset: 550,
        keyboard: false,
    }).addTo(missionMap);
    missionRouteArrowMarkers.push(marker);
}

/** Tracé : segment WP1→WP2 plein + flèche ; suite en pointillés (aligné carte dashboard). */
function redrawMissionPath() {
    if (!missionMap || !missionRouteSolid || !missionRouteDash) return;
    clearMissionRouteArrows();
    const ll = missionWaypoints.map((wp) => [wp.lat, wp.lon]);
    if (ll.length >= 2) {
        missionRouteSolid.setLatLngs([ll[0], ll[1]]);
        missionRouteSolid.setStyle({
            color: "#ff9f1a",
            weight: 4,
            opacity: 0.96,
            dashArray: null,
            lineCap: "round",
            lineJoin: "round",
        });
        addMissionSegmentArrow(ll[0][0], ll[0][1], ll[1][0], ll[1][1]);
        if (ll.length > 2) {
            missionRouteDash.setLatLngs(ll.slice(1));
            missionRouteDash.setStyle({
                color: "#ff9f1a",
                weight: 4,
                opacity: 0.92,
                dashArray: "10 11",
                lineCap: "round",
                lineJoin: "round",
            });
        } else {
            missionRouteDash.setLatLngs([]);
        }
    } else {
        missionRouteSolid.setLatLngs([]);
        missionRouteDash.setLatLngs([]);
    }
}

function updateWaypointVisibility() {
    if (!missionMap) return;
    missionWaypointMarkers.forEach((marker) => {
        const onMap = missionMap.hasLayer(marker);
        if (missionWaypointsEnabled && !onMap) marker.addTo(missionMap);
        if (!missionWaypointsEnabled && onMap) missionMap.removeLayer(marker);
    });
}

function missionWaypointDivIcon(seq) {
    return L.divIcon({
        className: "mission-waypoint-icon-root aw-mission-wp-marker",
        html: `<div class="mission-waypoint-marker">${seq}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
    });
}

function addMissionWaypoint(lat, lon) {
    if (!missionMap) return;
    const wp = { lat, lon };
    missionWaypoints.push(wp);
    const idx = missionWaypoints.length;
    const marker = L.marker([lat, lon], {
        title: `WP ${idx}`,
        icon: missionWaypointDivIcon(idx),
        keyboard: false,
        zIndexOffset: 820,
        riseOnHover: true,
        riseOffset: 1200,
    });
    if (missionWaypointsEnabled) marker.addTo(missionMap);
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

function clearMissionTrack() {
    if (missionTrackLine) missionTrackLine.setLatLngs([]);
}

/**
 * Remplace les waypoints affichés sur la carte Mission depuis le dashboard (même origine).
 * @param {{ lat: number, lon?: number, lng?: number }[]} points
 */
window.applyDashboardWaypoints = function (points) {
    if (!missionMap || !Array.isArray(points)) return;
    const norm = points
        .map((p) => ({
            lat: Math.round(Number(p.lat) * 1e7) / 1e7,
            lon: Math.round(Number(p.lon !== undefined ? p.lon : p.lng) * 1e7) / 1e7,
        }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    const same =
        norm.length === missionWaypoints.length &&
        norm.every((p, i) => {
            const q = missionWaypoints[i];
            return q && q.lat === p.lat && q.lon === p.lon;
        });
    if (same) return;

    missionApplyingFromDashboard = true;
    try {
        missionWaypointMarkers.forEach((m) => missionMap.removeLayer(m));
        missionWaypointMarkers = [];
        missionWaypoints = norm.map((p) => ({ lat: p.lat, lon: p.lon }));
        missionWaypoints.forEach((wp, index) => {
            const n = index + 1;
            const marker = L.marker([wp.lat, wp.lon], {
                title: `WP ${n}`,
                icon: missionWaypointDivIcon(n),
                keyboard: false,
                zIndexOffset: 820,
                riseOnHover: true,
                riseOffset: 1200,
            });
            if (missionWaypointsEnabled) marker.addTo(missionMap);
            missionWaypointMarkers.push(marker);
        });
        redrawMissionPath();
        updateWaypointCount();
    } finally {
        missionApplyingFromDashboard = false;
    }
};

/** Synchronise drone + trace sur la carte Mission avec la télémétrie / démo du dashboard. */
window.applyDashboardDrone = function (lat, lon, headingDeg) {
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || !la || !lo) return;
    updateMissionDrone(la, lo, Number(headingDeg) || 0);
};

function refreshWaypointMarkerLabels() {
    missionWaypointMarkers.forEach((marker, index) => {
        const n = index + 1;
        marker.setIcon(missionWaypointDivIcon(n));
        marker.options.title = `WP ${n}`;
    });
}

function initMissionMap() {
    const node = document.getElementById("mission-map");
    if (!node || typeof L === "undefined") return;
    missionMap = L.map(node).setView(MISSION_MAP_CENTER, 15);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Tiles © Esri",
        maxZoom: 19,
    }).addTo(missionMap);

    missionRouteSolid = L.polyline([], {
        color: "#ff9f1a",
        weight: 4,
        opacity: 0.96,
        lineCap: "round",
        lineJoin: "round",
    }).addTo(missionMap);
    missionRouteDash = L.polyline([], {
        color: "#ff9f1a",
        weight: 4,
        opacity: 0.92,
        dashArray: "10 11",
        lineCap: "round",
        lineJoin: "round",
    }).addTo(missionMap);
    missionMap.on("click", (e) => {
        if (!missionWaypointsEnabled) return;
        addMissionWaypoint(e.latlng.lat, e.latlng.lng);
    });

    missionTrackLine = L.polyline([], {
        color: "#ff9f1a",
        weight: 4,
        opacity: 0.9,
        smoothFactor: 1,
        lineCap: "round",
        lineJoin: "round",
    }).addTo(missionMap);

    missionDroneMarker = L.marker(MISSION_MAP_CENTER, {
        icon: MISSION_DRONE_PLANE_ICON,
        zIndexOffset: 1000,
        interactive: false,
        keyboard: false,
        title: "Drone",
    }).addTo(missionMap);
    try {
        missionDroneMarker.bringToFront();
    } catch (_e) {
        /* noop */
    }

    const controls = document.querySelector(".mission-map-controls");
    if (controls && typeof L !== "undefined" && L.DomEvent) {
        L.DomEvent.disableClickPropagation(controls);
        L.DomEvent.disableScrollPropagation(controls);
    }

    setTimeout(() => missionMap && missionMap.invalidateSize(), 120);
    window.awInvalidateMissionMapSize = function () {
        try {
            if (missionMap && typeof missionMap.invalidateSize === "function") {
                missionMap.invalidateSize({ animate: false });
            }
        } catch (_e) {
            /* noop */
        }
    };
    window.addEventListener("resize", () => window.awInvalidateMissionMapSize && window.awInvalidateMissionMapSize());
    updateWaypointCount();
    pullWaypointsFromDashboardParent();
    requestAnimationFrame(() => pullWaypointsFromDashboardParent());
    setTimeout(() => pullWaypointsFromDashboardParent(), 320);
}

window.pullWaypointsFromDashboardParent = pullWaypointsFromDashboardParent;

function updateMissionDrone(lat, lon, headingDeg) {
    if (!missionMap || !missionDroneMarker || !missionTrackLine) return;
    missionDroneMarker.setLatLng([lat, lon]);
    try {
        missionDroneMarker.setZIndexOffset(1000);
        missionDroneMarker.bringToFront();
    } catch (_e) {
        /* noop */
    }
    const el = missionDroneMarker.getElement();
    if (el) {
        const img = el.querySelector("img");
        if (img) {
            img.style.transformOrigin = "center center";
            img.style.transition = "transform 160ms linear";
            img.style.transform = `rotate(${headingDeg}deg)`;
        }
    }
    const pts = missionTrackLine.getLatLngs();
    pts.push([lat, lon]);
    if (pts.length > 1200) pts.shift();
    missionTrackLine.setLatLngs(pts);
    if (missionFollowMode && missionMap) {
        missionMap.setView([lat, lon], missionMap.getZoom(), { animate: true });
    }
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

    clearMissionRouteArrows();
    if (missionRouteDash) missionRouteDash.setLatLngs([]);
    if (missionRouteSolid) {
        missionRouteSolid.setLatLngs([
            [startLat, startLon],
            [endLat, endLon],
        ]);
        missionRouteSolid.setStyle({
            color: "#ff9f1a",
            weight: 4,
            opacity: 0.98,
            dashArray: null,
            lineCap: "round",
            lineJoin: "round",
        });
        addMissionSegmentArrow(startLat, startLon, endLat, endLon);
    }

    if (missionTimer) clearInterval(missionTimer);
    missionTimer = setInterval(() => {
        progress += 0.05;
        if (progress >= 1) progress = 1;

        const lat = startLat + (endLat - startLat) * progress;
        const lon = startLon + (endLon - startLon) * progress;
        const heading = Math.atan2(endLon - startLon, endLat - startLat) * 180 / Math.PI;
        updateMissionDrone(lat, lon, heading);

        if (progress >= 1) {
            if (missionTimer) clearInterval(missionTimer);
            missionTimer = null;
            redrawMissionPath();
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

function forceBottomCenterControls() {
    const controls = document.querySelector(".mission-map-controls");
    if (!controls) return;
    controls.style.position = "absolute";
    controls.style.top = "auto";
    controls.style.right = "auto";
    controls.style.bottom = "8px";
    controls.style.left = "50%";
    controls.style.transform = "translateX(-50%)";
    controls.style.zIndex = "900";
}

window.addEventListener("DOMContentLoaded", () => {
    forceBottomCenterControls();
    initMissionMap();
    const startBtn = document.getElementById("start-flight-btn");
    const pauseBtn = document.getElementById("pause-mission-btn");
    const resumeBtn = document.getElementById("resume-mission-btn");
    const preflightBtn = document.getElementById("preflight-btn");
    const rtlBtn = document.getElementById("emergency-rtl-btn");
    const endBtn = document.getElementById("wait-btn");
    const followBtn = document.getElementById("mission-follow-toggle");
    const centerBtn = document.getElementById("mission-center-btn");
    const clearTrackBtn = document.getElementById("mission-clear-track-btn");
    const waypointsToggleBtn = document.getElementById("mission-waypoints-toggle");

    if (startBtn) {
        startBtn.addEventListener("click", () => {
            if (missionWaypoints.length < 2) {
                toast("Ajoutez au moins 2 waypoints sur la carte", "error");
                return;
            }
            syncWaypointsToParent();
            callParent("startDemo", true);
            /* Trajectoire / drone : une seule source (télémétrie du dashboard → applyDashboardDrone). */
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

    if (followBtn) {
        followBtn.addEventListener("click", () => {
            missionFollowMode = !missionFollowMode;
            followBtn.textContent = `Follow: ${missionFollowMode ? "ON" : "OFF"}`;
        });
    }

    if (centerBtn) {
        centerBtn.addEventListener("click", () => {
            if (!missionMap || !missionDroneMarker) return;
            missionMap.setView(missionDroneMarker.getLatLng(), missionMap.getZoom(), { animate: true });
        });
    }

    if (clearTrackBtn) {
        clearTrackBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            clearMissionTrack();
            clearMissionWaypoints();
            toast("Track and waypoints cleared", "info");
        });
    }

    if (waypointsToggleBtn) {
        waypointsToggleBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            missionWaypointsEnabled = !missionWaypointsEnabled;
            waypointsToggleBtn.textContent = `Waypoints: ${missionWaypointsEnabled ? "ON" : "OFF"}`;
            updateWaypointVisibility();
            if (!missionWaypointsEnabled) {
                toast("Waypoints hidden", "info");
                return;
            }
            toast("Waypoints visible", "success");
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