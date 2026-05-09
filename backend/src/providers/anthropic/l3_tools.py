"""L3 (agent-level) composite tools for multi-step canvas operations."""
from src.core.tools import Tool
from typing import Dict, Any, List, Optional
import json
import logging

logger = logging.getLogger(__name__)


class ChallengeThinkingTool(Tool):
    """L3 tool for Socratic questioning on canvas cards.

    Wraps the SocraticAgent to challenge assumptions and generate
    probing questions about selected cards or the overall canvas.
    """

    def __init__(self, socratic_agent=None):
        self._agent = socratic_agent

    @property
    def name(self) -> str:
        return "challenge_thinking"

    @property
    def description(self) -> str:
        return """Challenge thinking with Socratic questions.

Use this tool to:
- Probe assumptions in selected cards
- Find logical gaps in reasoning
- Generate perspective-shifting questions
- Deepen critical analysis

The tool creates a socratic card with structured questions and identified gaps."""

    @property
    def schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "focus": {
                    "type": "string",
                    "description": "What to challenge (specific topic, card content, or general)"
                },
                "card_ids": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Optional: specific card IDs to focus on",
                    "default": []
                }
            },
            "required": ["focus"]
        }

    async def execute(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> str:
        focus = arguments["focus"]
        card_ids = arguments.get("card_ids", [])

        logger.info(f"Challenging thinking: {focus[:50]}...")

        if not self._agent:
            return json.dumps({
                "success": False,
                "error": "Socratic agent not available"
            })

        from src.core.runtime.types import CanvasContext, Message
        canvas_context = CanvasContext(
            cards=context.get("cards", []),
            connections=context.get("connections", []),
            groups=context.get("groups", []),
            active_labels=context.get("active_labels", [])
        )

        result = await self._agent.process(
            user_input=focus,
            context=canvas_context,
            session_messages=[]
        )

        return json.dumps({
            "success": True,
            "card": result.get("card"),
            "message": result.get("message", ""),
            "questions": result.get("card", {}).get("metadata", {}).get("questions", [])
        }, ensure_ascii=False)


class AnalyzeFlowTool(Tool):
    """L3 tool for analyzing canvas thought structure.

    Wraps the FlowAnalyzerAgent to diagnose the structure of
    cards and connections on the canvas.
    """

    def __init__(self, flow_agent=None):
        self._agent = flow_agent

    @property
    def name(self) -> str:
        return "analyze_flow"

    @property
    def description(self) -> str:
        return """Analyze the thought process structure on the canvas.

Use this tool to:
- Map connections and identify patterns (chain, tree, network)
- Find orphan cards and bottlenecks
- Score completeness of the thought structure
- Get improvement suggestions

The tool creates a flow_analysis card with diagnostic results."""

    @property
    def schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "focus": {
                    "type": "string",
                    "description": "What aspect to analyze (structure, gaps, completeness, or general)",
                    "default": "general"
                }
            },
            "required": []
        }

    async def execute(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> str:
        focus = arguments.get("focus", "general")

        logger.info(f"Analyzing flow: {focus}")

        if not self._agent:
            return json.dumps({
                "success": False,
                "error": "Flow analyzer agent not available"
            })

        from src.core.runtime.types import CanvasContext, Message
        canvas_context = CanvasContext(
            cards=context.get("cards", []),
            connections=context.get("connections", []),
            groups=context.get("groups", []),
            active_labels=context.get("active_labels", [])
        )

        result = await self._agent.process(
            user_input=focus,
            context=canvas_context,
            session_messages=[]
        )

        return json.dumps({
            "success": True,
            "card": result.get("card"),
            "message": result.get("message", ""),
            "analysis": result.get("card", {}).get("metadata", {})
        }, ensure_ascii=False)


class SynthesizeCardsTool(Tool):
    """L3 tool for synthesizing multiple cards into a conclusion.

    Wraps the ConclusionAgent to merge selected cards into
    a structured conclusion card with key takeaways.
    """

    def __init__(self, conclusion_agent=None):
        self._agent = conclusion_agent

    @property
    def name(self) -> str:
        return "synthesize_cards"

    @property
    def description(self) -> str:
        return """Synthesize multiple cards into a conclusion.

Use this tool to:
- Merge related cards into a summary conclusion
- Extract key takeaways from card groups
- Identify consensus and disagreements
- Create a conclusion card with chain references

The tool creates a conclusion card linking back to source cards."""

    @property
    def schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "card_ids": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Card IDs to synthesize (empty = auto-detect pending/verified cards)"
                },
                "focus": {
                    "type": "string",
                    "description": "What aspect to focus the conclusion on",
                    "default": "general"
                }
            },
            "required": []
        }

    async def execute(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> str:
        card_ids = arguments.get("card_ids", [])
        focus = arguments.get("focus", "general")

        logger.info(f"Synthesizing cards: {card_ids or 'auto-detect'}")

        if not self._agent:
            return json.dumps({
                "success": False,
                "error": "Conclusion agent not available"
            })

        from src.core.runtime.types import CanvasContext, Message
        canvas_context = CanvasContext(
            cards=context.get("cards", []),
            connections=context.get("connections", []),
            groups=context.get("groups", []),
            active_labels=context.get("active_labels", [])
        )

        result = await self._agent.process(
            user_input=focus,
            context=canvas_context,
            session_messages=[],
            card_ids=card_ids if card_ids else None
        )

        return json.dumps({
            "success": True,
            "card": result.get("card"),
            "message": result.get("message", ""),
            "chain_ids": result.get("metadata", {}).get("chain_ids", [])
        }, ensure_ascii=False)
