(function () {
    "use strict";

    const RGB_CAMERA_MODES_FALLBACK = [
        { resolution: "1536x864", max_fps: 120, label: "Très fluide, faible latence", fps_options: [15, 30, 60, 90, 120] },
        { resolution: "2304x1296", max_fps: 56, label: "Équilibre qualité + fluidité", fps_options: [15, 24, 30, 40, 50, 56] },
        { resolution: "1920x1080", max_fps: 50, label: "Live Full HD", fps_options: [15, 24, 30, 40, 50] },
        { resolution: "4608x2592", max_fps: 14, label: "Qualité max (photo)", fps_options: [5, 10, 14] },
    ];
    const RGB_POLL_BY_RES = {
        "1536x864": 1800,
        "2304x1296": 2800,
        "1920x1080": 2500,
        "4608x2592": 5500,
    };
    const RGB_POLL_BY_FPS = {
        5: 4500,
        10: 4000,
        14: 3800,
        15: 3200,
        24: 2800,
        30: 2500,
        40: 2200,
        50: 2000,
        56: 1900,
        60: 1800,
        90: 1600,
        120: 1400,
    };
    const RGB_AI_POLL_MS = 4000;
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
    let rgbFps = parseInt(localStorage.getItem("aquawing_rgb_fps") || "30", 10) || 30;
    let rgbPollMs = 3200;
    let camChangeTimer = null;

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
            const label = String(d.label ?? d.class ?? "person").toUpperCase();
            const box = document.createElement("div");
            box.className = "ov-box ov-box--cyan";
            box.style.left = `${x * 100}%`;
            box.style.top = `${y * 100}%`;
            box.style.width = `${w * 100}%`;
            box.style.height = `${h * 100}%`;
            box.textContent = `${label} (${conf}%)`;
            layer.appendChild(box);
        });
    }

    function updateAiStatus(data) {
        const el = document.getElementById("status-ai-line");
        if (!el) return;
        if (!videoOn || !ENABLE_AI_POLL) {
            el.textContent = "OFF";
            el.classList.remove("status-ok");
            return;
        }
        const n = data?.count ?? (data?.detections?.length || 0);
        const running = data?.running || data?.detector?.ready;
        if (data?.error && !n) {
            el.textContent = `ERROR / ${String(data.error).slice(0, 24)}`;
            el.classList.remove("status-ok");
            return;
        }
        el.textContent = running ? `LIVE / ${n} object(s)` : `LOADING… / ${n} object(s)`;
        el.classList.add("status-ok");
    }

    async function ensureAiWorker() {
        if (!ENABLE_AI_POLL) return;
        try {
            await fetch("/api/detect/rgb/start", { method: "POST" });
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
            const res = await fetch(`/api/detect/rgb?t=${Date.now()}`, { cache: "no-store" });
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

    function fpsOptionsForRes(res) {
        const mode = modeForRes(res);
        return mode && mode.fps_options ? mode.fps_options : [15, 30];
    }

    function formatResOptionLabel(mode) {
        const [w, h] = mode.resolution.split("x");
        const suffix = mode.label ? ` — ${mode.label}` : "";
        return `${w}×${h}${suffix} (≤${mode.max_fps} FPS)`;
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

    function pickValidFps(res, preferred) {
        const opts = fpsOptionsForRes(res);
        const want = Number(preferred);
        if (opts.includes(want)) return want;
        const lower = opts.filter((f) => f <= want);
        return lower.length ? Math.max(...lower) : opts[opts.length - 1];
    }

    function populateFpsSelect(res, preferredFps) {
        const sel = document.getElementById("rgb-fps");
        if (!sel) return;
        const opts = fpsOptionsForRes(res);
        sel.innerHTML = "";
        opts.forEach((f) => {
            const opt = document.createElement("option");
            opt.value = String(f);
            opt.textContent = `${f} FPS`;
            sel.appendChild(opt);
        });
        rgbFps = pickValidFps(res, preferredFps != null ? preferredFps : rgbFps);
        sel.value = String(rgbFps);
    }

    function pollMsForMode() {
        const byRes = RGB_POLL_BY_RES[rgbRes] || 3200;
        const byFps = RGB_POLL_BY_FPS[rgbFps] || 3200;
        return Math.max(byRes, byFps);
    }

    function updateResolutionUi() {
        const meta = document.getElementById("rgb-meta-res");
        if (meta) meta.textContent = `${formatResLabel(rgbRes)} @ ${rgbFps} FPS`;
        const sel = document.getElementById("rgb-resolution");
        if (sel && [...sel.options].some((o) => o.value === rgbRes)) sel.value = rgbRes;
        const fpsSel = document.getElementById("rgb-fps");
        if (fpsSel && [...fpsSel.options].some((o) => o.value === String(rgbFps))) {
            fpsSel.value = String(rgbFps);
        }
        const hint = document.getElementById("rgb-resolution-hint");
        if (hint) {
            const mode = modeForRes(rgbRes);
            const max = mode ? mode.max_fps : "?";
            hint.textContent = mode
                ? `${mode.label} — FPS max ~${max} à ${formatResLabel(rgbRes)} (source rpicam sur le Pi).`
                : "Modes natifs caméra Pi — FPS limités selon la résolution.";
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

    async function syncRgbCameraFromServer() {
        const cfg = await fetchRgbCameraConfig();
        if (!cfg) return;
        if (cfg.options && cfg.options.modes && cfg.options.modes.length) {
            rgbCameraModes = cfg.options.modes;
            populateResolutionSelect();
        }
        if (cfg.resolution) rgbRes = cfg.resolution;
        if (cfg.fps != null) rgbFps = Number(cfg.fps);
        populateFpsSelect(rgbRes, rgbFps);
        rgbFps = pickValidFps(rgbRes, rgbFps);
        localStorage.setItem("aquawing_rgb_res", rgbRes);
        localStorage.setItem("aquawing_rgb_fps", String(rgbFps));
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
                const measured = s.measured_fps != null ? ` (~${s.measured_fps} mesuré)` : "";
                fpsLine.textContent = `${s.fps || rgbFps} FPS / rpicam${measured}`;
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

    async function applyRgbCaptureMode({ resolution, fps } = {}) {
        const nextRes = resolution != null ? resolution : rgbRes;
        const nextFps = fps != null ? Number(fps) : rgbFps;
        if (nextRes === rgbRes && nextFps === rgbFps) return;

        const statusRgb = document.querySelector(".optical-status-cards .status-card:nth-child(2) .status-val");
        if (statusRgb && videoOn) {
            statusRgb.textContent = `SWITCH / ${formatResLabel(nextRes)} @ ${nextFps}…`;
        }

        try {
            const body = {};
            if (resolution != null) body.resolution = resolution;
            if (fps != null) body.fps = nextFps;
            const cfg = await postRgbCameraConfig(body);
            rgbRes = cfg.resolution || nextRes;
            rgbFps = Number(cfg.fps != null ? cfg.fps : nextFps);
        } catch (e) {
            console.warn("RGB capture mode:", e);
            return;
        }

        rgbPollMs = pollMsForMode();
        localStorage.setItem("aquawing_rgb_res", rgbRes);
        localStorage.setItem("aquawing_rgb_fps", String(rgbFps));
        updateResolutionUi();
        await refreshRgbStatsMeta();

        if (!videoOn) return;
        restartRgbPolling();
        if (statusRgb) {
            const aiTag = useAnnotated ? " + IA" : "";
            statusRgb.textContent = `LIVE / ${formatResLabel(rgbRes)} @ ${rgbFps}${aiTag}`;
            statusRgb.classList.add("status-ok");
        }
    }

    function onRgbResolutionChange() {
        const sel = document.getElementById("rgb-resolution");
        if (!sel) return;
        const next = sel.value;
        populateFpsSelect(next, rgbFps);
        const nextFps = parseInt(document.getElementById("rgb-fps")?.value || String(rgbFps), 10);
        if (camChangeTimer) clearTimeout(camChangeTimer);
        camChangeTimer = setTimeout(
            () => applyRgbCaptureMode({ resolution: next, fps: nextFps }),
            350
        );
    }

    function onRgbFpsChange() {
        const sel = document.getElementById("rgb-fps");
        if (!sel) return;
        const next = parseInt(sel.value, 10);
        if (camChangeTimer) clearTimeout(camChangeTimer);
        camChangeTimer = setTimeout(() => applyRgbCaptureMode({ fps: next }), 350);
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
                statusRgb.textContent = `LIVE / ${formatResLabel(rgbRes)} @ ${rgbFps}${aiTag}`;
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

        const rgbResSel = document.getElementById("rgb-resolution");
        if (rgbResSel) {
            if ([...rgbResSel.options].some((o) => o.value === rgbRes)) {
                rgbResSel.value = rgbRes;
            }
            rgbResSel.addEventListener("change", onRgbResolutionChange);
        }
        const rgbFpsSel = document.getElementById("rgb-fps");
        if (rgbFpsSel) {
            if ([...rgbFpsSel.options].some((o) => o.value === String(rgbFps))) {
                rgbFpsSel.value = String(rgbFps);
            }
            rgbFpsSel.addEventListener("change", onRgbFpsChange);
        }
        rgbPollMs = pollMsForMode();
        updateResolutionUi();

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
