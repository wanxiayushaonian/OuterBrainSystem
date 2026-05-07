"""Tests for Context Manager."""
from datetime import datetime, timedelta, timezone
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from src.core.context_manager import ContextManager
from src.core.context_types import HybridCanvasContext


def test_filter_recent_cards():
    """Test filtering cards by recency."""
    manager = ContextManager()

    now = datetime.now(timezone.utc)
    cards = [
        {"id": 1, "text": "Recent", "updated_at": now.isoformat()},
        {"id": 2, "text": "Old", "updated_at": (now - timedelta(hours=2)).isoformat()},
        {"id": 3, "text": "Very recent", "updated_at": now.isoformat()},
    ]

    recent = manager._filter_recent_cards(cards, hours=1)
    assert len(recent) == 2
    assert recent[0]["id"] in [1, 3]
    assert recent[1]["id"] in [1, 3]


def test_filter_by_status():
    """Test filtering cards by status."""
    manager = ContextManager()

    cards = [
        {"id": 1, "text": "Pending", "status": "pending"},
        {"id": 2, "text": "Conclusion", "status": "conclusion"},
        {"id": 3, "text": "Verified", "status": "verified"},
        {"id": 4, "text": "Another conclusion", "status": "conclusion"},
    ]

    conclusions = manager._filter_by_status(cards, "conclusion")
    assert len(conclusions) == 2
    assert conclusions[0]["id"] in [2, 4]
    assert conclusions[1]["id"] in [2, 4]


def test_deduplicate_and_limit():
    """Test deduplication and limiting."""
    manager = ContextManager()

    cards = [
        {"id": 1, "text": "Card 1"},
        {"id": 2, "text": "Card 2"},
        {"id": 1, "text": "Card 1 duplicate"},  # Duplicate
        {"id": 3, "text": "Card 3"},
    ]

    result = manager._deduplicate_and_limit(cards, limit=2)
    assert len(result) == 2
    # Should keep first occurrence
    ids = [c["id"] for c in result]
    assert 1 in ids
    assert 2 in ids


def test_create_card_index():
    """Test creating card index from full card."""
    manager = ContextManager()

    card = {
        "id": 1,
        "text": "Full card content with lots of text",
        "status": "pending",
        "metadata": {"key": "value"}
    }

    index = manager._create_card_index(card)
    assert index.id == 1
    assert index.title == "Full card content with lots of text"
    assert index.status == "pending"


def test_load_context_from_state():
    """Test loading context from space state."""
    manager = ContextManager()

    now = datetime.now(timezone.utc)
    state = {
        "cards": [
            {"id": 1, "text": "Recent card", "status": "conclusion", "updated_at": now.isoformat()},
            {"id": 2, "text": "Old card", "status": "", "updated_at": (now - timedelta(hours=2)).isoformat()},
            {"id": 3, "text": "Another recent", "status": "pending", "updated_at": now.isoformat()},
        ],
        "connections": [{"from": 1, "to": 2, "label": "supports"}],
        "groups": [],
    }

    context = manager.load_context_from_state(state, viewport={})

    assert isinstance(context, HybridCanvasContext)
    assert context.total_cards == 3
    # Core should include recent cards and conclusions
    assert len(context.core_cards) >= 1
    assert len(context.connections) == 1
