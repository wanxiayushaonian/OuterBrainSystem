"""Session types and models."""
from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime
from ..runtime.types import Message


@dataclass
class Session:
    """Chat session model."""
    id: str
    space_id: int
    provider_id: str
    title: str
    messages: List[Message] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)

    def to_dict(self):
        """Convert to JSON-serializable dict."""
        return {
            "id": self.id,
            "space_id": self.space_id,
            "provider_id": self.provider_id,
            "title": self.title,
            "messages": [
                {
                    "role": m.role,
                    "content": m.content,
                    "tool_calls": [
                        {"id": tc.id, "name": tc.name, "arguments": tc.arguments}
                        for tc in (m.tool_calls or [])
                    ],
                    "tool_results": [
                        {"tool_call_id": tr.tool_call_id, "content": tr.content, "is_error": tr.is_error}
                        for tr in (m.tool_results or [])
                    ]
                }
                for m in self.messages
            ],
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Session":
        """Create from dict."""
        from ..runtime.types import ToolCall, ToolResult

        messages = []
        for m in data.get("messages", []):
            tool_calls = [
                ToolCall(id=tc["id"], name=tc["name"], arguments=tc["arguments"])
                for tc in m.get("tool_calls", [])
            ] if m.get("tool_calls") else None

            tool_results = [
                ToolResult(
                    tool_call_id=tr["tool_call_id"],
                    content=tr["content"],
                    is_error=tr.get("is_error", False)
                )
                for tr in m.get("tool_results", [])
            ] if m.get("tool_results") else None

            messages.append(Message(
                role=m["role"],
                content=m.get("content"),
                tool_calls=tool_calls,
                tool_results=tool_results
            ))

        return cls(
            id=data["id"],
            space_id=data["space_id"],
            provider_id=data["provider_id"],
            title=data["title"],
            messages=messages,
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"])
        )
