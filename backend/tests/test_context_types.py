"""Tests for context data types."""
from datetime import datetime, timezone
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from src.core.context_types import CardIndex, HybridCanvasContext


def test_card_index_creation():
    """Test CardIndex dataclass creation."""
    index = CardIndex(id=1, title="Test Card", status="pending")
    assert index.id == 1
    assert index.title == "Test Card"
    assert index.status == "pending"


def test_canvas_context_creation():
    """Test HybridCanvasContext dataclass creation."""
    ctx = HybridCanvasContext(
        core_cards=[],
        peripheral_cards=[],
        connections=[],
        groups=[],
        active_labels=["supports", "contradicts"],
        total_cards=0,
        last_updated=datetime.now(timezone.utc)
    )
    assert len(ctx.core_cards) == 0
    assert len(ctx.active_labels) == 2
    assert ctx.total_cards == 0


def test_canvas_context_with_data():
    """Test HybridCanvasContext with actual data."""
    core_card = {"id": 1, "text": "Core card", "status": "conclusion"}
    peripheral = CardIndex(id=2, title="Peripheral card", status="")

    ctx = HybridCanvasContext(
        core_cards=[core_card],
        peripheral_cards=[peripheral],
        connections=[{"from": 1, "to": 2, "label": "supports"}],
        groups=[],
        active_labels=["supports"],
        total_cards=2,
        last_updated=datetime.now(timezone.utc)
    )

    assert len(ctx.core_cards) == 1
    assert len(ctx.peripheral_cards) == 1
    assert ctx.total_cards == 2
    assert ctx.core_cards[0]["id"] == 1
    assert ctx.peripheral_cards[0].id == 2
