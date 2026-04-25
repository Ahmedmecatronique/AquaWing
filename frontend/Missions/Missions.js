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
    const startBtn = document.getElementById("start-flight-btn");
    const pauseBtn = document.getElementById("pause-mission-btn");
    const resumeBtn = document.getElementById("resume-mission-btn");
    const preflightBtn = document.getElementById("preflight-btn");
    const rtlBtn = document.getElementById("emergency-rtl-btn");
    const endBtn = document.getElementById("wait-btn");

    if (startBtn) {
        startBtn.addEventListener("click", () => {
            callParent("startDemo", true);
            pauseBtn.disabled = false;
            resumeBtn.disabled = true;
            endBtn.disabled = false;
            toast("Mission started", "success");
        });
    }

    if (pauseBtn) {
        pauseBtn.addEventListener("click", () => {
            callParent("pauseDemo");
            pauseBtn.disabled = true;
            resumeBtn.disabled = false;
            toast("Mission paused", "info");
        });
    }

    if (resumeBtn) {
        resumeBtn.addEventListener("click", () => {
            callParent("resumeDemo");
            pauseBtn.disabled = false;
            resumeBtn.disabled = true;
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
            toast("Emergency RTL requested", "warning");
        });
    }

    if (endBtn) {
        endBtn.addEventListener("click", () => {
            callParent("stopDemo");
            pauseBtn.disabled = true;
            resumeBtn.disabled = true;
            endBtn.disabled = true;
            toast("Mission ended", "success");
        });
    }
});