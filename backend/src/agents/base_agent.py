"""Base agent with common functionality."""
from src.core.agent_types import Agent
from src.core.runtime import CanvasContext, Message
from typing import Dict, Any, List, AsyncIterator
import logging

logger = logging.getLogger(__name__)


class BaseAgent(Agent):
    """Base agent with common functionality for all agents."""

    def __init__(self, runtime):
        """Initialize base agent.

        Args:
            runtime: ChatRuntime instance for LLM calls
        """
        self.runtime = runtime

    async def _call_llm(
        self,
        system_prompt: str,
        user_input: str,
        context: CanvasContext
    ) -> str:
        """Call LLM with system prompt and return full response.

        Args:
            system_prompt: System prompt for the LLM
            user_input: User's input text
            context: Canvas context

        Returns:
            Complete LLM response text
        """
        messages = [
            Message(role="user", content=user_input)
        ]

        response = ""
        async for chunk in self.runtime.stream_chat(
            messages=messages,
            tools=[],
            context=context
        ):
            if chunk.type == "text":
                response += chunk.content or ""

        return response

    async def _stream_llm(
        self,
        system_prompt: str,
        user_input: str,
        context: CanvasContext
    ) -> AsyncIterator[str]:
        """Stream LLM response chunk by chunk.

        Args:
            system_prompt: System prompt for the LLM
            user_input: User's input text
            context: Canvas context

        Yields:
            Text chunks from LLM
        """
        messages = [
            Message(role="user", content=user_input)
        ]

        async for chunk in self.runtime.stream_chat(
            messages=messages,
            tools=[],
            context=context
        ):
            if chunk.type == "text" and chunk.content:
                yield chunk.content
