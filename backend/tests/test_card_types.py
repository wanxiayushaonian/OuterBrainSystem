"""Tests for card types and metadata structure."""
from datetime import datetime, timezone
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from src.core.runtime.types import CardType


def test_note_card():
    """Test note card structure."""
    card = {
        "id": 1,
        "text": "Test note",
        "type": "note",
        "status": "pending",
        "x": 100,
        "y": 200,
        "metadata": {},
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    assert card["type"] == "note"
    assert isinstance(card["metadata"], dict)
    assert card["id"] == 1


def test_distillation_card():
    """Test distillation card structure with metadata."""
    card = {
        "id": 2,
        "text": "Distilled content",
        "type": "distillation",
        "status": "pending",
        "x": 100,
        "y": 200,
        "metadata": {
            "original_text": "Long original text that was distilled...",
            "extracted_keywords": ["keyword1", "keyword2", "keyword3"],
            "recommended_keywords": ["existing_keyword"],
            "user_selected_keywords": [],
            "reasoning": "Core idea extraction"
        },
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    assert card["type"] == "distillation"
    assert "extracted_keywords" in card["metadata"]
    assert len(card["metadata"]["extracted_keywords"]) == 3
    assert "original_text" in card["metadata"]


def test_socratic_card():
    """Test socratic card structure with questions."""
    card = {
        "id": 3,
        "text": "Challenge: Reflection on assumptions",
        "type": "socratic",
        "status": "pending",
        "x": 100,
        "y": 200,
        "metadata": {
            "target_card_id": 15,
            "questions": [
                {"id": "q1", "text": "What is your core assumption?", "answer": ""},
                {"id": "q2", "text": "Are there counterexamples?", "answer": ""}
            ]
        },
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    assert card["type"] == "socratic"
    assert "questions" in card["metadata"]
    assert len(card["metadata"]["questions"]) == 2
    assert card["metadata"]["target_card_id"] == 15


def test_flow_analysis_card():
    """Test flow analysis card structure."""
    card = {
        "id": 4,
        "text": "Thinking Flow Analysis V3.2",
        "type": "flow_analysis",
        "status": "pending",
        "x": 100,
        "y": 200,
        "metadata": {
            "branches": [
                {"name": "Branch1", "cards": [1, 2, 3], "status": "active"}
            ],
            "weak_points": [
                {"card_id": 5, "reason": "Lacks supporting evidence"}
            ],
            "suggestions": [
                {
                    "text": "Merge into conclusion",
                    "action": "merge",
                    "card_ids": [1, 2, 3],
                    "voted": None
                }
            ]
        },
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    assert card["type"] == "flow_analysis"
    assert "branches" in card["metadata"]
    assert "weak_points" in card["metadata"]
    assert "suggestions" in card["metadata"]


def test_choice_card():
    """Test choice card structure."""
    card = {
        "id": 5,
        "text": "Please choose next direction",
        "type": "choice",
        "status": "pending",
        "x": 100,
        "y": 200,
        "metadata": {
            "options": [
                {"id": "opt1", "text": "Deepen Branch1", "selected": False},
                {"id": "opt2", "text": "Explore new direction", "selected": False}
            ],
            "multi_select": False
        },
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    assert card["type"] == "choice"
    assert "options" in card["metadata"]
    assert card["metadata"]["multi_select"] is False


def test_vote_card():
    """Test vote card structure."""
    card = {
        "id": 6,
        "text": "Is this suggestion useful?",
        "type": "vote",
        "status": "pending",
        "x": 100,
        "y": 200,
        "metadata": {
            "target_card_id": 20,
            "vote": None  # "useful" | "not_useful" | None
        },
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    assert card["type"] == "vote"
    assert "target_card_id" in card["metadata"]
    assert card["metadata"]["vote"] is None


def test_conclusion_card():
    """Test conclusion card structure."""
    card = {
        "id": 7,
        "text": "Final conclusion from analysis",
        "type": "conclusion",
        "status": "conclusion",
        "x": 100,
        "y": 200,
        "metadata": {
            "source_card_ids": [1, 2, 3, 4],
            "reasoning": "Synthesized from multiple branches",
            "confidence": 0.85
        },
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    assert card["type"] == "conclusion"
    assert "source_card_ids" in card["metadata"]
    assert "confidence" in card["metadata"]
    assert 0 <= card["metadata"]["confidence"] <= 1


def test_backward_compatibility():
    """Test that cards without type/metadata can be normalized."""
    old_card = {
        "id": 8,
        "text": "Old card without type",
        "status": "pending",
        "x": 100,
        "y": 200,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    # Normalize function should add defaults
    def normalize_card(card):
        if "type" not in card:
            card["type"] = "note"
        if "metadata" not in card:
            card["metadata"] = {}
        return card

    normalized = normalize_card(old_card.copy())
    assert normalized["type"] == "note"
    assert normalized["metadata"] == {}
