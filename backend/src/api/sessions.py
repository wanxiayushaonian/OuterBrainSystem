"""Session API endpoints."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from src.core import SessionManager, Session
from src.core.session import SessionStorage

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class CreateSessionRequest(BaseModel):
    """Create session request."""
    space_id: int
    provider_id: str
    title: Optional[str] = None


class UpdateTitleRequest(BaseModel):
    """Update title request."""
    title: str


# TODO: Initialize session_manager from app state
async def get_session_manager() -> SessionManager:
    """Get session manager instance."""
    storage = SessionStorage()
    await storage.init_db()
    return SessionManager(storage)


@router.post("", response_model=dict)
async def create_session(request: CreateSessionRequest):
    """Create a new chat session.

    Returns:
        Created session data
    """
    manager = await get_session_manager()
    session = await manager.create_session(
        space_id=request.space_id,
        provider_id=request.provider_id,
        title=request.title
    )
    return session.to_dict()


@router.get("/{session_id}", response_model=dict)
async def get_session(session_id: str):
    """Get a session by ID.

    Returns:
        Session data
    """
    manager = await get_session_manager()
    session = await manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.to_dict()


@router.get("", response_model=List[dict])
async def list_sessions(space_id: int, limit: int = 50):
    """List sessions for a space.

    Args:
        space_id: Space ID
        limit: Maximum number of sessions

    Returns:
        List of session data
    """
    manager = await get_session_manager()
    sessions = await manager.list_sessions(space_id, limit)
    return [s.to_dict() for s in sessions]


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """Delete a session.

    Returns:
        Success message
    """
    manager = await get_session_manager()
    await manager.delete_session(session_id)
    return {"success": True}


@router.patch("/{session_id}/title")
async def update_session_title(session_id: str, request: UpdateTitleRequest):
    """Update session title.

    Returns:
        Success message
    """
    manager = await get_session_manager()
    await manager.update_title(session_id, request.title)
    return {"success": True}
