(function () {
    "use strict";

    let videoOn = false;
    let thermalOn = false;
    let rgbTimer = null;
    let thermalTimer = null;
    let recOn = true;

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

        const refresh = () => {
            img.src = `/video?t=${Date.now()}`;
        };
        img.onload = () => {
            img.style.display = "block";
            ph.style.display = "none";
            applyRgbFilters();
            if (statusRgb) {
                statusRgb.textContent = "LIVE / 1280×720 @ 30 FPS";
                statusRgb.classList.add("status-ok");
            }
        };
        img.onerror = () => {
            img.style.display = "none";
            ph.style.display = "flex";
            if (statusRgb) {
                statusRgb.textContent = "ERROR / No signal";
                statusRgb.classList.remove("status-ok");
            }
        };
        refresh();
        if (rgbTimer) clearInterval(rgbTimer);
        rgbTimer = setInterval(refresh, 900);
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
                window.open(img.src.split("?")[0] + "?t=" + Date.now(), "_blank");
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

        wirePresets();
        wireToolbar();
        syncSliderOutputs();

        const vp = document.getElementById("rgb-feed-viewport");
        if (vp && document.getElementById("btn-crosshair")?.classList.contains("is-active")) {
            vp.classList.add("tool-crosshair");
        }

        setVideo(true);
        setThermal(true);
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

        document.querySelector(".oc-btn-calibrate")?.addEventListener("click", (e) => {
            e.preventDefault();
            updateThermalMeta();
        });
    });
})();
