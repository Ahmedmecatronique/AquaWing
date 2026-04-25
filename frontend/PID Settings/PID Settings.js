const DEFAULT_PID = {
    roll: { kp: 4.5, ki: 0.45, kd: 0.05 },
    pitch: { kp: 4.5, ki: 0.45, kd: 0.05 },
    yaw: { kp: 4.5, ki: 0.45, kd: 0.05 },
    altitude: { kp: 1.0, ki: 0.1, kd: 0.01 },
};

function setPidValues(values) {
    const src = values || DEFAULT_PID;
    const set = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.value = v;
    };
    set("pid-roll-p", src.roll.kp);
    set("pid-roll-i", src.roll.ki);
    set("pid-roll-d", src.roll.kd);
    set("pid-pitch-p", src.pitch.kp);
    set("pid-pitch-i", src.pitch.ki);
    set("pid-pitch-d", src.pitch.kd);
    set("pid-yaw-p", src.yaw.kp);
    set("pid-yaw-i", src.yaw.ki);
    set("pid-yaw-d", src.yaw.kd);
    set("pid-alt-p", src.altitude.kp);
    set("pid-alt-i", src.altitude.ki);
    set("pid-alt-d", src.altitude.kd);
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

window.addEventListener("DOMContentLoaded", () => {
    loadPid();
    document.getElementById("pid-apply-btn")?.addEventListener("click", async () => {
        try { await savePid(); } catch (_e) {}
    });
    document.getElementById("pid-save-btn")?.addEventListener("click", async () => {
        try { await savePid(); } catch (_e) {}
    });
    document.getElementById("pid-reset-btn")?.addEventListener("click", () => {
        setPidValues(DEFAULT_PID);
    });
});