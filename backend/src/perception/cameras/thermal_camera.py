"""
Thermal Camera — AMG8833 (I2C) 8×8 capteur thermique infrarouge

Lit la matrice 8×8 de températures via I2C.
Sur RPi avec le capteur branché → lecture réelle (adafruit-circuitpython-amg88xx).
Sin on simule des données pour le développement.

Câblage lu depuis config/cablage.py.
"""

import sys, os, time, math, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
from config.cablage import THERMAL_CAMERA

import numpy as np

# Essayer d'importer la lib hardware, sinon mode simulation
try:
    import board
    import busio
    import adafruit_amg88xx
    _HW_AVAILABLE = True
except ImportError:
    _HW_AVAILABLE = False


class ThermalCamera:
    """
    Interface capteur thermique AMG8833 (8×8 pixels, I2C).
    Config lue depuis config.cablage.THERMAL_CAMERA.
    Si le hardware n'est pas dispo → simulation réaliste.
    """

    def __init__(self, config: dict = None):
        cfg = config or THERMAL_CAMERA
        self.name       = cfg["name"]
        self.i2c_bus    = cfg["i2c_bus"]
        self.address    = cfg["address"]
        self.sda_gpio   = cfg["sda_gpio"]
        self.scl_gpio   = cfg["scl_gpio"]
        self.resolution = cfg["resolution"]   # (8, 8)
        self.fps        = cfg["fps"]
        self.enabled    = cfg["enabled"]

        self._sensor    = None
        self._hw        = False
        self._sim_t     = 0.0                  # compteur simulation

    # ------------------------------------------------------------------
    def open(self) -> bool:
        """Ouvrir le capteur I2C (ou basculer en simulation)."""
        if _HW_AVAILABLE:
            try:
                i2c = busio.I2C(board.SCL, board.SDA)
                self._sensor = adafruit_amg88xx.AMG88XX(i2c, addr=self.address)
                self._hw = True
                print(f"[THERMAL] {self.name} ouvert — I2C bus={self.i2c_bus} addr=0x{self.address:02X}")
                return True
            except Exception as e:
                print(f"[THERMAL] Hardware init failed ({e}), fallback simulation")
        
        self._hw = False
        print(f"[THERMAL] {self.name} — mode SIMULATION (pas de hardware I2C)")
        return True

    def close(self):
        """Fermer le capteur."""
        self._sensor = None
        self._hw = False
        print(f"[THERMAL] {self.name} fermé")

    # ------------------------------------------------------------------
    def read_pixels(self) -> np.ndarray:
        """
        Lire la matrice 8×8 de températures (°C).

        Returns:
            np.ndarray shape (8, 8) — températures en °C
        """
        if self._hw and self._sensor is not None:
            # Lecture réelle AMG8833
            raw = self._sensor.pixels              # list[list[float]] 8×8
            return np.array(raw, dtype=np.float32)

        # --- Simulation réaliste ---
        return self._simulate_frame()

    def _simulate_frame(self) -> np.ndarray:
        """
        Génère une frame simulée réaliste :
        - fond ambiant ~22-25 °C
        - 1-2 taches chaudes qui bougent (simulant des personnes / hotspots)
        - bruit capteur ±0.5 °C
        """
        self._sim_t += 1.0 / max(self.fps, 1)
        rows, cols = self.resolution  # (8, 8)

        # Fond ambiant
        base = 23.0 + 1.0 * math.sin(self._sim_t * 0.3)
        grid = np.full((rows, cols), base, dtype=np.float32)

        # Hot spot 1 — bouge en cercle
        cx1 = 3.5 + 2.0 * math.sin(self._sim_t * 0.5)
        cy1 = 3.5 + 2.0 * math.cos(self._sim_t * 0.5)
        for r in range(rows):
            for c in range(cols):
                d = math.sqrt((r - cy1)**2 + (c - cx1)**2)
                grid[r, c] += 15.0 * math.exp(-d**2 / 2.0)

        # Hot spot 2 — bouge en sens inverse
        cx2 = 4.5 + 1.5 * math.cos(self._sim_t * 0.7)
        cy2 = 2.5 + 1.5 * math.sin(self._sim_t * 0.4)
        for r in range(rows):
            for c in range(cols):
                d = math.sqrt((r - cy2)**2 + (c - cx2)**2)
                grid[r, c] += 10.0 * math.exp(-d**2 / 3.0)

        # Bruit capteur
        grid += np.random.normal(0, 0.5, (rows, cols)).astype(np.float32)

        return grid

    # ------------------------------------------------------------------
    def get_temperature_stats(self) -> dict:
        """Stats sur la dernière lecture."""
        pixels = self.read_pixels()
        return {
            "min_temp": float(np.min(pixels)),
            "max_temp": float(np.max(pixels)),
            "avg_temp": float(np.mean(pixels)),
            "pixels": pixels.tolist(),
        }

    def enable(self):
        self.enabled = True

    def disable(self):
        self.enabled = False
