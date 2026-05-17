# ═══════════════════════════════════════════════════════
# Knowledge Graph Types
# ═══════════════════════════════════════════════════════
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Entity:
    """A named entity extracted from cards."""
    id: int | None = None
    space_id: int = 0
    name: str = ""
    entity_type: str = "concept"  # concept/person/theory/tool/method/event
    description: str = ""
    card_ids: list[int] = field(default_factory=list)
    created_at: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "entity_type": self.entity_type,
            "description": self.description,
            "card_ids": self.card_ids,
        }


@dataclass
class EntityRelation:
    """A typed relationship between two entities."""
    id: int | None = None
    space_id: int = 0
    source_id: int = 0
    target_id: int = 0
    relation_type: str = "related_to"  # is_a/part_of/causes/uses/related_to/contradicts
    confidence: float = 0.8
    evidence: str = ""
    created_at: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "source_id": self.source_id,
            "target_id": self.target_id,
            "relation_type": self.relation_type,
            "confidence": self.confidence,
            "evidence": self.evidence,
        }
