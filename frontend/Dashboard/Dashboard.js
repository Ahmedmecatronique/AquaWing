const MAP_CENTER = [36.8065, 10.1815];
const WS_URL = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`;

let map = null;
let droneMarker = null;
let trackLine = null;
let ws = null;
let followMode = false;

let waypointsEnabled = false;
let waypoints = [];
let waypointMarkers = [];

let missionTimer = null;
let missionStartTs = null;
let frontendFlying = false;
let demoTimer = null;
let demoIndex = 0;
let demoProgress = 0;

let videoOn = false;
let thermalOn = false;
let rgbTimer = null;
let thermalTimer = null;

function $(id) {
  return document.getElementById(id);
}

function showToast(message, level = "info") {
  console.log(`[${level}] ${message}`);
  pushNotification(message, level);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function setVisible(id, on) {
  const el = $(id);
  if (el) el.style.display = on ? "" : "none";
}

function pushNotification(message, level = "info") {
  const list = $("notification-list");
  const count = $("notification-count");
  if (!list || !count) return;
  const empty = list.querySelector(".notification-empty");
  if (empty) empty.remove();
  const item = document.createElement("div");
  item.className = "notification-item";
  item.textContent = `[${level.toUpperCase()}] ${message}`;
  list.prepend(item);
  const n = Number(count.textContent || "0") + 1;
  count.textContent = String(n);
  count.style.display = n > 0 ? "" : "none";
}

function initMap() {
  if (map) return;
  const mapNode = document.querySelector("#map");
  if (!mapNode) return;

  map = L.map(mapNode).setView(MAP_CENTER, 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  trackLine = L.polyline([], { color: "#ff9f1a", weight: 4, opacity: 0.9 }).addTo(map);
  droneMarker = L.marker(MAP_CENTER).addTo(map);

  map.on("click", (e) => {
    if (!waypointsEnabled) return;
    addWaypoint(e.latlng.lat, e.latlng.lng);
  });
}

function updateDrone(lat, lon, heading = 0) {
  if (!map || !droneMarker || !trackLine) return;
  droneMarker.setLatLng([lat, lon]);
  const curr = trackLine.getLatLngs();
  curr.push([lat, lon]);
  if (curr.length > 2000) curr.shift();
  trackLine.setLatLngs(curr);
  setText("val-lat", lat.toFixed(6));
  setText("val-lon", lon.toFixed(6));
  setText("val-heading", heading.toFixed(1));
  setText("bottom-lat", lat.toFixed(6));
  setText("bottom-lng", lon.toFixed(6));
  if (followMode) map.setView([lat, lon], map.getZoom(), { animate: true });
}

function clearTrack() {
  if (trackLine) trackLine.setLatLngs([]);
}

function connectWs() {
  try {
    ws = new WebSocket(WS_URL);
  } catch (_e) {
    return;
  }

  ws.onmessage = (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (_e) {
      return;
    }
    if (data.type === "telemetry" && data.data) data = data.data;
    if (typeof data.lat === "number" && typeof data.lon === "number") {
      updateDrone(data.lat, data.lon, Number(data.heading || 0));
      if (typeof data.alt === "number") setText("val-alt", data.alt.toFixed(1));
      if (typeof data.speed === "number") setText("val-speed", data.speed.toFixed(1));
      if (typeof data.battery === "number") setText("battery-percent", `${Math.round(data.battery)}%`);
    }
  };
}

function addWaypoint(lat, lon) {
  waypoints.push({ lat, lon });
  if (!map) return;
  const marker = L.marker([lat, lon], { title: `WP ${waypoints.length}` }).addTo(map);
  waypointMarkers.push(marker);
}

function clearWaypoints() {
  waypoints = [];
  waypointMarkers.forEach((m) => map && map.removeLayer(m));
  waypointMarkers = [];
}

function setMissionWaypoints(newWaypoints) {
  clearWaypoints();
  if (!Array.isArray(newWaypoints)) return;
  newWaypoints.forEach((wp) => {
    const lat = Number(wp?.lat);
    const lon = Number(wp?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) addWaypoint(lat, lon);
  });
}

function startMissionStats() {
  missionStartTs = Date.now();
  setVisible("mission-runtime-stats", true);
  setVisible("mission-stats-card", true);
  if (missionTimer) clearInterval(missionTimer);
  missionTimer = setInterval(() => {
    if (!missionStartTs) return;
    const elapsed = Date.now() - missionStartTs;
    const h = String(Math.floor(elapsed / 3600000)).padStart(2, "0");
    const m = String(Math.floor((elapsed % 3600000) / 60000)).padStart(2, "0");
    const s = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0");
    const txt = `${h}:${m}:${s}`;
    setText("runtime-time", txt);
    setText("mission-stat-time", txt);
  }, 1000);
}

function stopMissionStats() {
  if (missionTimer) clearInterval(missionTimer);
  missionTimer = null;
  missionStartTs = null;
  setVisible("mission-runtime-stats", false);
}

function startDemo(reset = true) {
  if (!map) initMap();
  if (waypoints.length < 2) {
    showToast("Define at least 2 waypoints", "error");
    return;
  }
  if (reset) {
    clearTrack();
    demoIndex = 0;
    demoProgress = 0;
  }
  frontendFlying = true;
  startMissionStats();
  if (demoTimer) clearInterval(demoTimer);
  demoTimer = setInterval(() => {
    if (demoIndex >= waypoints.length - 1) {
      stopDemo();
      return;
    }
    const a = waypoints[demoIndex];
    const b = waypoints[demoIndex + 1];
    demoProgress += 0.04;
    if (demoProgress >= 1) {
      demoProgress = 0;
      demoIndex += 1;
    }
    const lat = a.lat + (b.lat - a.lat) * demoProgress;
    const lon = a.lon + (b.lon - a.lon) * demoProgress;
    const heading = Math.atan2(b.lon - a.lon, b.lat - a.lat) * 180 / Math.PI;
    updateDrone(lat, lon, heading);
    setText("val-speed", "3.0");
    setText("val-alt", "20.0");
  }, 500);
}

function pauseDemo() {
  if (!frontendFlying) return;
  if (demoTimer) clearInterval(demoTimer);
  demoTimer = null;
}

function resumeDemo() {
  if (!frontendFlying || demoTimer) return;
  startDemo(false);
}

function stopDemo() {
  frontendFlying = false;
  if (demoTimer) clearInterval(demoTimer);
  demoTimer = null;
  stopMissionStats();
}

function setVideo(on) {
  videoOn = !!on;
  const btn = $("video-toggle");
  if (btn) btn.textContent = `RGB: ${videoOn ? "ON" : "OFF"}`;
  const dot = $("video-status");
  if (dot) dot.textContent = videoOn ? "ON" : "OFF";
  const img = $("video-stream");
  const ph = $("video-placeholder");
  if (!img || !ph) return;
  if (!videoOn) {
    if (rgbTimer) clearInterval(rgbTimer);
    rgbTimer = null;
    img.src = "";
    img.style.display = "none";
    ph.style.display = "flex";
    return;
  }
  const refresh = () => { img.src = `/video?t=${Date.now()}`; };
  img.onload = () => { img.style.display = "block"; ph.style.display = "none"; };
  img.onerror = () => { img.style.display = "none"; ph.style.display = "flex"; };
  refresh();
  if (rgbTimer) clearInterval(rgbTimer);
  rgbTimer = setInterval(refresh, 900);
}

function setThermal(on) {
  thermalOn = !!on;
  const btn = $("thermal-toggle");
  if (btn) btn.textContent = `Thermal: ${thermalOn ? "ON" : "OFF"}`;
  const dot = $("thermal-status");
  if (dot) dot.textContent = thermalOn ? "ON" : "OFF";
  const img = $("thermal-stream");
  const ph = $("thermal-placeholder");
  if (!img || !ph) return;
  if (!thermalOn) {
    if (thermalTimer) clearInterval(thermalTimer);
    thermalTimer = null;
    img.src = "";
    img.style.display = "none";
    ph.style.display = "flex";
    return;
  }
  const refresh = () => { img.src = `/thermal?t=${Date.now()}`; };
  img.onload = () => { img.style.display = "block"; ph.style.display = "none"; };
  img.onerror = () => { img.style.display = "none"; ph.style.display = "flex"; };
  refresh();
  if (thermalTimer) clearInterval(thermalTimer);
  thermalTimer = setInterval(refresh, 1200);
}

function setActiveNav(target) {
  const navIds = [
    "nav-dashboard",
    "nav-missions",
    "nav-systems",
    "nav-optical",
    "nav-pid",
    "nav-electrical-wiring",
    "nav-heatmap",
    "nav-settings",
  ];
  navIds.forEach((id) => $(id)?.classList.remove("nav-active"));
  if (target) target.classList.add("nav-active");

  const panels = [
    "missions-panel",
    "systems-panel",
    "optical-panel",
    "pid-panel",
    "electrical-wiring-panel",
    "heatmap-panel",
    "settings-panel",
  ];
  panels.forEach((id) => setVisible(id, false));

  const main = $("map")?.closest(".main-content");
  const cams = document.querySelector(".dashboard-cams");
  setVisible("speed-control-panel", false);
  if (main) main.style.display = "none";
  if (cams) cams.style.display = "none";

  if (target === $("nav-dashboard")) {
    if (main) main.style.display = "flex";
    if (cams) cams.style.display = "grid";
    setVisible("speed-control-panel", true);
    return;
  }
  if (target === $("nav-missions")) return setVisible("missions-panel", true);
  if (target === $("nav-systems")) return setVisible("systems-panel", true);
  if (target === $("nav-optical")) return setVisible("optical-panel", true);
  if (target === $("nav-pid")) return setVisible("pid-panel", true);
  if (target === $("nav-electrical-wiring")) return setVisible("electrical-wiring-panel", true);
  if (target === $("nav-heatmap")) return setVisible("heatmap-panel", true);
  if (target === $("nav-settings")) return setVisible("settings-panel", true);
}

function wireUi() {
  $("sidebar-logout-btn")?.addEventListener("click", () => { location.href = "/logout"; });
  $("logout-btn")?.addEventListener("click", () => { location.href = "/logout"; });

  $("follow-toggle")?.addEventListener("click", () => {
    followMode = !followMode;
    setText("follow-toggle", `Follow: ${followMode ? "ON" : "OFF"}`);
  });
  $("center-btn")?.addEventListener("click", () => {
    if (!map || !droneMarker) return;
    map.setView(droneMarker.getLatLng(), map.getZoom(), { animate: true });
  });
  $("clear-btn")?.addEventListener("click", clearTrack);

  $("waypoints-toggle")?.addEventListener("click", () => {
    waypointsEnabled = !waypointsEnabled;
    setText("waypoints-toggle", `Waypoints: ${waypointsEnabled ? "ON" : "OFF"}`);
    if (!waypointsEnabled) clearWaypoints();
  });

  $("start-flight-btn")?.addEventListener("click", () => startDemo(true));
  $("pause-mission-btn")?.addEventListener("click", pauseDemo);
  $("resume-mission-btn")?.addEventListener("click", resumeDemo);
  $("wait-btn")?.addEventListener("click", stopDemo);

  $("video-toggle")?.addEventListener("click", () => setVideo(!videoOn));
  $("thermal-toggle")?.addEventListener("click", () => setThermal(!thermalOn));

  $("menu-toggle-btn")?.addEventListener("click", () => {
    $("sidebar")?.classList.toggle("collapsed");
  });

  $("ai-advisor-btn")?.addEventListener("click", () => {
    const panel = $("ai-advisor-panel");
    if (!panel) return;
    panel.style.display = panel.style.display === "none" ? "" : "none";
  });
  $("ai-advisor-close")?.addEventListener("click", () => {
    const panel = $("ai-advisor-panel");
    if (panel) panel.style.display = "none";
  });

  $("notification-btn")?.addEventListener("click", () => {
    const panel = $("notification-panel");
    if (!panel) return;
    const open = panel.style.display !== "none";
    panel.style.display = open ? "none" : "";
    if (!open) {
      const count = $("notification-count");
      if (count) {
        count.textContent = "0";
        count.style.display = "none";
      }
    }
  });
  $("notification-panel-close")?.addEventListener("click", () => {
    const panel = $("notification-panel");
    if (panel) panel.style.display = "none";
  });

  $("tactical-mode-toggle")?.addEventListener("click", () => {
    document.body.classList.toggle("tactical-mode");
    const on = document.body.classList.contains("tactical-mode");
    setText("tactical-mode-label", on ? "TACTICAL ON" : "TACTICAL");
  });

  $("speed-control-sidebar")?.addEventListener("input", (e) => {
    const v = Number(e.target.value || 0);
    setText("speed-value-display", v.toFixed(1));
    setText("set-speed-value", v.toFixed(1));
  });

  [
    "nav-dashboard",
    "nav-missions",
    "nav-systems",
    "nav-optical",
    "nav-pid",
    "nav-electrical-wiring",
    "nav-heatmap",
    "nav-settings",
  ].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("click", () => setActiveNav(el));
  });

  setActiveNav($("nav-dashboard"));
}

window.startDemo = startDemo;
window.pauseDemo = pauseDemo;
window.resumeDemo = resumeDemo;
window.stopDemo = stopDemo;
window.showToast = showToast;
window.setMissionWaypoints = setMissionWaypoints;

window.addEventListener("load", () => {
  initMap();
  connectWs();
  wireUi();
  setVideo(false);
  setThermal(false);
});
