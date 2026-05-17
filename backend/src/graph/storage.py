# ═══════════════════════════════════════════════════════
# Knowledge Graph Storage — SQLite persistence
# ═══════════════════════════════════════════════════════
from __future__ import annotations

import json
import logging
import time
from typing import Any

from src.db import get_conn
from src.graph.types import Entity, EntityRelation

logger = logging.getLogger(__name__)


def init_graph_tables() -> None:
    """Create knowledge graph tables if they don't exist."""
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS entities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            space_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            entity_type TEXT NOT NULL DEFAULT 'concept',
            description TEXT DEFAULT '',
            card_ids TEXT DEFAULT '[]',
            created_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS entity_relations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            space_id INTEGER NOT NULL,
            source_id INTEGER NOT NULL,
            target_id INTEGER NOT NULL,
            relation_type TEXT NOT NULL DEFAULT 'related_to',
            confidence REAL DEFAULT 0.8,
            evidence TEXT DEFAULT '',
            created_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_entities_space ON entities(space_id);
        CREATE INDEX IF NOT EXISTS idx_relations_space ON entity_relations(space_id);
    """)
    conn.commit()
    logger.info("Knowledge graph tables initialized")


def get_graph(space_id: int) -> dict[str, Any]:
    """Get all entities and relations for a space."""
    conn = get_conn()
    init_graph_tables()

    entity_rows = conn.execute(
        "SELECT * FROM entities WHERE space_id = ? ORDER BY id", (space_id,)
    ).fetchall()

    relation_rows = conn.execute(
        "SELECT * FROM entity_relations WHERE space_id = ? ORDER BY id", (space_id,)
    ).fetchall()

    entities = []
    for row in entity_rows:
        entities.append({
            "id": row["id"],
            "name": row["name"],
            "entity_type": row["entity_type"],
            "description": row["description"] or "",
            "card_ids": json.loads(row["card_ids"]) if row["card_ids"] else [],
        })

    relations = []
    for row in relation_rows:
        relations.append({
            "id": row["id"],
            "source_id": row["source_id"],
            "target_id": row["target_id"],
            "relation_type": row["relation_type"],
            "confidence": row["confidence"],
            "evidence": row["evidence"] or "",
        })

    return {"entities": entities, "relations": relations}


def save_graph(space_id: int, entities: list[dict], relations: list[dict]) -> dict[str, int]:
    """Save entities and relations for a space. Returns counts."""
    conn = get_conn()
    init_graph_tables()
    now = time.time()

    # Clear existing graph for this space
    conn.execute("DELETE FROM entity_relations WHERE space_id = ?", (space_id,))
    conn.execute("DELETE FROM entities WHERE space_id = ?", (space_id,))

    # Insert entities
    entity_id_map: dict[int, int] = {}  # old_id -> new_id
    for ent in entities:
        cur = conn.execute(
            "INSERT INTO entities (space_id, name, entity_type, description, card_ids, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (space_id, ent["name"], ent.get("entity_type", "concept"), ent.get("description", ""), json.dumps(ent.get("card_ids", [])), now),
        )
        new_id = cur.lastrowid
        if ent.get("id") is not None:
            entity_id_map[ent["id"]] = new_id

    # Insert relations
    for rel in relations:
        src = entity_id_map.get(rel["source_id"], rel["source_id"])
        tgt = entity_id_map.get(rel["target_id"], rel["target_id"])
        conn.execute(
            "INSERT INTO entity_relations (space_id, source_id, target_id, relation_type, confidence, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (space_id, src, tgt, rel.get("relation_type", "related_to"), rel.get("confidence", 0.8), rel.get("evidence", ""), now),
        )

    conn.commit()
    logger.info("Graph saved for space %d: %d entities, %d relations", space_id, len(entities), len(relations))
    return {"entities": len(entities), "relations": len(relations)}


def delete_entity(entity_id: int) -> bool:
    """Delete a single entity and its relations."""
    conn = get_conn()
    conn.execute("DELETE FROM entity_relations WHERE source_id = ? OR target_id = ?", (entity_id, entity_id))
    cur = conn.execute("DELETE FROM entities WHERE id = ?", (entity_id,))
    conn.commit()
    return cur.rowcount > 0


def delete_relation(relation_id: int) -> bool:
    """Delete a single relation."""
    conn = get_conn()
    cur = conn.execute("DELETE FROM entity_relations WHERE id = ?", (relation_id,))
    conn.commit()
    return cur.rowcount > 0


# Auto-init on import
init_graph_tables()
