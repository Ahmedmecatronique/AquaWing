"""
Enrichissement détections RGB — personne (vert) vs noyade (rouge) via ia_prediction.
"""

from __future__ import annotations

from typing import Any


def _is_drowning_swimmer(swimmer: Any) -> bool:
    try:
        if getattr(swimmer, "alert", False):
            return True
        if getattr(swimmer, "behavior", "") == "drowning_risk":
            return True
        risk = float(getattr(swimmer, "risk_score", 0.0))
        from ia_prediction import config

        return risk >= config.RISK_ALERT_THRESHOLD
    except Exception:
        risk = float(getattr(swimmer, "risk_score", 0.0))
        return risk >= 0.75


def swimmers_to_overlay_detections(
    swimmers: list[Any],
    frame_width: int,
    frame_height: int,
) -> list[dict[str, Any]]:
    """Convertit les nageurs ia_prediction en boxes normalisées pour l'overlay Optical."""
    nw = max(int(frame_width), 1)
    nh = max(int(frame_height), 1)
    out: list[dict[str, Any]] = []

    for s in swimmers:
        bbox = getattr(s, "bbox", None)
        if not bbox or len(bbox) < 4:
            continue
        x1, y1, x2, y2 = (float(v) for v in bbox[:4])
        drowning = _is_drowning_swimmer(s)
        conf = float(getattr(s, "behavior_confidence", 0.5))
        risk = float(getattr(s, "risk_score", 0.0))
        out.append(
            {
                "x": max(0.0, min(1.0, x1 / nw)),
                "y": max(0.0, min(1.0, y1 / nh)),
                "w": max(0.0, min(1.0, (x2 - x1) / nw)),
                "h": max(0.0, min(1.0, (y2 - y1) / nh)),
                "status": "drowning" if drowning else "person",
                "alert": drowning,
                "behavior": str(getattr(s, "behavior", "suspicious")),
                "risk_score": round(risk, 3),
                "track_id": int(getattr(s, "track_id", 0)),
                "label": "NOYADE" if drowning else "Personne",
                "conf": round((risk if drowning else conf) * 100),
                "color": "#ef4444" if drowning else "#22c55e",
                "class": "person",
            }
        )
    return out


def analyze_frame_with_drowning(jpeg: bytes, frame_width: int, frame_height: int) -> list[dict[str, Any]] | None:
    """Pipeline ia_prediction (tracking + risque noyade). Retourne None si indisponible."""
    if not jpeg:
        return None
    try:
        import cv2
        import numpy as np
        from ia_prediction.pipeline import process_frame

        img = cv2.imdecode(np.frombuffer(jpeg, dtype=np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            return None
        h, w = img.shape[:2]
        result = process_frame(img, frame_id=int(__import__("time").time() * 1000) % 1_000_000)
        swimmers = result.swimmers or []
        if not swimmers:
            return []
        return swimmers_to_overlay_detections(swimmers, w or frame_width, h or frame_height)
    except Exception as exc:
        print(f"ia_prediction overlay skipped: {exc}")
        return None
