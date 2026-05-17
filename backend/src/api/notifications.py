"""Proactive notification endpoints for agent suggestions."""
import time
import uuid
import logging
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

# In-memory notification queue
_notifications: List[Dict[str, Any]] = []


class Notification(BaseModel):
    id: str
    type: str
    message: str
    card_ids: List[int] = []
    created_at: float


def push_notification(
    type: str,
    message: str,
    card_ids: Optional[List[int]] = None,
) -> str:
    """Push a notification to the in-memory queue. Returns notification ID."""
    nid = str(uuid.uuid4())[:8]
    _notifications.append({
        "id": nid,
        "type": type,
        "message": message,
        "card_ids": card_ids or [],
        "created_at": time.time(),
    })
    # Keep queue bounded
    if len(_notifications) > 100:
        _notifications[:] = _notifications[-50:]
    logger.info(f"Notification pushed: {type} - {message[:50]}")
    return nid


@router.get("/pending", response_model=List[Notification])
async def get_pending():
    """Return all pending (unacknowledged) notifications."""
    return _notifications


@router.post("/{notification_id}/ack")
async def acknowledge(notification_id: str):
    """Acknowledge (dismiss) a notification."""
    global _notifications
    _notifications = [n for n in _notifications if n["id"] != notification_id]
    return {"ok": True}
