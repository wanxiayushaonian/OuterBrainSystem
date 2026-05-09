# ═══════════════════════════════════════════════════════
# LLM Pydantic schemas — request/response models
# ═══════════════════════════════════════════════════════
from pydantic import BaseModel, Field


# ── Request models ──

class CompressRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000, description="Original thought text")
    max_length: int = Field(default=10, ge=2, le=30, description="Max title length (chars)")


class KeywordsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000, description="Text to extract keywords from")
    max_keywords: int = Field(default=8, ge=1, le=20, description="Max number of keywords")


class FlowRequest(BaseModel):
    cards: list[dict] = Field(..., min_length=1, description="List of {id, text} card objects")
    connections: list[dict] = Field(default_factory=list, description="List of {from, to, label} connections")


class InquiryRequest(BaseModel):
    cards: list[dict] = Field(..., min_length=1, description="Selected cards for inquiry")
    question: str | None = Field(default=None, description="Optional follow-up question")


class DiscoverRequest(BaseModel):
    cards: list[dict] = Field(..., min_length=2, description="List of {id, text} card objects")
    existing_connections: list[dict] = Field(default_factory=list, description="Existing connections to avoid duplicates")
    max_suggestions: int = Field(default=5, ge=1, le=10, description="Max number of suggested connections")


class DebateRequest(BaseModel):
    cards: list[dict] = Field(..., min_length=1, description="Cards representing the thesis")
    stance: str = Field(default="against", description="'for' or 'against' the thesis")


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=200, description="Search query")
    cards: list[dict] = Field(..., min_length=1, description="List of {id, text} card objects")
    max_results: int = Field(default=10, ge=1, le=50, description="Max results to return")


class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, description="Conversation history")
    canvas_context: dict = Field(default_factory=dict, description="Canvas state: cards, connections, groups")
    session_id: str | None = Field(default=None, description="Session ID for tool result relay")


class ToolResultRequest(BaseModel):
    session_id: str = Field(..., description="Session ID matching the streaming call")
    tool_use_id: str = Field(..., description="Tool use block ID from Claude's response")
    result: str = Field(default="Tool executed successfully.", description="Tool execution result")


# ── Response models ──

class CompressResponse(BaseModel):
    title: str
    original_length: int
    compressed_length: int


class KeywordsResponse(BaseModel):
    keywords: list[str]


class FlowResponse(BaseModel):
    summary: str
    next_steps: list[str]
    gaps: list[str]


class InquiryResponse(BaseModel):
    analysis: str
    challenges: list[str]
    suggested_cards: list[str]


class DiscoverResponse(BaseModel):
    suggestions: list[dict]  # [{from_id, to_id, label, reason}]


class DebateResponse(BaseModel):
    thesis: str
    antithesis: str
    key_points: list[str]
    synthesis: str


class SearchResponse(BaseModel):
    results: list[dict]  # [{id, score, reason}]


class ChatResponse(BaseModel):
    reply: str
