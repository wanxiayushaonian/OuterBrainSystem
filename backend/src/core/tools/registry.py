"""Tool registry for managing available tools."""
from typing import Dict, List, Any, Optional
from .base import Tool


class ToolRegistry:
    """Registry for executable tools.

    Tools register themselves and can be discovered by the runtime.
    """

    _tools: Dict[str, Tool] = {}

    @classmethod
    def register(cls, tool: Tool):
        """Register a tool instance.

        Args:
            tool: Tool instance to register
        """
        cls._tools[tool.name] = tool

    @classmethod
    def get_tool(cls, name: str) -> Optional[Tool]:
        """Get a tool by name.

        Args:
            name: Tool name

        Returns:
            Tool instance or None if not found
        """
        return cls._tools.get(name)

    @classmethod
    def list_tools(cls) -> List[str]:
        """List all registered tool names."""
        return list(cls._tools.keys())

    @classmethod
    def get_schemas(cls) -> List[Dict[str, Any]]:
        """Get LLM-compatible schemas for all tools.

        Returns:
            List of tool schemas
        """
        return [tool.to_schema() for tool in cls._tools.values()]

    @classmethod
    def clear(cls):
        """Clear all registered tools (for testing)."""
        cls._tools.clear()
