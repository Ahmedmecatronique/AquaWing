"""
Enrichissement détections RGB — 2 parties IA :
  1) Détection personne (YOLO)
  2) Comportement nage / noyade (ia_prediction)
"""

from __future__ import annotations

from typing import Any


def _is_drowning_swimmer(swimmer: Any) -> bool:
    behavior = str(getattr(swimmer, "behavior", ""))
    if getattr(swimmer, "alert", False):
        return True
    if behavior == "drowning_risk":
        return True
    risk = float(getattr(swimmer, "risk_score", 0.0))
    try:
        from ia_prediction import config

        return risk >= config.RISK_ALERT_THRESHOLD
    except Exception:
        return risk >= 0.75


def _behavior_overlay(behavior: str, drowning: bool) -> tuple[str, str, str, bool]:
    """
    Retourne (status, label, color, can_swim).
    status: swimming | suspicious | drowning | person
    """
    behavior = str(behavior or "suspicious")
    if drowning or behavior == "drowning_risk":
        return "drowning", "NE SAIT PAS NAGER", "#ef4444", False
    if behavior == "normal_swimming":
        return "swimming", "SAIT NAGER", "#22c55e", True
    if behavior == "suspicious":
        return "suspicious", "INCERTAIN", "#f59e0b", False
    return "person", "PERSONNE", "#22c55e", False


def swimmer_skill_fields(behavior: str, alert: bool = False, risk_score: float = 0.0) -> dict[str, Any]:
    """Champs UI pour partie 2 IA (sait nager / incertain / ne sait pas)."""
    drowning = alert or behavior == "drowning_risk"
    if not drowning and risk_score > 0:
        try:
            from ia_prediction import config

            drowning = risk_score >= config.RISK_ALERT_THRESHOLD
        except Exception:
            drowning = risk_score >= 0.75
    status, label, _color, can_swim = _behavior_overlay(str(behavior or "suspicious"), drowning)
    return {
        "status": status,
        "label": label,
        "can_swim": can_swim,
        "swim_skill": "yes" if can_swim else ("no" if status == "drowning" else "unknown"),
    }


def swimmers_to_overlay_detections(
    swimmers: list[Any],
    frame_width: int,
    frame_height: int,
) -> list[dict[str, Any]]:
    """Convertit les nageurs ia_prediction en boxes pour l'overlay Optical."""
    nw = max(int(frame_width), 1)
    nh = max(int(frame_height), 1)
    out: list[dict[str, Any]] = []

    for s in swimmers:
        bbox = getattr(s, "bbox", None)
        if not bbox or len(bbox) < 4:
            continue
        x1, y1, x2, y2 = (float(v) for v in bbox[:4])
        behavior = str(getattr(s, "behavior", "suspicious"))
        drowning = _is_drowning_swimmer(s)
        status, label, color, can_swim = _behavior_overlay(behavior, drowning)
        conf = float(getattr(s, "behavior_confidence", 0.5))
        risk = float(getattr(s, "risk_score", 0.0))
        out.append(
            {
                "x": max(0.0, min(1.0, x1 / nw)),
                "y": max(0.0, min(1.0, y1 / nh)),
                "w": max(0.0, min(1.0, (x2 - x1) / nw)),
                "h": max(0.0, min(1.0, (y2 - y1) / nh)),
                "status": status,
                "alert": drowning,
                "can_swim": can_swim,
                "swim_skill": "yes" if can_swim else ("no" if status == "drowning" else "unknown"),
                "behavior": behavior,
                "risk_score": round(risk, 3),
                "track_id": int(getattr(s, "track_id", 0)),
                "label": label,
                "conf": round((conf if status != "drowning" else risk) * 100),
                "color": color,
                "class": "person",
            }
        )
    return out


def analyze_frame_with_drowning(jpeg: bytes, frame_width: int, frame_height: int) -> list[dict[str, Any]] | None:
    """Pipeline ia_prediction (partie 2 : comportement nage). None si indisponible."""
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
