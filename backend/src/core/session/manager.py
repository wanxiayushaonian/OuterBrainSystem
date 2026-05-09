"""Session manager."""
import uuid
from typing import List, Optional
from datetime import datetime
from .storage import SessionStorage
from .types import Session
from ..runtime.types import Message


class SessionManager:
    """Manages chat sessions."""

    def __init__(self, storage: SessionStorage):
        self.storage = storage
        self._active_sessions = {}

    async def create_session(
        self,
        space_id: int,
        provider_id: str,
        title: Optional[str] = None
    ) -> Session:
        """Create a new session.

        Args:
            space_id: Space ID
            provider_id: Provider identifier
            title: Optional session title

        Returns:
            Created session
        """
        session = Session(
            id=str(uuid.uuid4()),
            space_id=space_id,
            provider_id=provider_id,
            title=title or "新对话",
            messages=[],
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        await self.storage.save(session)
        self._active_sessions[session.id] = session
        return session

    async def get_session(self, session_id: str) -> Optional[Session]:
        """Get a session by ID.

        Args:
            session_id: Session ID

        Returns:
            Session or None if not found
        """
        if session_id in self._active_sessions:
            return self._active_sessions[session_id]

        session = await self.storage.load(session_id)
        if session:
            self._active_sessions[session_id] = session
        return session

    async def add_message(
        self,
        session_id: str,
        message: Message
    ):
        """Add a message to a session.

        Args:
            session_id: Session ID
            message: Message to add
        """
        session = await self.get_session(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        session.messages.append(message)
        session.updated_at = datetime.now()
        await self.storage.save(session)

    async def list_sessions(
        self,
        space_id: int,
        limit: int = 50
    ) -> List[Session]:
        """List sessions for a space.

        Args:
            space_id: Space ID
            limit: Maximum number of sessions

        Returns:
            List of sessions
        """
        return await self.storage.list_by_space(space_id, limit)

    async def delete_session(self, session_id: str):
        """Delete a session.

        Args:
            session_id: Session ID
        """
        await self.storage.delete(session_id)
        self._active_sessions.pop(session_id, None)

    async def update_title(self, session_id: str, title: str):
        """Update session title.

        Args:
            session_id: Session ID
            title: New title
        """
        session = await self.get_session(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        session.title = title
        session.updated_at = datetime.now()
        await self.storage.save(session)
