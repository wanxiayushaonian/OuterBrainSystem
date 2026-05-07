"""L2 (composite) tools for agent-specific operations."""
from src.core.tools import Tool
from typing import Dict, Any
import json
import logging

logger = logging.getLogger(__name__)


class DistillTextTool(Tool):
    """L2 tool for distilling text content.

    This tool wraps the Distillation Agent functionality,
    allowing LLM to directly call distillation without routing.
    """

    def __init__(self, distillation_agent=None):
        """Initialize distill text tool.

        Args:
            distillation_agent: Optional DistillationAgent instance
        """
        self._agent = distillation_agent

    @property
    def name(self) -> str:
        return "distill_text"

    @property
    def description(self) -> str:
        return """Distill long text into concise summary with keywords.

Use this tool to:
- Extract core insights from conversation or text
- Identify 3-5 key keywords
- Get recommendations for related existing keywords
- Create a distillation card

The tool returns a structured result with title, keywords, and reasoning."""

    @property
    def schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "Text content to distill (conversation, notes, etc.)"
                },
                "max_keywords": {
                    "type": "integer",
                    "description": "Maximum number of keywords to extract (default: 5)",
                    "default": 5
                },
                "context_cards": {
                    "type": "array",
                    "description": "Optional: existing canvas cards for keyword recommendations",
                    "items": {"type": "object"},
                    "default": []
                }
            },
            "required": ["text"]
        }

    async def execute(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> str:
        """Execute distillation.

        Args:
            arguments: Tool arguments (text, max_keywords, context_cards)
            context: Execution context with canvas state

        Returns:
            JSON string with distillation result
        """
        text = arguments["text"]
        max_keywords = arguments.get("max_keywords", 5)

        logger.info(f"Distilling text: {text[:50]}...")

        # If agent is available, use it
        if self._agent:
            from src.core.runtime.types import CanvasContext, Message

            # Build canvas context from provided context
            canvas_context = CanvasContext(
                cards=context.get("cards", []),
                connections=context.get("connections", []),
                groups=context.get("groups", []),
                active_labels=context.get("active_labels", [])
            )

            # Call agent
            result = await self._agent.process(
                user_input=text,
                context=canvas_context,
                session_messages=[]
            )

            # Extract distillation data
            card = result["card"]
            metadata = card["metadata"]

            return json.dumps({
                "success": True,
                "title": card["text"],
                "keywords": metadata["extracted_keywords"][:max_keywords],
                "recommended_keywords": metadata.get("recommended_keywords", []),
                "reasoning": metadata.get("reasoning", ""),
                "card": card
            }, ensure_ascii=False)

        # Fallback: simple keyword extraction (if agent not available)
        logger.warning("Distillation agent not available, using fallback")
        words = text.split()
        keywords = list(set(words[:max_keywords]))

        return json.dumps({
            "success": True,
            "title": text[:50] + ("..." if len(text) > 50 else ""),
            "keywords": keywords,
            "recommended_keywords": [],
            "reasoning": "Fallback: simple word extraction",
            "card": {
                "type": "distillation",
                "text": text[:50],
                "metadata": {
                    "original_text": text,
                    "extracted_keywords": keywords,
                    "recommended_keywords": [],
                    "user_selected_keywords": [],
                    "reasoning": "Fallback extraction"
                }
            }
        }, ensure_ascii=False)
