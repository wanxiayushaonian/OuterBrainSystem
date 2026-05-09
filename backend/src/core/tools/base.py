"""Abstract base class for tools."""
from abc import ABC, abstractmethod
from typing import Dict, Any


class Tool(ABC):
    """Abstract base class for executable tools.

    Tools are functions that the LLM can call to interact with the system.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Tool name (used in LLM tool calls)."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Human-readable tool description."""
        pass

    @property
    @abstractmethod
    def schema(self) -> Dict[str, Any]:
        """JSON schema for tool parameters.

        Returns:
            Dict with "type", "properties", "required" keys
        """
        pass

    @abstractmethod
    async def execute(
        self,
        arguments: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Any:
        """Execute the tool.

        Args:
            arguments: Tool arguments from LLM
            context: Execution context (canvas state, etc.)

        Returns:
            Tool execution result (will be serialized to JSON)

        Raises:
            Exception: If tool execution fails
        """
        pass

    def to_schema(self) -> Dict[str, Any]:
        """Convert tool to LLM-compatible schema.

        Returns:
            Dict with "name", "description", "input_schema"
        """
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.schema
        }
