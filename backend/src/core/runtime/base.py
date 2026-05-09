"""Provider-neutral chat runtime interface."""
from abc import ABC, abstractmethod
from typing import AsyncIterator, Dict, Any, List
from .types import Message, StreamChunk, ToolCall, ToolResult, CanvasContext


class ChatRuntime(ABC):
    """Abstract base class for provider-neutral chat runtime.

    Providers implement this interface to integrate with the system.
    """

    @abstractmethod
    async def stream_chat(
        self,
        messages: List[Message],
        tools: List[Dict[str, Any]],
        context: CanvasContext,
        **kwargs
    ) -> AsyncIterator[StreamChunk]:
        """Stream chat responses with tool calls.

        Args:
            messages: Conversation history
            tools: Available tool schemas
            context: Canvas state context
            **kwargs: Provider-specific parameters

        Yields:
            StreamChunk: Text, tool calls, or completion events
        """
        pass

    @abstractmethod
    async def execute_tool(
        self,
        tool_call: ToolCall,
        context: CanvasContext
    ) -> ToolResult:
        """Execute a tool call.

        Args:
            tool_call: Tool call from LLM
            context: Canvas state context

        Returns:
            ToolResult: Tool execution result
        """
        pass

    @abstractmethod
    async def cleanup(self):
        """Clean up runtime resources."""
        pass
