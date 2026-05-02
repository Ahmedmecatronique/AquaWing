(function () {
    "use strict";

    const MAP_CENTER = [36.8065, 10.1815];
    /** @type {L.Map|null} */
    let map = null;
    /** @type {any} */
    let heatLayer = null;
    /** @type {Array<{ marker: unknown }>} */
    const markerObjs = [];

    /** @type {Array<{ lat: number, lon: number, level: string, ts: number, conf: number, zone: string, id: string }>} */
    let points = [];

    /** @type {{ normal: boolean, elevated: boolean, victim: boolean, moderate: boolean }} */
    /** Affiche tous les niveaux ou seulement les cas non normaux */
    let historyCriticalOnly = false;
    let expandedHistory = false;

    let gaugeChart = null;
    let trendChart = null;

    const trendLabels = ["12:00", "12:05", "12:10", "12:15", "12:20", "12:25", "12:30"];
    const trendData = [72, 75, 78, 74, 80, 84, 86];

    const ZONE_NAMES = [
        "Lagune Nord",
        "Jetée Sud",
        "Zone portuaire A",
        "Pointe Radar",
        "Baie maritime",
        "Chenal Est",
        "Récif surveillance",
        "Centre côtier",
    ];

    function pickZone(lat, lon) {
        const h = (((lat * 9973 + lon * 8121) >>> 0) % ZONE_NAMES.length) | 0;
        return ZONE_NAMES[h];
    }

    function classifyLevel() {
        const x = Math.random();
        if (x < 0.1) return "victim";
        if (x < 0.28) return "elevated";
        if (x < 0.45) return "moderate";
        return "normal";
    }

    function heatIntensity(level) {
        if (level === "victim") return 1;
        if (level === "elevated") return 0.88;
        if (level === "moderate") return 0.58;
        return 0.32;
    }

    function badgeHtml(level) {
        const map = {
            normal: ["Normal", "hm-badge hm-badge--normal", "●"],
            moderate: ["Modéré", "hm-badge hm-badge--moderate", "▲"],
            elevated: ["Élevé", "hm-badge hm-badge--elevated", "⚠"],
            victim: ["Victime", "hm-badge hm-badge--victim", "◉"],
        };
        const m = map[level] || map.normal;
        return `<span class="${m[1]}">${m[2]} ${m[0]}</span>`;
    }

    function refreshHeat() {
        if (!heatLayer || typeof L === "undefined" || !L.heatLayer) return;
        const pts = points.map((p) => [p.lat, p.lon, heatIntensity(p.level)]);
        heatLayer.setLatLngs(pts.length ? pts : []);
    }

    function addMarker(lat, lon, level) {
        const colors = {
            victim: "#ff3355",
            elevated: "#ff8a00",
            moderate: "#ffcc33",
            normal: "#4488ff",
        };
        const c = colors[level] || colors.normal;
        const innerSvg =
            level === "victim"
                ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="7" r="3" stroke="white" stroke-width="1.4"/><path d="M9 21c0-3 6-8 6-8s3 5 3 8" stroke="white" stroke-width="1.4"/></svg>`
                : `<span style="color:#fff;font-size:13px;line-height:1">●</span>`;
        const glow =
            level === "victim" ? `box-shadow:0 0 18px rgba(255,51,85,0.85);` : `box-shadow:0 0 12px rgba(255,138,0,0.35);`;

        const html = `<div class="hm-pin-shell" style="width:38px;height:38px;display:flex;align-items:center;justify-content:center;background:${c};border:2px solid rgba(255,255,255,0.9);border-radius:50%;${glow}">${innerSvg}</div>`;
        if (typeof L.divIcon !== "function") return null;
        const icon = L.divIcon({ html, iconSize: [38, 38], className: "" });
        const m = L.marker([lat, lon], { icon, riseOnHover: true }).addTo(map);
        markerObjs.push({ marker: m });
    }

    function computeKpis() {
        const victims = points.filter((p) => p.level === "victim").length;
        const elevatedN = points.filter((p) => p.level === "elevated").length + points.filter((p) => p.level === "moderate").length;
        const normal = points.filter((p) => p.level === "normal").length;
        return {
            total: points.length,
            victims,
            elevated: elevatedN,
            normal,
        };
    }

    function clamp(n, lo, hi) {
        return Math.min(hi, Math.max(lo, n));
    }

    function fmtTime(ms) {
        const d = new Date(ms);
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function pad(n) {
        return String(n).padStart(2, "0");
    }

    function detectionRatePct(k) {
        if (k.total === 0) return 87;
        return clamp(Math.round((k.normal / k.total) * 62 + (1 - k.victims / k.total) * 38), 55, 99);
    }

    function updateGauge(pct) {
        if (!gaugeChart) return;
        gaugeChart.data.datasets[0].data = [pct, 100 - pct];
        gaugeChart.update("none");
        const el = document.getElementById("hm-global-pct");
        if (el) el.textContent = `${pct}%`;
    }

    function updateTrendChart() {
        if (!trendChart) return;
        const ds = trendChart.data.datasets[0];
        const v = [...ds.data];
        v.shift();
        const last = v[v.length - 1] ?? 82;
        v.push(clamp(last + Math.random() * 7 - 0.8, 45, 100));
        ds.data = v;
        trendChart.update("none");
    }

    function initChartsOnce() {
        if (typeof Chart === "undefined") return;
        const gEl = document.getElementById("hm-gauge-chart");
        const tEl = document.getElementById("hm-trend-chart");
        if (gEl) {
            const ctx = gEl.getContext("2d");
            if (gaugeChart) gaugeChart.destroy();
            gaugeChart = new Chart(ctx, {
                type: "doughnut",
                data: {
                    labels: ["d", "r"],
                    datasets: [
                        {
                            data: [87, 13],
                            backgroundColor: ["#00e5ff", "rgba(255,255,255,0.07)"],
                            borderWidth: 0,
                            circumference: 220,
                            rotation: -124,
                            hoverOffset: 0,
                            cutout: "78%",
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    animation: false,
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                },
            });
        }

        if (tEl) {
            const ctx2 = tEl.getContext("2d");
            const gh = Math.max(tEl.parentElement?.clientHeight || 120, 96);
            const grad = ctx2.createLinearGradient(0, 0, 0, gh);
            grad.addColorStop(0, "rgba(0, 229, 255, 0.22)");
            grad.addColorStop(1, "rgba(0, 229, 255, 0)");
            if (trendChart) trendChart.destroy();
            trendChart = new Chart(ctx2, {
                type: "line",
                data: {
                    labels: [...trendLabels],
                    datasets: [
                        {
                            label: "",
                            data: [...trendData],
                            fill: true,
                            backgroundColor: grad,
                            borderColor: "#00e5ff",
                            borderWidth: 2,
                            tension: 0.42,
                            pointRadius: 0,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: {
                            ticks: { color: "rgba(240,245,252,0.45)", font: { size: 9 }, maxTicksLimit: 8 },
                            grid: { color: "rgba(255,255,255,0.05)" },
                        },
                        y: {
                            min: 35,
                            max: 105,
                            ticks: { color: "rgba(240,245,252,0.38)", font: { size: 9 } },
                            grid: { color: "rgba(255,255,255,0.05)" },
                        },
                    },
                },
            });
            const lineWrap = tEl.closest(".hm-line-wrap");
            if (lineWrap && typeof ResizeObserver !== "undefined") {
                new ResizeObserver(() => {
                    try {
                        trendChart.resize();
                    } catch (_e) {
                        /* noop */
                    }
                }).observe(lineWrap);
            }
        }
    }

    function renderHistory() {
        const tbody = document.getElementById("hm-history-body");
        const wrap = document.getElementById("heatmap-history-content");
        const empty = document.getElementById("hm-history-empty");

        if (!tbody || !wrap) return;

        const rows = points.slice().reverse();
        const visible = rows.filter((p) => !(historyCriticalOnly && p.level === "normal"));
        const limit = expandedHistory ? 200 : 10;
        const slice = visible.slice(0, limit);

        tbody.innerHTML = slice
            .map(
                (p) => `
            <tr>
                <td>${fmtTime(p.ts)}</td>
                <td class="hm-zone-cell">
                    <div class="hm-zone-name">${p.zone}</div>
                    <div class="hm-zone-coords">${p.lat.toFixed(5)} °N, ${p.lon.toFixed(5)} °E</div>
                </td>
                <td>${p.conf}%</td>
                <td>${badgeHtml(p.level)}</td>
            </tr>`
            )
            .join("");

        wrap.classList.toggle("has-rows", slice.length > 0);
        if (empty) {
            if (slice.length) {
                empty.style.display = "none";
            } else {
                empty.style.display = "flex";
                empty.textContent =
                    points.length === 0
                        ? "Aucun cas enregistré"
                        : historyCriticalOnly
                          ? "Aucun cas critique dans le filtre"
                          : "Aucun cas enregistré";
            }
        }
    }

    function renderCriticalZones() {
        const risky = points.filter((p) => p.level !== "normal");
        const cells = new Set(risky.map((p) => `${p.lat.toFixed(2)}_${p.lon.toFixed(2)}`));
        const zoneCount = risky.length === 0 ? 0 : Math.max(cells.size, 1);

        const byCell = {};
        risky.forEach((p) => {
            const key = `${p.lat.toFixed(2)}_${p.lon.toFixed(2)}`;
            if (!byCell[key]) byCell[key] = { zone: p.zone, score: 0 };
            let s = 1;
            if (p.level === "victim") s = 10;
            else if (p.level === "elevated") s = 5;
            else if (p.level === "moderate") s = 3;
            byCell[key].score += s;
        });
        const tops = Object.values(byCell)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

        const num = document.getElementById("hm-critical-zones-num");
        if (num) num.textContent = String(Math.min(zoneCount, 99));

        const list = document.getElementById("hm-critical-list");
        if (!list) return;

        if (!tops.length) {
            list.innerHTML = points.length === 0 ? "" : `<li>Aucune zone critique suivie</li>`;
            return;
        }
        list.innerHTML = tops.map((t) => `<li><strong>${t.zone}</strong> — score ${Math.round(t.score)}</li>`).join("");
    }

    function renderLastAlert() {
        const rev = [...points].reverse();
        const lastRisk = rev.find((p) => p.level !== "normal") || rev[0];
        const place = document.getElementById("hm-last-place");
        const coords = document.getElementById("hm-last-coords");
        const confEl = document.getElementById("hm-last-conf");
        const ic = document.getElementById("hm-last-icon");
        const card = document.getElementById("hm-last-alert-card");

        if (!lastRisk) {
            if (place) place.textContent = "—";
            if (coords) coords.textContent = "—";
            if (confEl) confEl.textContent = "—";
            return;
        }
        if (place) place.textContent = lastRisk.zone;
        if (coords) coords.textContent = `${lastRisk.lat.toFixed(5)} °N · ${lastRisk.lon.toFixed(5)} °E`;
        if (confEl) confEl.textContent = `${Math.round(lastRisk.conf)} % confiance`;
        if (ic) {
            if (lastRisk.level === "victim") {
                ic.classList.remove("hm-last-icon--soft");
                ic.style.boxShadow = "0 0 28px rgba(255,51,85,0.45)";
                ic.style.borderColor = "rgba(255,51,85,0.55)";
            } else {
                ic.classList.add("hm-last-icon--soft");
                ic.style.borderColor = "rgba(255,138,0,0.45)";
                ic.style.boxShadow = "0 0 20px rgba(255,138,0,0.25)";
            }
        }
    }

    function updateStats() {
        const k = computeKpis();
        const tEl = document.getElementById("heatmap-total-detections");
        if (tEl) tEl.textContent = String(k.total);
        const vEl = document.getElementById("heatmap-kpi-victims");
        if (vEl) vEl.textContent = String(k.victims);
        const eEl = document.getElementById("heatmap-kpi-elevated");
        if (eEl) eEl.textContent = String(k.elevated);
        const nEl = document.getElementById("heatmap-normal-count");
        if (nEl) nEl.textContent = String(k.normal);
        renderHistory();
        renderCriticalZones();
        renderLastAlert();
        updateGauge(detectionRatePct(k));
    }

    function addPoint(lat, lon) {
        const level = classifyLevel();
        const conf = Math.round(70 + Math.random() * 28);
        const zone = pickZone(lat, lon);
        const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        points.push({ lat, lon, level, ts: Date.now(), conf, zone, id });
        addMarker(lat, lon, level);
        refreshHeat();
        updateStats();
        updateTrendChart();
    }

    function clearAll() {
        points = [];
        markerObjs.forEach((o) => {
            try {
                map.removeLayer(o.marker);
            } catch (_e) {
                /* noop */
            }
        });
        markerObjs.length = 0;
        refreshHeat();
        updateStats();
    }

    window.addEventListener("DOMContentLoaded", () => {
        map = L.map("heatmap-map", { zoomControl: false }).setView(MAP_CENTER, 15);

        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
            attribution: "Tiles © Esri",
            maxZoom: 19,
        }).addTo(map);

        if (typeof L.heatLayer === "function") {
            heatLayer = L.heatLayer([], {
                radius: 72,
                blur: 62,
                maxZoom: 17,
                minOpacity: 0.28,
                max: 0.95,
                gradient: {
                    0: "rgba(30,79,170,0.08)",
                    0.35: "#00e5ff",
                    0.55: "#ffcc33",
                    0.75: "#ff8a00",
                    1.0: "#ff2244",
                },
            }).addTo(map);
        }

        function scheduleMapResize() {
            if (!map) return;
            requestAnimationFrame(() => {
                map.invalidateSize({ animate: false });
                requestAnimationFrame(() => map.invalidateSize({ animate: false }));
            });
        }
        scheduleMapResize();
        window.addEventListener("resize", scheduleMapResize);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") scheduleMapResize();
        });
        const mapWrap = document.getElementById("heatmap-map");
        if (mapWrap && typeof ResizeObserver !== "undefined") {
            new ResizeObserver(() => scheduleMapResize()).observe(mapWrap);
        }

        map.on("click", (e) => addPoint(e.latlng.lat, e.latlng.lng));

        document.getElementById("heatmap-clear-btn")?.addEventListener("click", () => clearAll());
        document.getElementById("heatmap-clear-history-btn")?.addEventListener("click", () => clearAll());

        document.getElementById("hm-zoom-in")?.addEventListener("click", () => map.zoomIn());
        document.getElementById("hm-zoom-out")?.addEventListener("click", () => map.zoomOut());
        document.getElementById("hm-locate")?.addEventListener("click", () => map.setView(MAP_CENTER, 15));

        document.getElementById("hm-focus-map")?.addEventListener("click", (ev) => {
            ev.preventDefault();
            const last = points[points.length - 1];
            if (!last || !map) return;
            map.setView([last.lat, last.lon], 17);
        });

        document.getElementById("hm-filter-toggle")?.addEventListener("click", () => {
            historyCriticalOnly = !historyCriticalOnly;
            const fb = document.getElementById("hm-filter-toggle");
            if (fb) fb.textContent = historyCriticalOnly ? "Tout afficher" : "Filtrer";
            renderHistory();
        });

        document.getElementById("hm-show-more")?.addEventListener("click", () => {
            expandedHistory = !expandedHistory;
            const b = document.getElementById("hm-show-more");
            if (b) b.textContent = expandedHistory ? "Voir moins ▴" : "Voir plus ▾";
            renderHistory();
        });

        initChartsOnce();
        updateStats();
    });
})();
