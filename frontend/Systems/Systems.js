(function () {
    "use strict";

    const CIRC = 2 * Math.PI * 48;

    function setBatteryRing(pct) {
        const arc = document.getElementById("sys-batt-health-arc");
        if (!arc) return;
        const p = Math.max(0, Math.min(100, pct));
        arc.style.strokeDasharray = String(CIRC);
        arc.style.strokeDashoffset = String(CIRC * (1 - p / 100));
    }

    function buildSignalBars() {
        document.querySelectorAll(".sys-sig").forEach(function (wrap) {
            const pct = Math.max(0, Math.min(100, parseInt(wrap.getAttribute("data-pct") || "0", 10)));
            const active = Math.ceil((pct / 100) * 5);
            wrap.innerHTML = "";
            for (let i = 0; i < 5; i++) {
                const b = document.createElement("span");
                b.className = "sys-sig__bar" + (i < active ? " sys-sig__bar--on" : "");
                b.style.height = 6 + i * 2 + "px";
                wrap.appendChild(b);
            }
        });
    }

    function initThermalChart() {
        const canvas = document.getElementById("sys-chart-thermal");
        if (!canvas || typeof Chart === "undefined") return;
        const muted = "rgba(148, 163, 184, 0.9)";
        const grid = "rgba(55, 65, 81, 0.45)";

        const labels = ["-5 min", "-4 min", "-3 min", "-2 min", "-1 min", "Now"];
        const jitter = (base, spread) =>
            base.map(function (v, i) {
                return v + Math.sin(i * 0.9 + spread) * 1.2;
            });

        new Chart(canvas.getContext("2d"), {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: "CPU",
                        data: jitter([40, 41, 41.5, 42, 41.8, 42], 1),
                        borderColor: "#22d3ee",
                        backgroundColor: "transparent",
                        tension: 0.35,
                        borderWidth: 2,
                        pointRadius: 0,
                    },
                    {
                        label: "ESC avg",
                        data: jitter([43, 44, 44.5, 45, 44.8, 45], 2),
                        borderColor: "#fb923c",
                        backgroundColor: "transparent",
                        tension: 0.35,
                        borderWidth: 2,
                        pointRadius: 0,
                    },
                    {
                        label: "Battery",
                        data: jitter([29.5, 30, 29.8, 30, 30.1, 30], 3),
                        borderColor: "#34d399",
                        backgroundColor: "transparent",
                        tension: 0.35,
                        borderWidth: 2,
                        pointRadius: 0,
                    },
                    {
                        label: "Ambient",
                        data: jitter([24, 23.8, 24, 24.1, 23.9, 24], 4),
                        borderColor: "#a78bfa",
                        backgroundColor: "transparent",
                        tension: 0.35,
                        borderWidth: 2,
                        pointRadius: 0,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: "index" },
                plugins: {
                    legend: {
                        display: true,
                        position: "bottom",
                        labels: {
                            color: muted,
                            boxWidth: 12,
                            padding: 12,
                            font: { size: 9, weight: "600" },
                        },
                    },
                },
                scales: {
                    x: {
                        ticks: { color: muted, maxRotation: 0, font: { size: 9 } },
                        grid: { color: grid },
                    },
                    y: {
                        ticks: { color: muted, font: { size: 9 } },
                        grid: { color: grid },
                        suggestedMin: 20,
                        suggestedMax: 55,
                    },
                },
            },
        });
    }

    function kickLightMotion() {
        const motors = document.querySelectorAll(".sys-motor");
        if (!motors.length) return;
        setInterval(function () {
            motors.forEach(function (card) {
                const rpmEl = card.querySelector("[data-rpm]");
                if (!rpmEl) return;
                const base = parseInt(rpmEl.textContent.replace(/\D/g, ""), 10) || 5100;
                rpmEl.textContent = String(base + Math.round((Math.random() - 0.5) * 24));
            });
        }, 2200);
    }

    document.addEventListener("DOMContentLoaded", function () {
        setBatteryRing(87);
        buildSignalBars();
        initThermalChart();
        kickLightMotion();
    });
})();
