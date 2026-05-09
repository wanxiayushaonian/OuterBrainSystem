# ═══════════════════════════════════════════════════════
# Spaces API Router — /api/spaces/* endpoints
# ═══════════════════════════════════════════════════════
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.db import (
    create_space,
    delete_space,
    get_space_state,
    list_spaces,
    rename_space,
    save_space_state,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateSpaceRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class RenameSpaceRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


@router.get("")
def get_spaces():
    """List all spaces."""
    return list_spaces()


@router.post("")
def post_space(req: CreateSpaceRequest):
    """Create a new space."""
    return create_space(req.name)


@router.delete("/{space_id}")
def remove_space(space_id: int):
    """Delete a space."""
    if not delete_space(space_id):
        raise HTTPException(status_code=404, detail="Space not found")
    return {"ok": True}


@router.patch("/{space_id}")
def patch_space(space_id: int, req: RenameSpaceRequest):
    """Rename a space."""
    if not rename_space(space_id, req.name):
        raise HTTPException(status_code=404, detail="Space not found")
    return {"ok": True}


@router.get("/{space_id}/state")
def load_state(space_id: int):
    """Load full canvas state for a space."""
    state = get_space_state(space_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Space not found")
    return state


@router.put("/{space_id}/state")
def save_state(space_id: int, state: dict):
    """Save full canvas state for a space."""
    if not save_space_state(space_id, state):
        raise HTTPException(status_code=404, detail="Space not found")
    return {"ok": True}
