"""Context data types for hybrid loading strategy."""
from dataclasses import dataclass
from typing import List, Dict, Any
from datetime import datetime


@dataclass
class CardIndex:
    """Lightweight card index for peripheral region."""
    id: int
    title: str
    status: str


@dataclass
class HybridCanvasContext:
    """Canvas context with hybrid loading strategy.

    Core cards are loaded with full content (text, metadata).
    Peripheral cards are loaded as index only (id, title, status).
    """
    core_cards: List[Dict[str, Any]]
    peripheral_cards: List[CardIndex]
    connections: List[Dict[str, Any]]
    groups: List[Dict[str, Any]]
    active_labels: List[str]
    total_cards: int
    last_updated: datetime
