(function () {
    "use strict";

    const CYAN = "#00d1ff";
    const ORANGE = "#ff8a00";
    const GREEN_CH = "#2ee59d";
    const GRID = "rgba(240,245,252,0.06)";
    const TICK = "rgba(240,245,252,0.45)";

    const DEFAULT_PID = {
        roll: { kp: 4.5, ki: 0.45, kd: 0.05 },
        pitch: { kp: 4.5, ki: 0.45, kd: 0.05 },
        yaw: { kp: 4.5, ki: 0.45, kd: 0.05 },
        altitude: { kp: 1.0, ki: 0.1, kd: 0.01 },
    };

    function clonePid(o) {
        if (typeof structuredClone === "function") {
            try {
                return structuredClone(o);
            } catch (_e) {
                /* continue */
            }
        }
        return JSON.parse(JSON.stringify(o));
    }

    const PROFILES = {
        default: clonePid(DEFAULT_PID),
        aggressive: {
            roll: { kp: 6.35, ki: 0.58, kd: 0.042 },
            pitch: { kp: 6.2, ki: 0.55, kd: 0.044 },
            yaw: { kp: 5.8, ki: 0.38, kd: 0.022 },
            altitude: { kp: 1.45, ki: 0.14, kd: 0.008 },
        },
        smooth: {
            roll: { kp: 3.85, ki: 0.32, kd: 0.065 },
            pitch: { kp: 3.9, ki: 0.33, kd: 0.062 },
            yaw: { kp: 4.05, ki: 0.28, kd: 0.055 },
            altitude: { kp: 0.72, ki: 0.06, kd: 0.018 },
        },
        rescue: {
            roll: { kp: 3.2, ki: 0.22, kd: 0.09 },
            pitch: { kp: 3.25, ki: 0.22, kd: 0.088 },
            yaw: { kp: 3.4, ki: 0.2, kd: 0.07 },
            altitude: { kp: 0.55, ki: 0.05, kd: 0.025 },
        },
    };

    const LABELS_STEP = [...Array(17)].map((_, i) => ((i / 16) * 2).toFixed(1));
    const LABELS_ATT = [...Array(29)].map((_, i) => ((i / 28) * 3).toFixed(1));

    const miniCharts = { roll: null, pitch: null, yaw: null, alt: null };
    let attitudeChart = null;

    function clamp(v, lo, hi) {
        return Math.min(hi, Math.max(lo, v));
    }

    function decimalsFromStep(step) {
        const s = String(step);
        if (!s.includes(".")) return 0;
        const d = (s.split(".")[1] || "").length;
        return Math.min(d, 4);
    }

    function fmt(val, step) {
        const d = decimalsFromStep(step);
        return Number(Number(val).toFixed(d));
    }

    /** Second-order-ish step curve for mini charts */
    function genMiniResponse(kp, ki, kd) {
        const overshoot = clamp(0.02 + kp * 0.011 - kd * 0.55 + ki * 0.09, -0.02, 0.28);
        const rise = clamp(5.8 + kd * 8 - ki * 1.8, 2.8, 12);
        return LABELS_STEP.map((_, ix) => {
            const x = ix / (LABELS_STEP.length - 1 || 1);
            const t = x * 2;
            let y = 1 - Math.exp(-rise * (t / 2.2));
            y *= 1 + overshoot * Math.sin(t * Math.PI * (2.05 + kp * 0.04)) * Math.exp(-3.15 * t);
            return clamp(y, -0.04, 1.32);
        });
    }

    function genAngleTrace(kp, ki, kd, targetDeg, phase) {
        const norm = clamp(targetDeg / 10, 0.35, 2.8);
        return LABELS_ATT.map((_, ix) => {
            const x = ix / (LABELS_ATT.length - 1 || 1);
            const t = x * 3;
            let y =
                norm *
                targetDeg *
                (1 -
                    Math.exp(-(3.2 + kp * 0.14) * t) *
                        (1 + Math.sin((t + phase) * Math.PI * 2.8) * 0.06 * clamp(ki / 0.35, 0.3, 1.9)));
            y *= 1 + kd * 0.4 * Math.exp(-2.8 * t) * Math.sin((t + phase) * Math.PI * 6);
            return clamp(y, -targetDeg * 0.06, targetDeg * 1.06);
        });
    }

    function setPidValues(values) {
        const src = values || DEFAULT_PID;
        const setNum = (id, v) => {
            const el = document.getElementById(id);
            if (!el || el.tagName !== "INPUT") return;
            el.value = String(v);
        };
        const applyAxis = (axis, prefix) => {
            const a = src[axis] || DEFAULT_PID[axis];
            setNum(`${prefix}-p`, a.kp);
            setNum(`${prefix}-i`, a.ki);
            setNum(`${prefix}-d`, a.kd);
        };
        applyAxis("roll", "pid-roll");
        applyAxis("pitch", "pid-pitch");
        applyAxis("yaw", "pid-yaw");
        applyAxis("altitude", "pid-alt");
        syncAllSlidersFromInputs();
        updateChartsAndInsights();
    }

    function readPidValues() {
        const get = (id, fallback) => {
            const el = document.getElementById(id);
            const v = Number(el?.value);
            return Number.isFinite(v) ? v : fallback;
        };
        return {
            roll: { kp: get("pid-roll-p", 4.5), ki: get("pid-roll-i", 0.45), kd: get("pid-roll-d", 0.05) },
            pitch: { kp: get("pid-pitch-p", 4.5), ki: get("pid-pitch-i", 0.45), kd: get("pid-pitch-d", 0.05) },
            yaw: { kp: get("pid-yaw-p", 4.5), ki: get("pid-yaw-i", 0.45), kd: get("pid-yaw-d", 0.05) },
            altitude: { kp: get("pid-alt-p", 1.0), ki: get("pid-alt-i", 0.1), kd: get("pid-alt-d", 0.01) },
        };
    }

    function syncAllSlidersFromInputs() {
        document.querySelectorAll(".pid-gain").forEach((row) => {
            const min = parseFloat(row.dataset.min);
            const max = parseFloat(row.dataset.max);
            const step = parseFloat(row.dataset.step);
            const range = row.querySelector(".pid-slider");
            const num = row.querySelector('input[type="number"]');
            if (!range || !num || !Number.isFinite(min)) return;
            let v = parseFloat(num.value);
            if (!Number.isFinite(v)) v = min;
            v = clamp(v, min, max);
            range.min = String(min);
            range.max = String(max);
            range.step = String(step);
            range.value = String(v);
            num.value = String(fmt(v, step));
        });
    }

    function bindGainRow(row) {
        const min = parseFloat(row.dataset.min);
        const max = parseFloat(row.dataset.max);
        const step = parseFloat(row.dataset.step);
        const range = row.querySelector(".pid-slider");
        const num = row.querySelector('input[type="number"]');
        if (!range || !num || !Number.isFinite(min)) return;

        const applyFromNum = () => {
            let v = parseFloat(num.value);
            if (!Number.isFinite(v)) v = min;
            v = clamp(v, min, max);
            num.value = String(fmt(v, step));
            range.value = String(v);
            updateChartsAndInsights();
        };

        range.addEventListener("input", () => {
            const v = clamp(parseFloat(range.value), min, max);
            num.value = String(fmt(v, step));
            updateChartsAndInsights();
        });

        num.addEventListener("change", applyFromNum);
        num.addEventListener("keyup", (e) => {
            if (e.key === "Enter") applyFromNum();
        });

        row.querySelectorAll(".pid-stepper").forEach((btn) => {
            btn.addEventListener("click", () => {
                const d = parseFloat(btn.getAttribute("data-delta") || "0");
                let v = parseFloat(num.value);
                if (!Number.isFinite(v)) v = min;
                v = clamp(fmt(v + d, Math.abs(d)), min, max);
                num.value = String(v);
                range.value = String(v);
                updateChartsAndInsights();
            });
        });
    }

    function baseMiniOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: "nearest", intersect: false },
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    ticks: { color: TICK, font: { size: 8 }, maxTicksLimit: 5 },
                    grid: { color: GRID },
                },
                y: {
                    min: -0.05,
                    suggestedMax: 1.22,
                    ticks: { color: TICK, font: { size: 8 }, maxTicksLimit: 5 },
                    grid: { color: GRID },
                },
            },
        };
    }

    function ensureMiniChart(key, canvasId) {
        const el = document.getElementById(canvasId);
        if (!el || typeof Chart === "undefined") return;
        const targetLine = LABELS_STEP.map(() => 1);

        const ctx = el.getContext("2d");
        if (miniCharts[key]) miniCharts[key].destroy();
        miniCharts[key] = new Chart(ctx, {
            type: "line",
            data: {
                labels: LABELS_STEP,
                datasets: [
                    {
                        label: "Response",
                        data: [],
                        borderColor: CYAN,
                        backgroundColor: "transparent",
                        borderWidth: 1.8,
                        tension: 0.38,
                        pointRadius: 0,
                    },
                    {
                        label: "Target",
                        data: targetLine,
                        borderColor: ORANGE,
                        borderDash: [4, 3],
                        borderWidth: 1.2,
                        tension: 0,
                        pointRadius: 0,
                    },
                ],
            },
            options: baseMiniOptions(),
        });
    }

    function ensureAttitudeChart() {
        const el = document.getElementById("pid-chart-attitude");
        if (!el || typeof Chart === "undefined") return;
        if (attitudeChart) attitudeChart.destroy();
        const ctx = el.getContext("2d");
        attitudeChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: LABELS_ATT,
                datasets: [
                    {
                        label: "Roll",
                        data: [],
                        borderColor: CYAN,
                        borderWidth: 1.6,
                        tension: 0.35,
                        pointRadius: 0,
                    },
                    {
                        label: "Pitch",
                        data: [],
                        borderColor: ORANGE,
                        borderWidth: 1.6,
                        tension: 0.35,
                        pointRadius: 0,
                    },
                    {
                        label: "Yaw",
                        data: [],
                        borderColor: GREEN_CH,
                        borderWidth: 1.6,
                        tension: 0.35,
                        pointRadius: 0,
                    },
                    {
                        label: "Target",
                        data: [],
                        borderColor: "rgba(240,245,252,0.35)",
                        borderDash: [5, 4],
                        borderWidth: 1.2,
                        tension: 0,
                        pointRadius: 0,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: {
                        display: true,
                        position: "top",
                        align: "end",
                        labels: {
                            color: TICK,
                            boxWidth: 10,
                            font: { size: 9, weight: "600" },
                        },
                    },
                },
                scales: {
                    x: {
                        title: { display: true, text: "Time (s)", color: TICK, font: { size: 10 } },
                        ticks: { color: TICK, maxTicksLimit: 8 },
                        grid: { color: GRID },
                    },
                    y: {
                        title: { display: true, text: "Angle (°)", color: TICK, font: { size: 10 } },
                        ticks: { color: TICK },
                        grid: { color: GRID },
                    },
                },
            },
        });
    }

    function updateMiniCharts(vals) {
        const map = [
            ["roll", miniCharts.roll, vals.roll],
            ["pitch", miniCharts.pitch, vals.pitch],
            ["yaw", miniCharts.yaw, vals.yaw],
            ["alt", miniCharts.alt, vals.altitude],
        ];
        map.forEach(([, chart, axis]) => {
            if (!chart) return;
            chart.data.datasets[0].data = genMiniResponse(axis.kp, axis.ki, axis.kd);
            chart.update();
        });
    }

    function updateAttitudeChart(vals, targetDeg) {
        if (!attitudeChart) return;
        attitudeChart.data.datasets[0].data = genAngleTrace(vals.roll.kp, vals.roll.ki, vals.roll.kd, targetDeg, 0);
        attitudeChart.data.datasets[1].data = genAngleTrace(
            vals.pitch.kp,
            vals.pitch.ki,
            vals.pitch.kd,
            targetDeg,
            0.12
        );
        attitudeChart.data.datasets[2].data = genAngleTrace(vals.yaw.kp, vals.yaw.ki, vals.yaw.kd, targetDeg * 0.65, 0.48);
        const tgt = LABELS_ATT.map(() => targetDeg);
        attitudeChart.data.datasets[3].data = tgt;
        attitudeChart.update();
    }

    function updateInsights(vals) {
        const r = vals.roll;
        const os = clamp(2.8 + r.kp * 1.25 - r.kd * 88 + r.ki * 3.5, 0.4, 22);
        const settle = clamp(0.92 - r.kp * 0.07 + r.kd * 36 + r.ki * 0.25, 0.18, 1.95);
        const riskScore = r.ki * 9 - r.kd * 118 + Math.abs(r.kp - 4.9) * 2.8;

        const osEl = document.getElementById("pid-metric-os");
        if (osEl) osEl.textContent = `${os.toFixed(1)}%`;
        const stEl = document.getElementById("pid-metric-settle");
        if (stEl) stEl.textContent = `${settle.toFixed(2)} s`;
        const rkEl = document.getElementById("pid-metric-risk");
        if (rkEl) {
            const level = riskScore > 24 ? "High" : riskScore > 15 ? "Medium" : "Low";
            rkEl.textContent = level;
            rkEl.className = "pid-insight-risk";
            if (level === "High") {
                rkEl.style.background = "rgba(255,80,80,0.18)";
                rkEl.style.color = "#ff8866";
            } else if (level === "Medium") {
                rkEl.style.background = "rgba(255,180,60,0.15)";
                rkEl.style.color = "#ffbf44";
            } else {
                rkEl.style.background = "rgba(0,200,83,0.12)";
                rkEl.style.color = "#00c853";
            }
        }
    }

    function updateChartsAndInsights() {
        const vals = readPidValues();
        updateInsights(vals);
        updateMiniCharts(vals);
        const stepSel = document.getElementById("pid-step-input");
        const targetDeg = Number(stepSel?.value || 10);
        updateAttitudeChart(vals, Number.isFinite(targetDeg) ? targetDeg : 10);
    }

    async function loadPid() {
        try {
            const res = await fetch("/api/pid");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setPidValues({
                roll: data.roll || DEFAULT_PID.roll,
                pitch: data.pitch || DEFAULT_PID.pitch,
                yaw: data.yaw || DEFAULT_PID.yaw,
                altitude: data.altitude || DEFAULT_PID.altitude,
            });
        } catch (_e) {
            setPidValues(DEFAULT_PID);
        }
    }

    async function savePid() {
        const payload = readPidValues();
        const axisMap = {
            roll: payload.roll,
            pitch: payload.pitch,
            yaw: payload.yaw,
            altitude: payload.altitude,
        };
        for (const [axis, gains] of Object.entries(axisMap)) {
            const res = await fetch("/api/pid", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    axis,
                    kp: gains.kp,
                    ki: gains.ki,
                    kd: gains.kd,
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status} (${axis})`);
        }
    }

    function setProfileUI(name) {
        const presets = document.querySelectorAll(".pid-preset");
        presets.forEach((btn) => {
            const ok = btn.getAttribute("data-profile") === name;
            btn.classList.toggle("is-active", ok);
            btn.setAttribute("aria-selected", ok ? "true" : "false");
        });
        const sel = document.getElementById("pid-profile-select");
        if (sel && [...sel.options].some((o) => o.value === name)) sel.value = name;
    }

    function applyProfile(name) {
        const preset = PROFILES[name] || PROFILES.default;
        setPidValues(preset);
        setProfileUI(name);
    }

    window.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll(".pid-gain").forEach(bindGainRow);

        if (typeof Chart !== "undefined") {
            ensureMiniChart("roll", "pid-mini-roll");
            ensureMiniChart("pitch", "pid-mini-pitch");
            ensureMiniChart("yaw", "pid-mini-yaw");
            ensureMiniChart("alt", "pid-mini-alt");
            ensureAttitudeChart();
        }

        loadPid();

        document.getElementById("pid-step-input")?.addEventListener("change", () => updateChartsAndInsights());

        document.querySelectorAll(".pid-preset").forEach((btn) => {
            btn.addEventListener("click", () => applyProfile(btn.getAttribute("data-profile") || "default"));
        });

        document.getElementById("pid-profile-select")?.addEventListener("change", (ev) =>
            applyProfile(ev.target?.value || "default")
        );

        document.querySelector(".pid-btn-manage")?.addEventListener("click", () =>
            alert("Profiles are stored locally in this dashboard. Extend with API hooks as needed.")
        );

        document.getElementById("pid-auto-tune-btn")?.addEventListener("click", () => {
            const vals = readPidValues();
            ["pid-roll-", "pid-pitch-"].forEach((pfx) => {
                const kp = clamp(parseFloat(document.getElementById(pfx + "p")?.value) * 1.035, 3, 9.8);
                const kd = clamp(parseFloat(document.getElementById(pfx + "d")?.value) * 1.12, 0.02, 0.18);
                const elP = document.getElementById(pfx + "p");
                const elD = document.getElementById(pfx + "d");
                if (elP) elP.value = String(fmt(kp, 0.01));
                if (elD) elD.value = String(fmt(kd, 0.001));
            });
            syncAllSlidersFromInputs();
            updateChartsAndInsights();
            document.getElementById("pid-fc-text").textContent = "Tuned";
            window.setTimeout(() => {
                const t = document.getElementById("pid-fc-text");
                if (t) t.textContent = "Connected";
            }, 1400);
        });

        document.getElementById("pid-apply-btn")?.addEventListener("click", async () => {
            try {
                await savePid();
            } catch (_e) {}
        });

        document.getElementById("pid-save-btn")?.addEventListener("click", async () => {
            try {
                await savePid();
            } catch (_e) {}
        });

        document.getElementById("pid-reset-btn")?.addEventListener("click", () => {
            applyProfile("default");
        });
    });
})();
