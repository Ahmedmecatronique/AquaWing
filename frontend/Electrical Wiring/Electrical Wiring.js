(function () {
    "use strict";

    const STORAGE_KEY = "aquawing_ew_v2";
    const STM_PINS = [...Array(16)].map((_, i) => `PA${i}`);
    const PI_PINS = [...Array(16)].map((_, i) => `GPIO ${i + 2}`);

    const ASSIGN_OPTIONS = [
        { value: "", label: "— Unassigned" },
        { value: "pump", label: "💧 Pump Relay" },
        { value: "buzzer", label: "🔊 Buzzer" },
        { value: "gps_tx", label: "⬆ GPS UART TX" },
        { value: "gps_rx", label: "⬇ GPS UART RX" },
        { value: "servo", label: "⚙ Servo PWM" },
        { value: "motor", label: "⚡ Motor PWM" },
        { value: "esc", label: "🛰 ESC Signal" },
        { value: "led", label: "◉ Status LED" },
        { value: "cam_scl", label: "📷 Cam I2C SCL" },
        { value: "cam_sda", label: "📷 Cam I2C SDA" },
        { value: "uart_dbg", label: "▤ UART Debug" },
    ];

    const RESERVED = new Set(["cam_scl", "cam_sda"]);
    const SINGLETON = new Set(["pump", "motor"]);

    const DEFAULT_STM = {
        PA0: { a: "pump", d: "out", v: "12", c: true },
        PA1: { a: "buzzer", d: "out", v: "5", c: false },
        PA2: { a: "gps_tx", d: "out", v: "3v3", c: false },
        PA3: { a: "gps_rx", d: "in", v: "3v3", c: false },
        PA4: { a: "servo", d: "out", v: "5", c: true },
        PA5: { a: "cam_scl", d: "out", v: "3v3", c: false },
        PA6: { a: "cam_sda", d: "out", v: "3v3", c: false },
        PA7: { a: "", d: "out", v: "3v3", c: false },
        PA8: { a: "motor", d: "out", v: "12", c: true },
        PA9: { a: "esc", d: "out", v: "5", c: false },
        PA10: { a: "", d: "out", v: "3v3", c: false },
        PA11: { a: "", d: "out", v: "3v3", c: false },
        PA12: { a: "", d: "in", v: "3v3", c: false },
        PA13: { a: "led", d: "out", v: "3v3", c: false },
        PA14: { a: "", d: "in", v: "3v3", c: false },
        PA15: { a: "", d: "in", v: "3v3", c: false },
    };

    const DEFAULT_PI = {};
    PI_PINS.forEach((p) => {
        DEFAULT_PI[p] = { a: "", d: "out", v: "3v3", c: false };
    });
    DEFAULT_PI["GPIO 2"] = { a: "pump", d: "out", v: "5", c: false };
    DEFAULT_PI["GPIO 3"] = { a: "buzzer", d: "out", v: "5", c: false };
    DEFAULT_PI["GPIO 4"] = { a: "servo", d: "out", v: "5", c: true };

    let state = {
        board: "stm",
        stm: { ...DEFAULT_STM },
        pi: { ...DEFAULT_PI },
        lastSaved: null,
    };

    const FILTER_MODES = ["all", "assigned", "conflict", "free"];
    let filterModeIdx = 0;

    function rowState(board, pin) {
        const b = board === "pi" ? state.pi : state.stm;
        return b[pin] || { a: "", d: "out", v: "3v3", c: false };
    }

    function setRow(board, pin, rs) {
        const b = board === "pi" ? state.pi : state.stm;
        b[pin] = { ...rs };
    }

    function countSingletons(board, key) {
        const b = board === "pi" ? state.pi : state.stm;
        let n = 0;
        Object.values(b).forEach((r) => {
            if (r.a === key) n += 1;
        });
        return n;
    }

    function statusFor(board, pin) {
        const r = rowState(board, pin);
        if (!r.a) return { cls: "ew-status--free", text: "Free" };
        if (RESERVED.has(r.a)) return { cls: "ew-status--reserved", text: "Reserved" };
        if (SINGLETON.has(r.a) && countSingletons(board, r.a) > 1)
            return { cls: "ew-status--conflict", text: "Conflict" };
        return { cls: "ew-status--ok", text: "OK" };
    }

    function hasConflict(board) {
        const pins = board === "pi" ? PI_PINS : STM_PINS;
        return pins.some((p) => statusFor(board, p).cls === "ew-status--conflict");
    }

    function assignOptionsHtml(selected) {
        return ASSIGN_OPTIONS.map(
            (o) => `<option value="${o.value}" ${o.value === selected ? "selected" : ""}>${o.label}</option>`
        ).join("");
    }

    function dirAttr(d) {
        return (d === "in" ? "in" : "out");
    }

    function buildRow(board, pin) {
        const r = rowState(board, pin);
        const st = statusFor(board, pin);
        const cycleLabel = r.c ? "Oui" : "Non";

        const tr = document.createElement("tr");
        tr.dataset.pin = pin;
        tr.dataset.boardRow = board;
        tr.innerHTML = `
      <td class="ew-pin"><code>${pin}</code></td>
      <td class="ew-assign-wrap"><select class="ew-select ew-assign" data-pin="${pin}" aria-label="Assignment ${pin}">${assignOptionsHtml(r.a)}</select></td>
      <td><select class="ew-select ew-pill ew-pill-select ew-dir" data-pin="${pin}" data-dir-pill="${dirAttr(r.d)}" aria-label="Direction ${pin}">
          <option value="out" ${r.d !== "in" ? "selected" : ""}>OUT</option>
          <option value="in" ${r.d === "in" ? "selected" : ""}>IN</option>
        </select></td>
      <td><select class="ew-select ew-volt" data-pin="${pin}" aria-label="Voltage ${pin}">
          <option value="12" ${r.v === "12" ? "selected" : ""}>12V</option>
          <option value="5" ${r.v === "5" ? "selected" : ""}>5V</option>
          <option value="3v3" ${r.v === "3v3" || !r.v ? "selected" : ""}>3.3V</option>
        </select></td>
      <td><div class="ew-cycle-wrap">
          <input type="checkbox" class="ew-cycle-toggle" data-pin="${pin}" ${r.c ? "checked" : ""} aria-label="Auto cycle ${pin}">
          <span class="ew-cycle-label">${cycleLabel}</span>
        </div></td>
      <td><span class="ew-status ${st.cls}" data-status-pin="${pin}"><i class="ew-status-dot"></i>${st.text}</span></td>`;
        return tr;
    }

    function refreshStatusCells(board) {
        const pins = board === "pi" ? PI_PINS : STM_PINS;
        pins.forEach((pin) => {
            const el = document.querySelector(`[data-status-pin="${pin}"]`);
            if (!el) return;
            const st = statusFor(board, pin);
            el.className = `ew-status ${st.cls}`;
            el.innerHTML = `<i class="ew-status-dot"></i>${st.text}`;
        });
    }

    function updateStats(board) {
        const pins = board === "pi" ? PI_PINS : STM_PINS;
        const total = pins.length;
        let assigned = 0;
        let autoN = 0;
        pins.forEach((p) => {
            const r = rowState(board, p);
            if (r.a) assigned += 1;
            if (r.c) autoN += 1;
        });
        const free = total - assigned;
        const pct = total ? Math.round((assigned / total) * 100) : 0;

        const elA = document.getElementById("ew-stat-assigned");
        const elT = document.getElementById("ew-stat-total");
        const elP = document.getElementById("ew-stat-assigned-pct");
        const elF = document.getElementById("ew-stat-free");
        const elAc = document.getElementById("ew-stat-autocount");
        const elAs = document.getElementById("ew-stat-autosub");
        const elPw = document.getElementById("ew-stat-power");
        const elPs = document.getElementById("ew-stat-power-sub");

        if (elA) elA.textContent = String(assigned);
        if (elT) elT.textContent = String(total);
        if (elP) elP.textContent = `${pct}% of pins in use`;
        if (elF) elF.textContent = String(free);
        if (elAc) elAc.textContent = String(autoN);
        if (elAs) elAs.textContent = `${autoN} pin${autoN === 1 ? "" : "s"} will auto cycle`;

        const conflict = hasConflict(board);
        if (elPw && elPs) {
            if (conflict) {
                elPw.textContent = "Check";
                elPw.className = "ew-stat-val";
                elPw.style.color = "#ffcc66";
                elPs.textContent = "Resolve pin conflicts";
            } else {
                elPw.textContent = "OK";
                elPw.className = "ew-stat-val ew-stat-val--ok";
                elPw.style.color = "";
                elPs.textContent = "All rails nominal";
            }
        }
        refreshStatusCells(board);
    }

    function applyRowFilters(board) {
        const tbody = document.getElementById(board === "pi" ? "ew-pi-tbody" : "ew-stm-tbody");
        if (!tbody) return;
        const q = (document.getElementById("ew-search")?.value || "").trim().toLowerCase();
        const only = !!document.getElementById("ew-only-assigned")?.checked;
        const mode = FILTER_MODES[filterModeIdx];

        tbody.querySelectorAll("tr").forEach((tr) => {
            const pin = tr.dataset.pin;
            if (!pin) return;
            const r = rowState(board, pin);
            const st = statusFor(board, pin);
            const label = ASSIGN_OPTIONS.find((o) => o.value === r.a)?.label || "";
            let show = true;
            if (q && !pin.toLowerCase().includes(q) && !label.toLowerCase().includes(q)) show = false;
            if (only && !r.a) show = false;
            if (mode === "assigned" && !r.a) show = false;
            if (mode === "free" && r.a) show = false;
            if (mode === "conflict" && st.cls !== "ew-status--conflict") show = false;
            tr.classList.toggle("ew-row-hidden", !show);
        });
    }

    function wireRow(tr, board) {
        const pin = tr.dataset.pin;
        const assign = tr.querySelector(".ew-assign");
        const dir = tr.querySelector(".ew-dir");
        const volt = tr.querySelector(".ew-volt");
        const cyc = tr.querySelector(".ew-cycle-toggle");
        const cycLab = tr.querySelector(".ew-cycle-label");

        function push() {
            setRow(board, pin, {
                a: assign.value,
                d: dir.value,
                v: volt.value,
                c: !!cyc.checked,
            });
            dir.setAttribute("data-dir-pill", dirAttr(dir.value));
            if (cycLab) cycLab.textContent = cyc.checked ? "Oui" : "Non";
            updateStats(board);
            applyRowFilters(board);
        }

        assign?.addEventListener("change", push);
        dir?.addEventListener("change", push);
        volt?.addEventListener("change", push);
        cyc?.addEventListener("change", push);
    }

    function renderBoard(board) {
        const tbodyId = board === "pi" ? "ew-pi-tbody" : "ew-stm-tbody";
        const pins = board === "pi" ? PI_PINS : STM_PINS;
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        tbody.innerHTML = "";
        pins.forEach((pin) => {
            const tr = buildRow(board, pin);
            wireRow(tr, board);
            tbody.appendChild(tr);
        });
        updateStats(board);
        applyRowFilters(board);
    }

    function showBoard(which) {
        state.board = which;
        document.getElementById("ew-tab-stm")?.classList.toggle("ew-tab--active", which === "stm");
        document.getElementById("ew-tab-pi")?.classList.toggle("ew-tab--active", which === "pi");
        document.getElementById("ew-tab-stm")?.setAttribute("aria-selected", which === "stm" ? "true" : "false");
        document.getElementById("ew-tab-pi")?.setAttribute("aria-selected", which === "pi" ? "true" : "false");
        const pStm = document.getElementById("ew-panel-stm");
        const pPi = document.getElementById("ew-panel-pi");
        if (pStm) pStm.hidden = which !== "stm";
        if (pPi) pPi.hidden = which !== "pi";
        renderBoard(which);
    }

    function persist() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (_e) {
            /* ignore */
        }
    }

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const o = JSON.parse(raw);
            state.stm = { ...DEFAULT_STM, ...(o.stm || {}) };
            state.pi = { ...DEFAULT_PI, ...(o.pi || {}) };
            if (o.board === "pi" || o.board === "stm") state.board = o.board;
            state.lastSaved = o.lastSaved || null;
        } catch (_e) {
            state.stm = { ...DEFAULT_STM };
            state.pi = { ...DEFAULT_PI };
        }
    }

    function formatSaved() {
        const el = document.getElementById("ew-last-saved");
        if (!el) return;
        if (!state.lastSaved) {
            el.textContent = "Last saved: —";
            return;
        }
        const d = new Date(state.lastSaved);
        const diff = (Date.now() - d.getTime()) / 1000;
        if (diff < 75) {
            el.textContent = "Last saved: Just now";
            return;
        }
        const m = Math.floor(diff / 60);
        if (m < 60) {
            el.textContent = `Last saved: ${m} min ago`;
            return;
        }
        el.textContent = `Last saved: ${d.toLocaleString()}`;
    }

    function saveClick() {
        state.lastSaved = new Date().toISOString();
        persist();
        formatSaved();
    }

    function exportMapping() {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `aquawing-wiring-${state.board}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    function importMapping(file) {
        const fr = new FileReader();
        fr.onload = () => {
            try {
                const o = JSON.parse(String(fr.result));
                if (o.stm && typeof o.stm === "object") state.stm = { ...DEFAULT_STM, ...o.stm };
                if (o.pi && typeof o.pi === "object") state.pi = { ...DEFAULT_PI, ...o.pi };
                if (o.board === "stm" || o.board === "pi") state.board = o.board;
                persist();
                showBoard(state.board);
                formatSaved();
            } catch (_e) {
                window.alert("Invalid JSON file.");
            }
        };
        fr.readAsText(file);
    }

    function updateFilterLabel() {
        const btn = document.getElementById("ew-filter-btn");
        if (!btn) return;
        const mode = FILTER_MODES[filterModeIdx];
        const labels = { all: "All", assigned: "Assigned", conflict: "Conflicts", free: "Free" };
        btn.title = `Filter: ${labels[mode]}`;
    }

    window.addEventListener("DOMContentLoaded", () => {
        load();
        formatSaved();

        document.getElementById("ew-tab-stm")?.addEventListener("click", () => showBoard("stm"));
        document.getElementById("ew-tab-pi")?.addEventListener("click", () => showBoard("pi"));

        document.getElementById("ew-search")?.addEventListener("input", () => applyRowFilters(state.board));
        document.getElementById("ew-only-assigned")?.addEventListener("change", () => applyRowFilters(state.board));

        document.getElementById("ew-filter-btn")?.addEventListener("click", () => {
            filterModeIdx = (filterModeIdx + 1) % FILTER_MODES.length;
            updateFilterLabel();
            applyRowFilters(state.board);
        });
        updateFilterLabel();

        document.getElementById("ew-export-btn")?.addEventListener("click", exportMapping);
        document.getElementById("ew-import-btn")?.addEventListener("click", () => document.getElementById("ew-import-file")?.click());
        document.getElementById("ew-import-file")?.addEventListener("change", (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) importMapping(f);
            e.target.value = "";
        });

        document.getElementById("ew-save-btn")?.addEventListener("click", saveClick);

        showBoard(state.board);
    });
})();
