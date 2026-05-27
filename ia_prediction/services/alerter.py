"""
Alert generation when drowning risk exceeds configured threshold.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Optional, Tuple

from ia_prediction import config
from ia_prediction.models.schemas import AlertEvent

logger = logging.getLogger(__name__)


class Alerter:
    """Emit structured alerts for high-risk swimmers."""

    def check(
        self,
        track_id: int,
        risk_score: float,
        behavior: str,
        bbox: Tuple[float, float, float, float],
    ) -> Optional[AlertEvent]:
        """
        Return AlertEvent if risk exceeds RISK_ALERT_THRESHOLD, else None.
        """
        if risk_score <= config.RISK_ALERT_THRESHOLD:
            return None

        event = AlertEvent(
            track_id=track_id,
            risk_score=risk_score,
            behavior=behavior,
            timestamp=time.time(),
            bbox=bbox,
        )
        alert_dict = event.model_dump()
        logger.warning(json.dumps(alert_dict))
        send_webhook(event)
        return event


def send_webhook(alert: AlertEvent) -> None:
    """Placeholder for external notification integrations."""
    _ = alert
