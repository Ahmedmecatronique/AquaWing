"""
Heatmap Stream — Thermal Camera AMG8833 → Image JPEG

Lit la matrice 8×8 via ThermalCamera, interpole en image 320×320,
applique une colormap « jet » et renvoie un JPEG prêt à servir
sur l'endpoint /thermal du serveur.

Usage depuis le serveur FastAPI :
    from backend.src.streaming.vedio_heatmap_stream import HeatmapStreamer
    streamer = HeatmapStreamer()
    streamer.start()
    jpeg_bytes = streamer.get_jpeg()
"""

import io
import numpy as np
from PIL import Image

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
from backend.src.perception.cameras.thermal_camera import ThermalCamera


# ── Colormap "jet" maison (pas besoin de matplotlib) ────────────────────────
def _jet_colormap(n: int = 256) -> np.ndarray:
    """Génère une LUT jet RGB (n, 3) uint8."""
    lut = np.zeros((n, 3), dtype=np.uint8)
    for i in range(n):
        t = i / (n - 1)        # 0 → 1
        r = min(1, max(0, 1.5 - abs(t - 0.75) * 4))
        g = min(1, max(0, 1.5 - abs(t - 0.50) * 4))
        b = min(1, max(0, 1.5 - abs(t - 0.25) * 4))
        lut[i] = [int(r * 255), int(g * 255), int(b * 255)]
    return lut

_JET_LUT = _jet_colormap(256)


class HeatmapStreamer:
    """
    Convertit les pixels 8×8 du capteur thermique en image heatmap JPEG.
    """

    def __init__(self, output_size: int = 320, temp_min: float = 18.0, temp_max: float = 45.0):
        """
        Args:
            output_size: taille de l'image de sortie (carrée)
            temp_min: température plancher pour la colormap (°C)
            temp_max: température plafond pour la colormap (°C)
        """
        self.output_size = output_size
        self.temp_min = temp_min
        self.temp_max = temp_max
        self._camera = ThermalCamera()
        self._started = False

    def start(self):
        """Démarrer le capteur."""
        self._camera.open()
        self._started = True

    def stop(self):
        """Arrêter le capteur."""
        self._camera.close()
        self._started = False

    # ------------------------------------------------------------------ 
    def get_frame(self) -> np.ndarray:
        """Retourne la matrice 8×8 brute (°C)."""
        if not self._started:
            self.start()
        return self._camera.read_pixels()

    def get_heatmap_image(self) -> Image.Image:
        """
        Lit les pixels, normalise, applique la colormap jet,
        et redimensionne en image PIL (output_size × output_size).
        """
        pixels = self.get_frame()        # (8, 8) float32

        # Normaliser entre 0-255
        normed = (pixels - self.temp_min) / max(self.temp_max - self.temp_min, 0.01)
        normed = np.clip(normed, 0.0, 1.0)
        indices = (normed * 255).astype(np.uint8)

        # Appliquer la colormap
        rgb = _JET_LUT[indices]          # (8, 8, 3)

        # Créer l'image et redimensionner (interpolation bilinéaire)
        img = Image.fromarray(rgb, mode="RGB")
        img = img.resize((self.output_size, self.output_size), Image.BILINEAR)
        return img

    def get_jpeg(self, quality: int = 85) -> bytes:
        """
        Retourne l'image heatmap encodée en JPEG (bytes).
        C'est ce que le endpoint /thermal renvoie au frontend.
        """
        img = self.get_heatmap_image()
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        return buf.getvalue()

    def get_stats(self) -> dict:
        """Retourne les stats de la dernière lecture."""
        return self._camera.get_temperature_stats()