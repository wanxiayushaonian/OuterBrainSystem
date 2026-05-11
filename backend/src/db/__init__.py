# ═══════════════════════════════════════════════════════
# Database module — SQLite persistence for spaces
# ═══════════════════════════════════════════════════════
import json
import logging
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_default_db_path = Path(__file__).parent.parent.parent / "run" / "nexus.db"
DB_PATH = Path(os.environ.get("NEXUS_DB_PATH", str(_default_db_path)))

_conn: sqlite3.Connection | None = None


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA foreign_keys=ON")
        _init_tables(_conn)
        logger.info(f"Database initialized at {DB_PATH}")
    return _conn


def _init_tables(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS spaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            state_json TEXT NOT NULL DEFAULT '{}'
        );
    """)
    conn.commit()


def _row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


# ── Space CRUD ──

DEFAULT_STATE = {
    "cards": [],
    "connections": [],
    "versions": [],
    "currentVersion": -1,
    "branches": [{"id": 0, "name": "main", "color": "oklch(0.7 0.15 250)", "forkFrom": -1}],
    "currentBranch": 0,
    "nextBranchId": 1,
    "nextId": 1,
}


def list_spaces() -> list[dict]:
    conn = get_conn()
    rows = conn.execute("SELECT id, name, created_at, updated_at FROM spaces ORDER BY updated_at DESC").fetchall()
    return [_row_to_dict(r) for r in rows]


def create_space(name: str) -> dict:
    conn = get_conn()
    now = time.time()
    state_json = json.dumps(DEFAULT_STATE, ensure_ascii=False)
    cur = conn.execute(
        "INSERT INTO spaces (name, created_at, updated_at, state_json) VALUES (?, ?, ?, ?)",
        (name, now, now, state_json),
    )
    conn.commit()
    space_id = cur.lastrowid
    logger.info(f"Created space '{name}' (id={space_id})")
    return {"id": space_id, "name": name, "created_at": now, "updated_at": now}


def delete_space(space_id: int) -> bool:
    conn = get_conn()
    cur = conn.execute("DELETE FROM spaces WHERE id = ?", (space_id,))
    conn.commit()
    return cur.rowcount > 0


def get_space_state(space_id: int) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT state_json FROM spaces WHERE id = ?", (space_id,)).fetchone()
    if row is None:
        return None
    return json.loads(row["state_json"])


def save_space_state(space_id: int, state: dict[str, Any]) -> bool:
    conn = get_conn()
    state_json = json.dumps(state, ensure_ascii=False)
    now = time.time()
    cur = conn.execute(
        "UPDATE spaces SET state_json = ?, updated_at = ? WHERE id = ?",
        (state_json, now, space_id),
    )
    conn.commit()
    return cur.rowcount > 0


def rename_space(space_id: int, name: str) -> bool:
    conn = get_conn()
    now = time.time()
    cur = conn.execute(
        "UPDATE spaces SET name = ?, updated_at = ? WHERE id = ?",
        (name, now, space_id),
    )
    conn.commit()
    return cur.rowcount > 0
