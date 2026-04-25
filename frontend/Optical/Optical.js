let videoOn = false;
let thermalOn = false;
let rgbTimer = null;
let thermalTimer = null;

function setButtonText(id, on, label) {
    const el = document.getElementById(id);
    if (el) el.textContent = `${label}: ${on ? "ON" : "OFF"}`;
}

function setVideo(on) {
    videoOn = !!on;
    setButtonText("optical-video-toggle", videoOn, "RGB");
    setButtonText("optical-video-toggle-main", videoOn, "RGB");
    const img = document.getElementById("optical-video-stream");
    const ph = document.getElementById("optical-video-placeholder");

    if (!img || !ph) return;
    if (!videoOn) {
        if (rgbTimer) { clearInterval(rgbTimer); rgbTimer = null; }
        img.style.display = "none";
        img.src = "";
        ph.style.display = "flex";
        return;
    }

    const refresh = () => {
        img.src = `/video?t=${Date.now()}`;
    };
    img.onload = () => { img.style.display = "block"; ph.style.display = "none"; };
    img.onerror = () => { img.style.display = "none"; ph.style.display = "flex"; };
    refresh();
    if (rgbTimer) clearInterval(rgbTimer);
    rgbTimer = setInterval(refresh, 900);
}

function setThermal(on) {
    thermalOn = !!on;
    setButtonText("optical-thermal-toggle", thermalOn, "Thermal");
    setButtonText("optical-thermal-toggle-main", thermalOn, "Thermal");
    const img = document.getElementById("optical-thermal-stream");
    const ph = document.getElementById("optical-thermal-placeholder");

    if (!img || !ph) return;
    if (!thermalOn) {
        if (thermalTimer) { clearInterval(thermalTimer); thermalTimer = null; }
        img.style.display = "none";
        img.src = "";
        ph.style.display = "flex";
        return;
    }

    const refresh = () => {
        img.src = `/thermal?t=${Date.now()}`;
    };
    img.onload = () => { img.style.display = "block"; ph.style.display = "none"; };
    img.onerror = () => { img.style.display = "none"; ph.style.display = "flex"; };
    refresh();
    if (thermalTimer) clearInterval(thermalTimer);
    thermalTimer = setInterval(refresh, 1200);
}

window.addEventListener("DOMContentLoaded", () => {
    const videoBtns = ["optical-video-toggle", "optical-video-toggle-main"];
    const thermalBtns = ["optical-thermal-toggle", "optical-thermal-toggle-main"];
    videoBtns.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("click", () => setVideo(!videoOn));
    });
    thermalBtns.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("click", () => setThermal(!thermalOn));
    });

    setVideo(true);
    setThermal(true);
});