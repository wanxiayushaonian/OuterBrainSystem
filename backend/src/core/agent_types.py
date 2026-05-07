"""Agent types and interfaces for multi-agent system."""
from abc import ABC, abstractmethod
from typing import Dict, Any, List
from dataclasses import dataclass


@dataclass
class AgentIntent:
    """Agent intent classification result."""
    agent_type: str  # "conversational", "distillation", "socratic", etc.
    confidence: float  # 0.0 - 1.0
    reasoning: str


class Agent(ABC):
    """Base Agent interface.

    All agents must implement this interface to be registered
    with the AgentRouter.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Agent name (used for routing)."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Agent description for routing and documentation."""
        pass

    @abstractmethod
    async def process(
        self,
        user_input: str,
        context: "CanvasContext",
        session_messages: List["Message"]
    ) -> Dict[str, Any]:
        """Process user input and return result.

        Args:
            user_input: User's input text
            context: Current canvas context
            session_messages: Conversation history

        Returns:
            Dict with keys:
                - action: str (e.g., "create_card", "update_card", "message")
                - card: Dict (if action is "create_card" or "update_card")
                - message: str (response message to user)
                - metadata: Dict (optional additional data)
        """
        pass
