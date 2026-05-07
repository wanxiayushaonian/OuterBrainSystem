"""Core runtime types for provider-neutral chat interface."""
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional
from datetime import datetime


# Card type definitions
CardType = Literal[
    "note",           # 普通笔记
    "distillation",   # 提炼卡片
    "socratic",       # 苏格拉底卡片
    "flow_analysis",  # 流程分析卡片
    "choice",         # 选择卡片
    "vote",           # 投票卡片
    "conclusion"      # 结论卡片
]


@dataclass
class Message:
    """Chat message."""
    role: Literal["user", "assistant", "system"]
    content: Optional[str] = None
    tool_calls: Optional[List["ToolCall"]] = None
    tool_results: Optional[List["ToolResult"]] = None


@dataclass
class ToolCall:
    """Tool call request from LLM."""
    id: str
    name: str
    arguments: Dict[str, Any]


@dataclass
class ToolResult:
    """Tool execution result."""
    tool_call_id: str
    content: Any
    is_error: bool = False


@dataclass
class StreamChunk:
    """Streaming response chunk."""
    type: Literal["text", "tool_call", "tool_result", "thinking", "done", "error"]
    content: Optional[str] = None
    tool_call: Optional[ToolCall] = None
    tool_result: Optional[ToolResult] = None
    error: Optional[str] = None


@dataclass
class CanvasContext:
    """Canvas state context for tool execution."""
    cards: List[Dict[str, Any]]
    connections: List[Dict[str, Any]]
    groups: List[Dict[str, Any]]
    active_labels: List[str]
    peripheral_cards: Optional[List[Dict[str, Any]]] = None
