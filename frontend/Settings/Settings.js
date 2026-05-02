(function () {
    "use strict";

    const STORAGE_KEY = "aquawing_settings_v2";
    const STORAGE_LEGACY = "aquawing_settings_v1";

    const SWATCH = ["swatch-cyan", "swatch-orange", "swatch-green"];

    const DEFAULT_SETTINGS = {
        autoConnect: true,
        showNotifications: true,
        startMinimized: false,
        language: "en",
        units: "metric",
        dateFormat: "yyyy-mm-dd",
        timeFormat: "24",
        theme: "dark",
        primaryColor: "cyan",
        mapStyle: "standard",
        dashboardRefresh: "normal",
        fontSize: "m",
        updateRate: 10,
        recordTelemetry: true,
        telemetryBuffer: 60,
        autoSaveLogs: true,
        logMaxMb: 100,
        heartbeatSend: true,
        notifLowBattery: true,
        notifGpsLost: true,
        notifMotor: true,
        notifTelemetry: true,
        notifTemp: true,
        notifCollision: true,
        notifSound: "default",
        notifVolume: 79,
        systemId: "AQUAWING-01",
        vehicleType: "surface",
        armingPassword: "",
        autoDisarm: 300,
        failsafeAction: "rtl",
        dataStoragePath: "/var/aquawing/data",
        maxLogFiles: 50,
        autoDeleteOldLogs: true,
        minFreeGb: 5,
        exportFormat: "json",
        telemetryPort: 921600,
        telemetryProtocol: "json-ws",
        videoProtocol: "webrtc",
        wsReconnect: true,
        reconnectInterval: 5,
        authEnable: true,
        sessionTimeout: 30,
        httpsOnly: true,
        remoteAccess: false,
    };

    function $(id) {
        return document.getElementById(id);
    }

    function setChecked(id, v) {
        const el = $(id);
        if (el && "checked" in el) el.checked = !!v;
    }

    function setValue(id, v) {
        const el = $(id);
        if (el && "value" in el) el.value = v === undefined || v === null ? "" : String(v);
    }

    function getChecked(id, fallback) {
        const el = $(id);
        if (!el || !("checked" in el)) return fallback;
        return !!el.checked;
    }

    function getValue(id, fallback) {
        const el = $(id);
        if (!el || !("value" in el)) return fallback;
        return el.value;
    }

    function getNum(id, fallback) {
        const n = Number(getValue(id, ""));
        return Number.isFinite(n) ? n : fallback;
    }

    function readForm() {
        return {
            autoConnect: getChecked("settings-auto-connect", DEFAULT_SETTINGS.autoConnect),
            showNotifications: getChecked("settings-show-notifications", DEFAULT_SETTINGS.showNotifications),
            startMinimized: getChecked("settings-start-minimized", DEFAULT_SETTINGS.startMinimized),
            language: getValue("settings-language", DEFAULT_SETTINGS.language),
            units: getValue("settings-units", DEFAULT_SETTINGS.units),
            dateFormat: getValue("settings-date-format", DEFAULT_SETTINGS.dateFormat),
            timeFormat: getValue("settings-time-format", DEFAULT_SETTINGS.timeFormat),
            theme: getValue("settings-theme", DEFAULT_SETTINGS.theme),
            primaryColor: getValue("settings-primary-color", DEFAULT_SETTINGS.primaryColor),
            mapStyle: getValue("settings-map-style", DEFAULT_SETTINGS.mapStyle),
            dashboardRefresh: getValue("settings-dashboard-refresh", DEFAULT_SETTINGS.dashboardRefresh),
            fontSize: getValue("settings-font-size", DEFAULT_SETTINGS.fontSize),
            updateRate: getNum("settings-update-rate", DEFAULT_SETTINGS.updateRate),
            recordTelemetry: getChecked("settings-record-telemetry", DEFAULT_SETTINGS.recordTelemetry),
            telemetryBuffer: getNum("settings-telemetry-buffer", DEFAULT_SETTINGS.telemetryBuffer),
            autoSaveLogs: getChecked("settings-auto-save-logs", DEFAULT_SETTINGS.autoSaveLogs),
            logMaxMb: getNum("settings-log-max-mb", DEFAULT_SETTINGS.logMaxMb),
            heartbeatSend: getChecked("settings-heartbeat-send", DEFAULT_SETTINGS.heartbeatSend),
            notifLowBattery: getChecked("settings-notif-low-battery", true),
            notifGpsLost: getChecked("settings-notif-gps-lost", true),
            notifMotor: getChecked("settings-notif-motor", true),
            notifTelemetry: getChecked("settings-notif-telemetry", true),
            notifTemp: getChecked("settings-notif-temp", true),
            notifCollision: getChecked("settings-notif-collision", true),
            notifSound: getValue("settings-notif-sound", DEFAULT_SETTINGS.notifSound),
            notifVolume: getNum("settings-notif-volume", DEFAULT_SETTINGS.notifVolume),
            systemId: getValue("settings-system-id", DEFAULT_SETTINGS.systemId),
            vehicleType: getValue("settings-vehicle-type", DEFAULT_SETTINGS.vehicleType),
            armingPassword: getValue("settings-arming-password", ""),
            autoDisarm: getNum("settings-auto-disarm", DEFAULT_SETTINGS.autoDisarm),
            failsafeAction: getValue("settings-failsafe-action", DEFAULT_SETTINGS.failsafeAction),
            dataStoragePath: getValue("settings-data-storage-path", DEFAULT_SETTINGS.dataStoragePath),
            maxLogFiles: getNum("settings-max-log-files", DEFAULT_SETTINGS.maxLogFiles),
            autoDeleteOldLogs: getChecked("settings-auto-delete-old-logs", true),
            minFreeGb: getNum("settings-min-free-gb", DEFAULT_SETTINGS.minFreeGb),
            exportFormat: getValue("settings-export-format", DEFAULT_SETTINGS.exportFormat),
            telemetryPort: getNum("settings-telemetry-port", DEFAULT_SETTINGS.telemetryPort),
            telemetryProtocol: getValue("settings-telemetry-protocol", DEFAULT_SETTINGS.telemetryProtocol),
            videoProtocol: getValue("settings-video-protocol", DEFAULT_SETTINGS.videoProtocol),
            wsReconnect: getChecked("settings-ws-reconnect", true),
            reconnectInterval: getNum("settings-reconnect-interval", DEFAULT_SETTINGS.reconnectInterval),
            authEnable: getChecked("settings-auth-enable", DEFAULT_SETTINGS.authEnable),
            sessionTimeout: getNum("settings-session-timeout", DEFAULT_SETTINGS.sessionTimeout),
            httpsOnly: getChecked("settings-https-only", DEFAULT_SETTINGS.httpsOnly),
            remoteAccess: getChecked("settings-remote-access", DEFAULT_SETTINGS.remoteAccess),
        };
    }

    function applyForm(s0) {
        const s = { ...DEFAULT_SETTINGS, ...s0 };

        setChecked("settings-auto-connect", s.autoConnect);
        setChecked("settings-show-notifications", s.showNotifications);
        setChecked("settings-start-minimized", s.startMinimized);
        setValue("settings-language", s.language);
        setValue("settings-units", s.units);
        setValue("settings-date-format", s.dateFormat);
        setValue("settings-time-format", s.timeFormat);
        setValue("settings-theme", s.theme);
        setValue("settings-primary-color", s.primaryColor);
        setValue("settings-map-style", s.mapStyle);
        setValue("settings-dashboard-refresh", s.dashboardRefresh);
        setValue("settings-font-size", s.fontSize);
        setValue("settings-update-rate", s.updateRate);
        setChecked("settings-record-telemetry", s.recordTelemetry);
        setValue("settings-telemetry-buffer", s.telemetryBuffer);
        setChecked("settings-auto-save-logs", s.autoSaveLogs);
        setValue("settings-log-max-mb", s.logMaxMb);
        setChecked("settings-heartbeat-send", s.heartbeatSend);
        setChecked("settings-notif-low-battery", s.notifLowBattery);
        setChecked("settings-notif-gps-lost", s.notifGpsLost);
        setChecked("settings-notif-motor", s.notifMotor);
        setChecked("settings-notif-telemetry", s.notifTelemetry);
        setChecked("settings-notif-temp", s.notifTemp);
        setChecked("settings-notif-collision", s.notifCollision);
        setValue("settings-notif-sound", s.notifSound);
        setValue("settings-notif-volume", s.notifVolume);
        setValue("settings-system-id", s.systemId);
        setValue("settings-vehicle-type", s.vehicleType);
        const pwd = $("settings-arming-password");
        if (pwd && "value" in pwd) pwd.value = s.armingPassword || "";
        setValue("settings-auto-disarm", s.autoDisarm);
        setValue("settings-failsafe-action", s.failsafeAction);
        setValue("settings-data-storage-path", s.dataStoragePath);
        setValue("settings-max-log-files", s.maxLogFiles);
        setChecked("settings-auto-delete-old-logs", s.autoDeleteOldLogs);
        setValue("settings-min-free-gb", s.minFreeGb);
        setValue("settings-export-format", s.exportFormat);
        setValue("settings-telemetry-port", s.telemetryPort);
        setValue("settings-telemetry-protocol", s.telemetryProtocol);
        setValue("settings-video-protocol", s.videoProtocol);
        setChecked("settings-ws-reconnect", s.wsReconnect);
        setValue("settings-reconnect-interval", s.reconnectInterval);
        setChecked("settings-auth-enable", s.authEnable);
        setValue("settings-session-timeout", s.sessionTimeout);
        setChecked("settings-https-only", s.httpsOnly);
        setChecked("settings-remote-access", s.remoteAccess);

        updateVolumeOut();
        updateSwatch(s.primaryColor);
    }

    function updateVolumeOut() {
        const rng = $("settings-notif-volume");
        const out = $("settings-notif-volume-out");
        if (rng && out) out.textContent = `${rng.value}%`;
    }

    function updateSwatch(color) {
        const sw = document.querySelector(".st-swatch");
        if (!sw) return;
        SWATCH.forEach((c) => sw.classList.remove(c));
        const map = { cyan: "swatch-cyan", orange: "swatch-orange", green: "swatch-green" };
        sw.classList.add(map[color] || "swatch-cyan");
    }

    function loadLegacyV1(raw) {
        try {
            const o = typeof raw === "string" ? JSON.parse(raw) : raw;
            return {
                autoConnect: !!o.autoConnect,
                showNotifications: !!o.showNotifications,
                language: o.language || "en",
                theme: o.theme || "dark",
                mapStyle: o.mapStyle || "standard",
                updateRate: Number(o.updateRate) || 10,
                recordTelemetry: !!o.recordTelemetry,
            };
        } catch (_e) {
            return null;
        }
    }

    function loadSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                applyForm(JSON.parse(raw));
                return;
            }
            const leg = localStorage.getItem(STORAGE_LEGACY);
            if (leg) {
                const m = loadLegacyV1(leg);
                if (m) {
                    applyForm({ ...DEFAULT_SETTINGS, ...m });
                    return;
                }
            }
        } catch (_e) {
            /* fall through */
        }
        applyForm(DEFAULT_SETTINGS);
    }

    function saveSettings() {
        const data = readForm();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function exportConfig() {
        const blob = new Blob([JSON.stringify(readForm(), null, 2)], { type: "application/json;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `aquawing-config-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    window.addEventListener("DOMContentLoaded", () => {
        loadSettings();

        $("settings-notif-volume")?.addEventListener("input", updateVolumeOut);
        $("settings-primary-color")?.addEventListener("change", (e) =>
            updateSwatch(String(e.target && e.target.value))
        );

        $("settings-save-btn")?.addEventListener("click", saveSettings);

        $("settings-reset-btn")?.addEventListener("click", () => applyForm(DEFAULT_SETTINGS));

        $("settings-export-btn")?.addEventListener("click", exportConfig);

        $("settings-toggle-arm-pwd")?.addEventListener("click", () => {
            const inp = $("settings-arming-password");
            if (!inp) return;
            inp.type = inp.type === "password" ? "text" : "password";
        });

        $("settings-clear-cache-btn")?.addEventListener("click", () => {
            if (!window.confirm("Vider les réglages en cache locales (aquawing_settings_v2) ?")) return;
            localStorage.removeItem(STORAGE_KEY);
            applyForm(DEFAULT_SETTINGS);
        });

        $("settings-change-pass-btn")?.addEventListener("click", () => {
            window.alert("À connecter à votre flux de changement de mot de passe (API / utilisateur existant).");
        });
    });
})();
