const MAP_CENTER = [36.8065, 10.1815];
let map = null;
let points = [];
let markers = [];

function updateStats() {
    const total = points.length;
    const drowning = points.filter((p) => p.kind === "drowning").length;
    const normal = total - drowning;
    document.getElementById("heatmap-total-detections").textContent = String(total);
    document.getElementById("heatmap-drowning-count").textContent = String(drowning);
    document.getElementById("heatmap-normal-count").textContent = String(normal);
}

function renderHistory() {
    const box = document.getElementById("heatmap-history-content");
    if (!box) return;
    if (points.length === 0) {
        box.innerHTML = '<div class="history-empty">Aucun cas enregistré</div>';
        return;
    }
    box.innerHTML = points.slice().reverse().map((p) => `<div>${p.kind === "drowning" ? "Drowning" : "Normal"} - ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</div>`).join("");
}

function addPoint(lat, lon) {
    const kind = Math.random() > 0.7 ? "drowning" : "normal";
    points.push({ lat, lon, kind, ts: Date.now() });
    const color = kind === "drowning" ? "#ff4d4d" : "#00ff88";
    const marker = L.circleMarker([lat, lon], { radius: 7, color, fillColor: color, fillOpacity: 0.75 }).addTo(map);
    markers.push(marker);
    updateStats();
    renderHistory();
}

function clearPoints() {
    points = [];
    markers.forEach((m) => map.removeLayer(m));
    markers = [];
    updateStats();
    renderHistory();
}

window.addEventListener("DOMContentLoaded", () => {
    map = L.map("heatmap-map").setView(MAP_CENTER, 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
    }).addTo(map);

    map.on("click", (e) => addPoint(e.latlng.lat, e.latlng.lng));
    document.getElementById("heatmap-clear-btn")?.addEventListener("click", clearPoints);
    document.getElementById("heatmap-clear-history-btn")?.addEventListener("click", clearPoints);
});