const STORAGE_KEY = "aquawing_settings_v1";

const DEFAULT_SETTINGS = {
    autoConnect: true,
    showNotifications: true,
    language: "en",
    theme: "dark",
    mapStyle: "standard",
    updateRate: 10,
    recordTelemetry: true,
};

function readForm() {
    return {
        autoConnect: !!document.getElementById("settings-auto-connect")?.checked,
        showNotifications: !!document.getElementById("settings-show-notifications")?.checked,
        language: document.getElementById("settings-language")?.value || "en",
        theme: document.getElementById("settings-theme")?.value || "dark",
        mapStyle: document.getElementById("settings-map-style")?.value || "standard",
        updateRate: Number(document.getElementById("settings-update-rate")?.value || 10),
        recordTelemetry: !!document.getElementById("settings-record-telemetry")?.checked,
    };
}

function applyForm(s) {
    const x = { ...DEFAULT_SETTINGS, ...s };
    document.getElementById("settings-auto-connect").checked = !!x.autoConnect;
    document.getElementById("settings-show-notifications").checked = !!x.showNotifications;
    document.getElementById("settings-language").value = x.language;
    document.getElementById("settings-theme").value = x.theme;
    document.getElementById("settings-map-style").value = x.mapStyle;
    document.getElementById("settings-update-rate").value = String(x.updateRate);
    document.getElementById("settings-record-telemetry").checked = !!x.recordTelemetry;
}

function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return applyForm(DEFAULT_SETTINGS);
        applyForm(JSON.parse(raw));
    } catch (_e) {
        applyForm(DEFAULT_SETTINGS);
    }
}

function saveSettings() {
    const data = readForm();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

window.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    document.getElementById("settings-save-btn")?.addEventListener("click", saveSettings);
    document.getElementById("settings-reset-btn")?.addEventListener("click", () => applyForm(DEFAULT_SETTINGS));
});