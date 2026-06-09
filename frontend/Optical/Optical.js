(function () {
    "use strict";

    const RGB_CAMERA_MODES_FALLBACK = [
        { resolution: "1536x864", fps: 120, label: "Très fluide, faible latence" },
        { resolution: "2304x1296", fps: 56, label: "Équilibre qualité + fluidité" },
        { resolution: "1920x1080", fps: 50, label: "Live Full HD" },
        { resolution: "4608x2592", fps: 14, label: "Qualité max (photo)" },
    ];
    const RGB_POLL_BY_RES = {
        "1536x864": 1400,
        "2304x1296": 1900,
        "1920x1080": 1700,
        "4608x2592": 3500,
    };
    const RGB_AI_POLL_MS = 5000;
    const ENABLE_AI_POLL = true;
    const USE_ANNOTATED_STREAM = false;

    let videoOn = false;
    let thermalOn = false;
    let rgbTimer = null;
    let thermalTimer = null;
    let rgbAiTimer = null;
    let useAnnotated = USE_ANNOTATED_STREAM;
    let recOn = true;
    let rgbCameraModes = RGB_CAMERA_MODES_FALLBACK;
    let rgbRes = localStorage.getItem("aquawing_rgb_res") || "2304x1296";
    let rgbPollMs = 1900;
    let camChangeTimer = null;

    function fpsForRes(res) {
        const mode = rgbCameraModes.find((m) => m.resolution === res);
        return mode ? Number(mode.fps) : 30;
    }

    function setButtonText(id, on, label) {
        const el = document.getElementById(id);
        if (el) el.textContent = `${label}: ${on ? "ON" : "OFF"}`;
    }

    function setTogglePressed(id, on) {
        const el = document.getElementById(id);
        if (el) el.setAttribute("aria-pressed", on ? "true" : "false");
    }

    function applyRgbFilters() {
        const img = document.getElementById("optical-video-stream");
        if (!img || img.style.display === "none") return;
        const b = Number(document.getElementById("rgb-brightness")?.value || 50);
        const c = Number(document.getElementById("rgb-contrast")?.value || 50);
        const s = Number(document.getElementById("rgb-saturation")?.value || 50);
        const sh = Number(document.getElementById("rgb-sharpness")?.value || 50);
        const e = Number(document.getElementById("rgb-exposure")?.value || 50);
        const bright = 0.35 + (b / 100) * 1.1;
        const contrast = 0.4 + (c / 100) * 1.2;
        const sat = 0.3 + (s / 100) * 1.4;
        const sharpBoost = 0.85 + (sh / 100) * 0.35;
        const expose = 0.45 + (e / 100) * 1.0;
        img.style.filter = `brightness(${bright * expose}) contrast(${contrast * sharpBoost}) saturate(${sat})`;
    }

    function syncSliderOutputs() {
        document.querySelectorAll(".oc-range").forEach((range) => {
            const id = range.id;
            const out = document.querySelector(`output[for="${id}"]`);
            if (out) {
                if (out.classList.contains("oc-slider-out--deg")) {
                    out.textContent = `${range.value}°C`;
                } else {
                    out.textContent = range.value;
                }
            }
        });
    }

    function clearRgbAiOverlay() {
        const layer = document.getElementById("rgb-ai-overlay");
        if (layer) layer.innerHTML = "";
    }

    function detectionBoxClass(d) {
        const status = d.status || "";
        if (status === "drowning" || d.alert === true || d.behavior === "drowning_risk") {
            return "ov-box ov-box--danger";
        }
        if (status === "swimming" || d.can_swim === true || d.behavior === "normal_swimming") {
            return "ov-box ov-box--safe";
        }
        if (status === "suspicious" || d.behavior === "suspicious") {
            return "ov-box ov-box--warn";
        }
        return "ov-box ov-box--safe";
    }

    function detectionLabel(d) {
        if (d.label) return String(d.label);
        const status = d.status || "";
        if (status === "drowning" || d.behavior === "drowning_risk") return "NE SAIT PAS NAGER";
        if (status === "swimming" || d.behavior === "normal_swimming") return "SAIT NAGER";
        if (status === "suspicious") return "INCERTAIN";
        if (d.behavior === "detected_only") return "PERSONNE";
        return "PERSONNE";
    }

    function renderRgbDetections(data) {
        const layer = document.getElementById("rgb-ai-overlay");
        if (!layer || !videoOn) return;
        layer.innerHTML = "";
        const dets = data?.detections || [];
        if (!dets.length) return;
        dets.forEach((d) => {
            const x = Number(d.x ?? d.left ?? 0);
            const y = Number(d.y ?? d.top ?? 0);
            const w = Number(d.w ?? d.width ?? 0);
            const h = Number(d.h ?? d.height ?? 0);
            const rawConf = d.conf ?? d.confidence ?? d.score ?? 0;
            const conf = rawConf <= 1 ? Math.round(Number(rawConf) * 100) : Math.round(Number(rawConf));
            const box = document.createElement("div");
            box.className = detectionBoxClass(d);
            box.style.left = `${x * 100}%`;
            box.style.top = `${y * 100}%`;
            box.style.width = `${w * 100}%`;
            box.style.height = `${h * 100}%`;
            const label = detectionLabel(d);
            box.textContent = `${label} (${conf}%)`;
            layer.appendChild(box);
        });
    }

    let aiBackendRequested = localStorage.getItem("aquawing_ai_backend") || "auto";

    function backendDisplayName(id) {
        const map = {
            auto: "Auto",
            yolo: "YOLOv8n",
            rfdetr: "RF-DETR",
        };
        return map[id] || String(id);
    }

    function updateAiHint(data) {
        const hint = document.getElementById("rgb-ai-hint");
        if (!hint) return;
        if (!videoOn || !ENABLE_AI_POLL) {
            hint.textContent = "IA arrêtée.";
            return;
        }
        const active = data?.active_backend || data?.detector?.backend || "—";
        const req = data?.requested_backend || aiBackendRequested;
        const ms = data?.last_inference_ms ?? data?.detector?.last_inference_ms;
        const fb = data?.fallback_used;
        const fbReason = data?.fallback_reason;
        const err = data?.error;
        let lines = [
            `Backend actif : ${backendDisplayName(active)}`,
            "IA 2 parties : 1) personne · 2) sait nager / incertain / ne sait pas",
        ];
        if (req !== active) lines.push(`Demandé : ${backendDisplayName(req)}`);
        if (ms != null) lines.push(`Inférence : ${Math.round(ms)} ms`);
        if (fb) {
            lines.push(
                fbReason && fbReason.includes("RF-DETR")
                    ? "RF-DETR unavailable on this Raspberry Pi. Fallback to YOLOv8n."
                    : `Fallback : ${fbReason || "oui"}`
            );
        }
        if (err) lines.push(`Erreur : ${String(err).slice(0, 80)}`);
        hint.textContent = lines.join(" · ");
    }

    function updateAiStatus(data) {
        const el = document.getElementById("status-ai-line");
        if (!el) return;
        if (!videoOn || !ENABLE_AI_POLL) {
            el.textContent = "OFF";
            el.classList.remove("status-ok");
            updateAiHint(null);
            return;
        }
        const n = data?.count ?? (data?.detections?.length || 0);
        const alerts = data?.alert_count ?? (data?.detections || []).filter(
            (d) => d.status === "drowning" || d.alert
        ).length;
        const swimmers = data?.swim_count ?? (data?.detections || []).filter(
            (d) => d.status === "swimming" || d.can_swim
        ).length;
        const unsure = data?.unsure_count ?? (data?.detections || []).filter(
            (d) => d.status === "suspicious"
        ).length;
        const persons = data?.person_count ?? Math.max(0, n - alerts);
        const running = data?.running;
        const ready = data?.ready || data?.detector?.ready;
        const active = data?.active_backend || data?.detector?.backend || "";
        const ms = data?.last_inference_ms ?? data?.detector?.last_inference_ms;
        updateAiHint(data);
        if (data?.error && !n && !ready) {
            el.textContent = `ERROR / ${String(data.error).slice(0, 20)}`;
            el.classList.remove("status-ok");
            return;
        }
        const backendTag = active ? ` ${backendDisplayName(active)}` : "";
        const msTag = ms != null ? ` · ${Math.round(ms)}ms` : "";
        if (running && ready) {
            const parts = [];
            if (swimmers > 0) parts.push(`${swimmers} sait nager`);
            if (unsure > 0) parts.push(`${unsure} incertain`);
            if (alerts > 0) parts.push(`${alerts} ne sait pas`);
            const behaviorTag = parts.length ? ` · ${parts.join(", ")}` : "";
            el.textContent = `LIVE / ${persons} pers.${behaviorTag}${backendTag}${msTag}`;
            el.classList.add("status-ok");
            if (alerts > 0) el.classList.remove("status-ok");
        } else if (running) {
            el.textContent = `LOADING…${backendTag}`;
            el.classList.add("status-ok");
        } else {
            el.textContent = "OFF";
            el.classList.remove("status-ok");
        }
    }

    async function fetchAiBackends() {
        try {
            const r = await fetch("/api/detect/rgb/backends", { cache: "no-store", credentials: "include" });
            if (!r.ok) return null;
            return await r.json();
        } catch (_e) {
            return null;
        }
    }

    function populateAiBackendSelect(info) {
        const sel = document.getElementById("rgb-ai-backend");
        if (!sel) return;
        const active = info?.requested || info?.active || aiBackendRequested;
        aiBackendRequested = active;
        if ([...sel.options].some((o) => o.value === active)) sel.value = active;
        const rfdetrOpt = [...sel.options].find((o) => o.value === "rfdetr");
        if (rfdetrOpt && info?.available && !info.available.includes("rfdetr")) {
            rfdetrOpt.disabled = true;
            rfdetrOpt.textContent = "RF-DETR — unavailable on this Pi";
        } else if (rfdetrOpt) {
            rfdetrOpt.disabled = false;
            rfdetrOpt.textContent = "RF-DETR — High accuracy / PC only";
        }
    }

    async function applyAiBackend(backend) {
        const sel = document.getElementById("rgb-ai-backend");
        const hint = document.getElementById("rgb-ai-hint");
        aiBackendRequested = backend;
        localStorage.setItem("aquawing_ai_backend", backend);

        async function tryPostBackend() {
            const r = await fetch("/api/detect/rgb/backend", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ backend }),
            });
            const data = await r.json().catch(() => ({}));
            return { ok: r.ok, status: r.status, data };
        }

        async function tryStartWithBackend() {
            const r = await fetch("/api/detect/rgb/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ backend }),
            });
            const data = await r.json().catch(() => ({}));
            return { ok: r.ok, status: r.status, data };
        }

        try {
            let result = await tryPostBackend();
            if (!result.ok && result.status === 404) {
                await fetch("/api/detect/rgb/stop", { method: "POST", credentials: "include" }).catch(() => {});
                result = await tryStartWithBackend();
            }
            if (!result.ok) {
                const msg = result.data.detail || `Erreur HTTP ${result.status}`;
                console.warn("AI backend:", msg);
                if (hint) hint.textContent = `Modèle IA : échec (${msg}). Redémarrez ./start_server.sh`;
                if (sel) sel.value = aiBackendRequested;
                return;
            }
            const data = result.data;
            aiBackendRequested = data.requested_backend || backend;
            if (sel) sel.value = aiBackendRequested;
            updateAiStatus(data);
            if (hint) {
                hint.textContent = `Modèle IA : ${backendDisplayName(data.active_backend || aiBackendRequested)} actif.`;
            }
            if (videoOn && ENABLE_AI_POLL && !data.running) {
                await ensureAiWorker();
            }
        } catch (e) {
            console.warn("AI backend:", e);
            if (hint) hint.textContent = "Modèle IA : erreur réseau — vérifiez que le serveur tourne.";
            if (sel) sel.value = aiBackendRequested;
        }
    }

    function onAiBackendChange() {
        const sel = document.getElementById("rgb-ai-backend");
        if (!sel) return;
        applyAiBackend(sel.value);
    }

    async function syncAiFromServer() {
        const sel = document.getElementById("rgb-ai-backend");
        if (sel && [...sel.options].some((o) => o.value === aiBackendRequested)) {
            sel.value = aiBackendRequested;
        }
        const [backends, status] = await Promise.all([
            fetchAiBackends(),
            fetch("/api/detect/rgb/status", { cache: "no-store", credentials: "include" })
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null),
        ]);
        const hint = document.getElementById("rgb-ai-hint");
        if (backends) {
            populateAiBackendSelect(backends);
        } else if (hint) {
            hint.textContent =
                "API IA ancienne — redémarrez ./start_server.sh puis Ctrl+F5. Sélection locale enregistrée.";
        }
        if (status) {
            aiBackendRequested = status.requested_backend || aiBackendRequested;
            populateAiBackendSelect({ requested: aiBackendRequested, available: backends?.available });
            updateAiStatus(status);
        }
    }

    async function ensureAiWorker() {
        if (!ENABLE_AI_POLL) return;
        try {
            await fetch("/api/detect/rgb/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ backend: aiBackendRequested }),
            });
        } catch (_e) {
            /* server may still return detections */
        }
    }

    async function stopAiWorker() {
        try {
            await fetch("/api/detect/rgb/stop", { method: "POST" });
        } catch (_e) {
            /* ignore */
        }
    }

    async function pollRgbDetections() {
        if (!videoOn || !ENABLE_AI_POLL) return;
        try {
            const res = await fetch(`/api/detect/rgb/status?t=${Date.now()}`, { cache: "no-store" });
            if (!res.ok) return;
            const data = await res.json();
            renderRgbDetections(data);
            updateAiStatus(data);
        } catch (_e) {
            /* overlay optional */
        }
    }

    function startRgbAiPolling() {
        if (!ENABLE_AI_POLL) return;
        if (rgbAiTimer) clearInterval(rgbAiTimer);
        ensureAiWorker().then(() => {
            pollRgbDetections();
            rgbAiTimer = setInterval(pollRgbDetections, RGB_AI_POLL_MS);
        });
    }

    function stopRgbAiPolling() {
        if (rgbAiTimer) {
            clearInterval(rgbAiTimer);
            rgbAiTimer = null;
        }
        clearRgbAiOverlay();
        updateAiStatus(null);
        stopAiWorker();
    }

    function formatResLabel(res) {
        return String(res).replace(/x/gi, "×");
    }

    function modeForRes(res) {
        return rgbCameraModes.find((m) => m.resolution === res);
    }

    function formatResOptionLabel(mode) {
        const [w, h] = mode.resolution.split("x");
        const suffix = mode.label ? ` — ${mode.label}` : "";
        return `${w}×${h}${suffix} (${mode.fps} FPS)`;
    }

    function populateResolutionSelect() {
        const sel = document.getElementById("rgb-resolution");
        if (!sel || !rgbCameraModes.length) return;
        sel.innerHTML = "";
        rgbCameraModes.forEach((m) => {
            const opt = document.createElement("option");
            opt.value = m.resolution;
            opt.textContent = formatResOptionLabel(m);
            sel.appendChild(opt);
        });
        if ([...sel.options].some((o) => o.value === rgbRes)) sel.value = rgbRes;
    }

    function pollMsForMode() {
        return RGB_POLL_BY_RES[rgbRes] || 2500;
    }

    function updateResolutionUi() {
        const fps = fpsForRes(rgbRes);
        const meta = document.getElementById("rgb-meta-res");
        if (meta) meta.textContent = formatResLabel(rgbRes);
        const metaFps = document.getElementById("rgb-meta-fps");
        if (metaFps) metaFps.textContent = `${fps} FPS`;
        const sel = document.getElementById("rgb-resolution");
        if (sel && [...sel.options].some((o) => o.value === rgbRes)) sel.value = rgbRes;
        const hint = document.getElementById("rgb-resolution-hint");
        if (hint) {
            const mode = modeForRes(rgbRes);
            hint.textContent = mode
                ? `${mode.label} — ${formatResLabel(rgbRes)} @ ${fps} FPS sur rpicam-vid.`
                : "4 modes natifs — résolution + FPS appliqués sur rpicam-vid.";
        }
    }

    async function fetchRgbCameraConfig() {
        try {
            const r = await fetch("/api/camera/rgb/config", { cache: "no-store", credentials: "include" });
            if (!r.ok) return null;
            return await r.json();
        } catch (_e) {
            return null;
        }
    }

    async function postRgbCameraConfig(body) {
        const r = await fetch("/api/camera/rgb/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${r.status}`);
        }
        return r.json();
    }

    function ensureValidStoredMode() {
        if (!rgbCameraModes.some((m) => m.resolution === rgbRes)) {
            rgbRes = "2304x1296";
        }
    }

    async function syncRgbCameraFromServer() {
        const cfg = await fetchRgbCameraConfig();
        if (!cfg) return;
        if (cfg.options && cfg.options.modes && cfg.options.modes.length) {
            rgbCameraModes = cfg.options.modes;
            populateResolutionSelect();
        }
        ensureValidStoredMode();
        if (cfg.resolution) rgbRes = cfg.resolution;
        localStorage.setItem("aquawing_rgb_res", rgbRes);
        rgbPollMs = pollMsForMode();
        updateResolutionUi();
    }

    async function refreshRgbStatsMeta() {
        try {
            const r = await fetch("/video/stats", { cache: "no-store" });
            if (!r.ok) return;
            const s = await r.json();
            const fpsLine = document.getElementById("status-fps-line");
            if (fpsLine && videoOn) {
                fpsLine.textContent = `${s.fps || fpsForRes(rgbRes)} FPS / rpicam`;
                fpsLine.classList.add("status-ok");
            }
        } catch (_e) {
            /* ignore */
        }
    }

    function streamPath() {
        const base = useAnnotated ? "/video/annotated" : "/video";
        return `${base}?t=${Date.now()}`;
    }

    function restartRgbPolling() {
        const img = document.getElementById("optical-video-stream");
        if (!img || !videoOn) return;
        const refresh = () => {
            img.src = streamPath();
        };
        refresh();
        if (rgbTimer) clearInterval(rgbTimer);
        rgbTimer = setInterval(refresh, rgbPollMs);
    }

    async function applyRgbCaptureMode(resolution) {
        if (!resolution || resolution === rgbRes) return;
        const nextFps = fpsForRes(resolution);

        const statusRgb = document.querySelector(".optical-status-cards .status-card:nth-child(2) .status-val");
        if (statusRgb && videoOn) {
            statusRgb.textContent = `SWITCH / ${formatResLabel(resolution)} @ ${nextFps}…`;
        }

        try {
            const cfg = await postRgbCameraConfig({ resolution });
            rgbRes = cfg.resolution || resolution;
        } catch (e) {
            console.warn("RGB capture mode:", e);
            const sel = document.getElementById("rgb-resolution");
            if (sel) sel.value = rgbRes;
            return;
        }

        rgbPollMs = pollMsForMode();
        localStorage.setItem("aquawing_rgb_res", rgbRes);
        updateResolutionUi();
        await refreshRgbStatsMeta();

        if (!videoOn) return;
        restartRgbPolling();
        if (statusRgb) {
            const aiTag = useAnnotated ? " + IA" : "";
            statusRgb.textContent = `LIVE / ${formatResLabel(rgbRes)} @ ${fpsForRes(rgbRes)}${aiTag}`;
            statusRgb.classList.add("status-ok");
        }
    }

    function onRgbResolutionChange() {
        const sel = document.getElementById("rgb-resolution");
        if (!sel) return;
        const next = sel.value;
        if (camChangeTimer) clearTimeout(camChangeTimer);
        camChangeTimer = setTimeout(() => applyRgbCaptureMode(next), 350);
    }

    function setVideo(on) {
        videoOn = !!on;
        setButtonText("optical-video-toggle", videoOn, "RGB");
        setButtonText("optical-video-toggle-main", videoOn, "RGB");
        setTogglePressed("optical-video-toggle", videoOn);
        const img = document.getElementById("optical-video-stream");
        const ph = document.getElementById("optical-video-placeholder");
        const statusRgb = document.querySelector(".optical-status-cards .status-card:nth-child(2) .status-val");

        if (!img || !ph) return;
        if (!videoOn) {
            if (rgbTimer) {
                clearInterval(rgbTimer);
                rgbTimer = null;
            }
            stopRgbAiPolling();
            img.style.display = "none";
            img.src = "";
            img.style.filter = "";
            ph.style.display = "flex";
            if (statusRgb) {
                statusRgb.textContent = "OFF";
                statusRgb.classList.remove("status-ok");
            }
            return;
        }

        useAnnotated = USE_ANNOTATED_STREAM;

        const refresh = () => {
            img.src = streamPath();
        };
        img.onload = () => {
            img.style.display = "block";
            ph.style.display = "none";
            applyRgbFilters();
            if (statusRgb) {
                const aiTag = useAnnotated ? " + IA" : "";
                statusRgb.textContent = `LIVE / ${formatResLabel(rgbRes)} @ ${fpsForRes(rgbRes)}${aiTag}`;
                statusRgb.classList.add("status-ok");
            }
        };
        img.onerror = async () => {
            if (useAnnotated) {
                useAnnotated = false;
                try {
                    await fetch("/video/restart", { method: "POST" });
                } catch (_e) {
                    /* ignore */
                }
                refresh();
                return;
            }
            img.style.display = "none";
            ph.style.display = "flex";
            if (statusRgb) {
                statusRgb.textContent = "ERROR / No signal";
                statusRgb.classList.remove("status-ok");
            }
        };
        refresh();
        if (rgbTimer) clearInterval(rgbTimer);
        rgbTimer = setInterval(refresh, rgbPollMs);
        if (ENABLE_AI_POLL) startRgbAiPolling();
    }

    function setThermal(on) {
        thermalOn = !!on;
        setButtonText("optical-thermal-toggle", thermalOn, "Thermal");
        setButtonText("optical-thermal-toggle-main", thermalOn, "Thermal");
        setTogglePressed("optical-thermal-toggle", thermalOn);
        const img = document.getElementById("optical-thermal-stream");
        const ph = document.getElementById("optical-thermal-placeholder");
        const statusTh = document.getElementById("status-thermal-line");

        if (!img || !ph) return;
        if (!thermalOn) {
            if (thermalTimer) {
                clearInterval(thermalTimer);
                thermalTimer = null;
            }
            img.style.display = "none";
            img.src = "";
            ph.style.display = "flex";
            if (statusTh) {
                statusTh.textContent = "OFF";
                statusTh.classList.remove("status-ok");
            }
            return;
        }

        const refresh = () => {
            img.src = `/thermal?t=${Date.now()}`;
        };
        img.onload = () => {
            img.style.display = "block";
            ph.style.display = "none";
            if (statusTh) {
                statusTh.textContent = "LIVE / 640×480 @ 30 FPS";
                statusTh.classList.add("status-ok");
            }
        };
        img.onerror = () => {
            img.style.display = "none";
            ph.style.display = "flex";
            if (statusTh) {
                statusTh.textContent = "ERROR / No signal";
                statusTh.classList.remove("status-ok");
            }
        };
        refresh();
        if (thermalTimer) clearInterval(thermalTimer);
        thermalTimer = setInterval(refresh, 1200);
    }

    function updateThermalMeta() {
        const pal = document.getElementById("thermal-palette");
        const chip = document.getElementById("thermal-palette-chip");
        const statPal = document.getElementById("thermal-stat-palette");
        const label =
            pal && pal.options[pal.selectedIndex]
                ? pal.options[pal.selectedIndex].text
                : "Ironbow";
        if (chip) chip.textContent = `PALETTE: ${label.toUpperCase()}`;
        if (statPal) statPal.textContent = label;

        const mn = Number(document.getElementById("thermal-min")?.value ?? 5);
        const mx = Number(document.getElementById("thermal-max")?.value ?? 150);
        const rangeChip = document.getElementById("thermal-range-chip");
        if (rangeChip) {
            rangeChip.textContent = `${mn}°C — ${mx}°C`;
        }

        syncSliderOutputs();

        const g = Number(document.getElementById("thermal-gain")?.value ?? 67);
        const jitter = Math.sin(Date.now() / 8000) * 1.5;
        const maxT = Math.min(mx, 72.4 + jitter * (g / 80));
        const minT = Math.max(mn, 9.1 - jitter * 0.8);
        const center = Math.min(maxT - 10, Math.max(minT + 10, (maxT + minT) / 2 + jitter));
        document.getElementById("thermal-stat-max").textContent = `${maxT.toFixed(1)}°C`;
        document.getElementById("thermal-stat-min").textContent = `${minT.toFixed(1)}°C`;
        document.getElementById("thermal-stat-center").textContent = `${center.toFixed(1)}°C`;
        const spot = document.getElementById("thermal-spot-label");
        if (spot) spot.textContent = `${center.toFixed(1)}°C`;
    }

    function tickTimestamp() {
        const el = document.getElementById("rgb-ov-ts");
        if (!el) return;
        const d = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        el.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    }

    function wirePresets() {
        const presets = document.querySelectorAll(".oc-preset");
        presets.forEach((btn) => {
            btn.addEventListener("click", () => {
                presets.forEach((b) => b.classList.remove("is-active"));
                btn.classList.add("is-active");
                const preset = btn.getAttribute("data-preset");
                const map = {
                    auto: [58, 52, 61, 49, 44],
                    lowlight: [72, 48, 45, 40, 65],
                    day: [50, 55, 62, 55, 42],
                    night: [62, 44, 38, 35, 55],
                };
                const vals = map[preset] || map.auto;
                const ids = ["rgb-brightness", "rgb-contrast", "rgb-saturation", "rgb-sharpness", "rgb-exposure"];
                ids.forEach((id, i) => {
                    const r = document.getElementById(id);
                    if (r) r.value = String(vals[i]);
                });
                syncSliderOutputs();
                applyRgbFilters();
            });
        });
    }

    function wireToolbar() {
        const vp = document.getElementById("rgb-feed-viewport");
        const recInd = document.getElementById("feed-rec-indicator");
        const btnRec = document.getElementById("btn-record-toggle");

        document.getElementById("btn-crosshair")?.addEventListener("click", (e) => {
            e.preventDefault();
            const b = document.getElementById("btn-crosshair");
            const on = b.classList.toggle("is-active");
            if (vp) vp.classList.toggle("tool-crosshair", on);
        });

        document.getElementById("btn-grid")?.addEventListener("click", (e) => {
            e.preventDefault();
            const b = document.getElementById("btn-grid");
            const on = b.classList.toggle("is-active");
            if (vp) vp.classList.toggle("tool-grid", on);
        });

        document.getElementById("btn-stabilization")?.addEventListener("click", (e) => {
            e.preventDefault();
            const b = document.getElementById("btn-stabilization");
            const on = b.classList.toggle("is-active");
            if (vp) vp.classList.toggle("tool-stabilize", on);
        });

        btnRec?.addEventListener("click", (e) => {
            e.preventDefault();
            recOn = !recOn;
            if (recInd) recInd.classList.toggle("off", !recOn);
            btnRec.classList.toggle("is-active", recOn);
        });

        document.getElementById("btn-snapshot")?.addEventListener("click", (e) => {
            e.preventDefault();
            const img = document.getElementById("optical-video-stream");
            if (img?.src && videoOn) {
                window.open(`/video?res=${encodeURIComponent(rgbRes)}&t=${Date.now()}`, "_blank");
            }
        });
    }

    window.addEventListener("DOMContentLoaded", () => {
        const videoBtns = ["optical-video-toggle", "optical-video-toggle-main"];
        const thermalBtns = ["optical-thermal-toggle", "optical-thermal-toggle-main"];
        videoBtns.forEach((id) => {
            document.getElementById(id)?.addEventListener("click", () => setVideo(!videoOn));
        });
        thermalBtns.forEach((id) => {
            document.getElementById(id)?.addEventListener("click", () => setThermal(!thermalOn));
        });

        document.querySelectorAll(".oc-range[id^=\"rgb-\"]").forEach((range) => {
            range.addEventListener("input", () => {
                syncSliderOutputs();
                applyRgbFilters();
            });
        });
        document.querySelectorAll(".oc-range[id^=\"thermal-\"]").forEach((range) => {
            range.addEventListener("input", () => updateThermalMeta());
        });
        document.getElementById("thermal-palette")?.addEventListener("change", () => updateThermalMeta());

        ensureValidStoredMode();
        populateResolutionSelect();
        document.getElementById("rgb-resolution")?.addEventListener("change", onRgbResolutionChange);
        document.getElementById("rgb-ai-backend")?.addEventListener("change", onAiBackendChange);
        rgbPollMs = pollMsForMode();
        updateResolutionUi();

        syncAiFromServer();

        wirePresets();
        wireToolbar();
        syncSliderOutputs();

        const vp = document.getElementById("rgb-feed-viewport");
        if (vp && document.getElementById("btn-crosshair")?.classList.contains("is-active")) {
            vp.classList.add("tool-crosshair");
        }

        syncRgbCameraFromServer().finally(() => {
            setVideo(true);
            refreshRgbStatsMeta();
        });
        setThermal(false);
        tickTimestamp();
        setInterval(tickTimestamp, 1000);
        updateThermalMeta();
        setInterval(updateThermalMeta, 2000);

        const jitterMs = () => {
            const base = 78 + Math.round(Math.sin(Date.now() / 3000) * 10);
            const el = document.getElementById("status-latency-line");
            if (el) el.textContent = `${base} ms / Good`;
            const fps = document.getElementById("status-fps-line");
            if (fps && videoOn && thermalOn) fps.textContent = "30 FPS / Stable";
        };
        jitterMs();
        setInterval(jitterMs, 1500);
        setInterval(refreshRgbStatsMeta, 4000);

        document.querySelector(".oc-btn-calibrate")?.addEventListener("click", (e) => {
            e.preventDefault();
            updateThermalMeta();
        });
    });
})();
