"""Agent Router for intent classification and agent selection."""
from typing import Dict, Any, List, Optional
from src.core.agent_types import Agent, AgentIntent
from src.core.runtime import CanvasContext, Message
import logging

logger = logging.getLogger(__name__)


class AgentRouter:
    """Routes user input to appropriate agent based on intent.

    Strategy:
    1. Keyword matching (fast path) - Phase 2
    2. LLM classification (fallback) - Phase 2.5+
    3. Default to conversational agent
    """

    def __init__(self):
        self._agents: Dict[str, Agent] = {}
        self._intent_keywords = {
            "distillation": [
                # Chinese
                "提炼", "总结", "浓缩", "精炼", "归纳", "概括",
                # English
                "distill", "summarize", "condense", "extract", "digest"
            ],
            "socratic": [
                # Chinese
                "挑战", "质疑", "反思", "追问", "深入", "批判",
                # English
                "challenge", "question", "reflect", "probe", "critique"
            ],
            "flow_analysis": [
                # Chinese
                "分析", "流程", "结构", "梳理", "整理", "诊断",
                # English
                "analyze", "flow", "structure", "diagnose", "review"
            ],
            "conclusion": [
                # Chinese
                "结论", "合并", "总结", "汇总", "融合",
                # English
                "conclude", "merge", "synthesize", "consolidate"
            ],
        }

    def register_agent(self, agent: Agent) -> None:
        """Register an agent.

        Args:
            agent: Agent instance to register
        """
        self._agents[agent.name] = agent
        logger.info(f"Registered agent: {agent.name}")

    def get_agent(self, name: str) -> Optional[Agent]:
        """Get agent by name.

        Args:
            name: Agent name

        Returns:
            Agent instance or None if not found
        """
        return self._agents.get(name)

    def list_agents(self) -> List[str]:
        """List all registered agent names.

        Returns:
            List of agent names
        """
        return list(self._agents.keys())

    def _keyword_match(self, user_input: str) -> Optional[str]:
        """Simple keyword-based intent detection.

        Args:
            user_input: User's input text

        Returns:
            Matched agent type or None
        """
        user_input_lower = user_input.lower()
        for agent_type, keywords in self._intent_keywords.items():
            if any(kw in user_input_lower for kw in keywords):
                logger.debug(f"Keyword match: {agent_type}")
                return agent_type
        return None

    async def classify_intent(
        self,
        user_input: str,
        context: CanvasContext,
        session_messages: List[Message]
    ) -> AgentIntent:
        """Classify user intent to determine which agent to use.

        Strategy:
        1. Keyword matching (fast path)
        2. LLM classification (fallback, Phase 2.5+)
        3. Default to conversational agent

        Args:
            user_input: User's input text
            context: Current canvas context
            session_messages: Conversation history

        Returns:
            AgentIntent with agent_type, confidence, and reasoning
        """
        # Phase 2: Simple keyword matching
        matched_type = self._keyword_match(user_input)

        if matched_type and matched_type in self._agents:
            return AgentIntent(
                agent_type=matched_type,
                confidence=0.8,
                reasoning=f"Keyword match: {matched_type}"
            )

        # Default to conversational
        return AgentIntent(
            agent_type="conversational",
            confidence=1.0,
            reasoning="Default conversational agent"
        )

    async def route(
        self,
        user_input: str,
        context: CanvasContext,
        session_messages: List[Message]
    ) -> Dict[str, Any]:
        """Route user input to appropriate agent and execute.

        Args:
            user_input: User's input text
            context: Current canvas context
            session_messages: Conversation history

        Returns:
            Agent execution result dict

        Raises:
            ValueError: If no agent is available
        """
        intent = await self.classify_intent(user_input, context, session_messages)

        agent = self._agents.get(intent.agent_type)
        if not agent:
            # Fallback to conversational
            agent = self._agents.get("conversational")

        if not agent:
            raise ValueError("No agent available for routing")

        logger.info(
            f"Routing to {intent.agent_type} agent (confidence: {intent.confidence:.2f})"
        )

        result = await agent.process(user_input, context, session_messages)
        result["agent_type"] = intent.agent_type
        result["intent_confidence"] = intent.confidence

        return result
