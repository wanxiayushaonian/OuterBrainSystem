"""Session storage interface."""
import json
import aiosqlite
from typing import List, Optional
from pathlib import Path
from .types import Session


class SessionStorage:
    """SQLite-based session storage."""

    def __init__(self, db_path: str = "data/sessions.db"):
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    async def init_db(self):
        """Initialize database schema."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    space_id INTEGER NOT NULL,
                    provider_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    messages TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_space_id ON sessions(space_id)
            """)
            await db.commit()

    async def save(self, session: Session):
        """Save or update a session."""
        async with aiosqlite.connect(self.db_path) as db:
            data = session.to_dict()
            await db.execute("""
                INSERT OR REPLACE INTO sessions
                (id, space_id, provider_id, title, messages, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                data["id"],
                data["space_id"],
                data["provider_id"],
                data["title"],
                json.dumps(data["messages"]),
                data["created_at"],
                data["updated_at"]
            ))
            await db.commit()

    async def load(self, session_id: str) -> Optional[Session]:
        """Load a session by ID."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM sessions WHERE id = ?",
                (session_id,)
            ) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return None

                data = dict(row)
                data["messages"] = json.loads(data["messages"])
                return Session.from_dict(data)

    async def list_by_space(
        self,
        space_id: int,
        limit: int = 50
    ) -> List[Session]:
        """List sessions for a space."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT * FROM sessions
                   WHERE space_id = ?
                   ORDER BY updated_at DESC
                   LIMIT ?""",
                (space_id, limit)
            ) as cursor:
                rows = await cursor.fetchall()
                sessions = []
                for row in rows:
                    data = dict(row)
                    data["messages"] = json.loads(data["messages"])
                    sessions.append(Session.from_dict(data))
                return sessions

    async def delete(self, session_id: str):
        """Delete a session."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            await db.commit()
