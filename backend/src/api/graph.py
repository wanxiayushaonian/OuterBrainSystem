# ═══════════════════════════════════════════════════════
# Knowledge Graph API Router — /api/graph/* endpoints
# ═══════════════════════════════════════════════════════
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.graph.storage import delete_entity, delete_relation, get_graph, save_graph

logger = logging.getLogger(__name__)
router = APIRouter()


class ExtractRequest(BaseModel):
    cards: list[dict[str, Any]]
    connections: list[dict[str, Any]] = []


class ApplyRequest(BaseModel):
    entities: list[dict[str, Any]]
    relations: list[dict[str, Any]]


@router.get("/{space_id}")
def fetch_graph(space_id: int):
    """Get the knowledge graph for a space."""
    return get_graph(space_id)


@router.post("/extract")
def extract_graph(req: ExtractRequest):
    """Extract entities and relations from cards using LLM."""
    from src.agents.knowledge_graph_agent import KnowledgeGraphAgent
    agent = KnowledgeGraphAgent()
    result = agent.extract(req.cards)
    return result


@router.post("/{space_id}/apply")
def apply_graph(space_id: int, req: ApplyRequest):
    """Save extracted entities and relations to the database."""
    counts = save_graph(space_id, req.entities, req.relations)
    return {"ok": True, **counts}


@router.delete("/{space_id}/entities/{entity_id}")
def remove_entity(space_id: int, entity_id: int):
    """Delete a single entity."""
    if not delete_entity(entity_id):
        raise HTTPException(status_code=404, detail="Entity not found")
    return {"ok": True}


@router.delete("/{space_id}/relations/{relation_id}")
def remove_relation(space_id: int, relation_id: int):
    """Delete a single relation."""
    if not delete_relation(relation_id):
        raise HTTPException(status_code=404, detail="Relation not found")
    return {"ok": True}
