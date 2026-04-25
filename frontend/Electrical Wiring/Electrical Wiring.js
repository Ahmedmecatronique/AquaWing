const EW_STM_LS = "aquawing_ew_stm_v1";
const EW_PI_LS = "aquawing_ew_pi_v1";

function getEwStmPinList() {
    const pins = [];
    for (let i = 0; i <= 15; i++) pins.push(`PA${i}`);
    for (let i = 0; i <= 15; i++) pins.push(`PB${i}`);
    [13, 14, 15].forEach((i) => pins.push(`PC${i}`));
    return pins;
}

function getEwPiPinList() {
    const pins = [];
    for (let g = 2; g <= 27; g++) pins.push(`GPIO ${g}`);
    return pins;
}

function ewDerivedCycle(assignment) {
    const v = String(assignment ?? "").trim().toLowerCase();
    if (v === "servo" || v === "moteur") {
        return { text: "Oui", cls: "ew-cycle-badge--oui" };
    }
    return { text: "Non", cls: "ew-cycle-badge--non" };
}

function initElectricalWiringTables() {
    const tabStm = document.getElementById("ew-tab-stm");
    const tabPi = document.getElementById("ew-tab-pi");
    const panelStm = document.getElementById("ew-panel-stm");
    const panelPi = document.getElementById("ew-panel-pi");
    if (!tabStm || !tabPi || !panelStm || !panelPi) return;

    function showEw(which) {
        const stm = which === "stm";
        tabStm.classList.toggle("ew-tab-active", stm);
        tabPi.classList.toggle("ew-tab-active", !stm);
        tabStm.setAttribute("aria-selected", stm ? "true" : "false");
        tabPi.setAttribute("aria-selected", stm ? "false" : "true");
        panelStm.style.display = stm ? "block" : "none";
        panelPi.style.display = stm ? "none" : "block";
    }

    tabStm.addEventListener("click", () => showEw("stm"));
    tabPi.addEventListener("click", () => showEw("pi"));

    function buildTable(tbodyId, pinList, storageKey) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;

        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
        } catch (_e) {
            saved = {};
        }

        tbody.innerHTML = "";
        pinList.forEach((pin) => {
            const tr = document.createElement("tr");
            const selVal = saved[pin] || "";
            const cycle = ewDerivedCycle(selVal);
            tr.innerHTML = `
                <td class="ew-col-pin"><code>${pin}</code></td>
                <td class="ew-col-var">
                    <select class="ew-assign" data-pin="${pin}" aria-label="Affectation ${pin}">
                        <option value="">—</option>
                        <option value="Servo">Servo</option>
                        <option value="Moteur">Moteur</option>
                        <option value="Autre">Autre</option>
                    </select>
                </td>
                <td class="ew-col-cycle"><span class="ew-cycle-badge ${cycle.cls}" data-pin="${pin}">${cycle.text}</span></td>
            `;
            const sel = tr.querySelector("select");
            if (sel && selVal) sel.value = selVal;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll("select.ew-assign").forEach((sel) => {
            sel.addEventListener("change", () => {
                const pin = sel.dataset.pin;
                const next = { ...saved };
                if (!sel.value) delete next[pin];
                else next[pin] = sel.value;
                saved = next;
                try {
                    localStorage.setItem(storageKey, JSON.stringify(saved));
                } catch (_e) {
                    // Ignore storage quota errors.
                }
                const badge = tbody.querySelector(`.ew-cycle-badge[data-pin="${pin}"]`);
                if (badge) {
                    const c = ewDerivedCycle(sel.value);
                    badge.textContent = c.text;
                    badge.className = `ew-cycle-badge ${c.cls}`;
                }
            });
        });
    }

    buildTable("ew-stm-tbody", getEwStmPinList(), EW_STM_LS);
    buildTable("ew-pi-tbody", getEwPiPinList(), EW_PI_LS);
    showEw("stm");
}

window.addEventListener("DOMContentLoaded", initElectricalWiringTables);