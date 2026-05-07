"""Tests for Agent Router."""
import pytest
from datetime import datetime, timezone
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from src.core.agent_router import AgentRouter
from src.core.agent_types import Agent, AgentIntent
from src.core.runtime.types import CanvasContext, Message


class MockAgent(Agent):
    """Mock agent for testing."""

    def __init__(self, name: str):
        self._name = name

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return f"Mock {self._name} agent"

    async def process(self, user_input, context, session_messages):
        return {
            "action": "message",
            "agent": self._name,
            "message": f"Processed by {self._name}",
            "processed": True
        }


@pytest.mark.asyncio
async def test_register_agent():
    """Test agent registration."""
    router = AgentRouter()
    agent = MockAgent("test_agent")

    router.register_agent(agent)

    assert "test_agent" in router.list_agents()
    assert router.get_agent("test_agent") == agent


@pytest.mark.asyncio
async def test_keyword_routing_distillation_chinese():
    """Test keyword routing for distillation (Chinese)."""
    router = AgentRouter()
    router.register_agent(MockAgent("distillation"))
    router.register_agent(MockAgent("conversational"))

    intent = await router.classify_intent(
        "请帮我提炼一下这段对话",
        context=CanvasContext(cards=[], connections=[], groups=[], active_labels=[]),
        session_messages=[]
    )

    assert intent.agent_type == "distillation"
    assert intent.confidence > 0.5


@pytest.mark.asyncio
async def test_keyword_routing_distillation_english():
    """Test keyword routing for distillation (English)."""
    router = AgentRouter()
    router.register_agent(MockAgent("distillation"))
    router.register_agent(MockAgent("conversational"))

    intent = await router.classify_intent(
        "Can you summarize this conversation?",
        context=CanvasContext(cards=[], connections=[], groups=[], active_labels=[]),
        session_messages=[]
    )

    assert intent.agent_type == "distillation"
    assert intent.confidence > 0.5


@pytest.mark.asyncio
async def test_keyword_routing_socratic():
    """Test keyword routing for socratic agent."""
    router = AgentRouter()
    router.register_agent(MockAgent("socratic"))
    router.register_agent(MockAgent("conversational"))

    intent = await router.classify_intent(
        "请挑战我的观点",
        context=CanvasContext(cards=[], connections=[], groups=[], active_labels=[]),
        session_messages=[]
    )

    assert intent.agent_type == "socratic"


@pytest.mark.asyncio
async def test_keyword_routing_flow_analysis():
    """Test keyword routing for flow analysis agent."""
    router = AgentRouter()
    router.register_agent(MockAgent("flow_analysis"))
    router.register_agent(MockAgent("conversational"))

    intent = await router.classify_intent(
        "帮我分析一下思维流程",
        context=CanvasContext(cards=[], connections=[], groups=[], active_labels=[]),
        session_messages=[]
    )

    assert intent.agent_type == "flow_analysis"


@pytest.mark.asyncio
async def test_default_routing():
    """Test default routing to conversational agent."""
    router = AgentRouter()
    router.register_agent(MockAgent("conversational"))

    intent = await router.classify_intent(
        "今天天气怎么样",
        context=CanvasContext(cards=[], connections=[], groups=[], active_labels=[]),
        session_messages=[]
    )

    assert intent.agent_type == "conversational"
    assert intent.confidence == 1.0


@pytest.mark.asyncio
async def test_route_execution():
    """Test full routing and execution."""
    router = AgentRouter()
    router.register_agent(MockAgent("distillation"))
    router.register_agent(MockAgent("conversational"))

    result = await router.route(
        "请提炼这段内容",
        context=CanvasContext(cards=[], connections=[], groups=[], active_labels=[]),
        session_messages=[]
    )

    assert result["agent"] == "distillation"
    assert result["processed"] is True
    assert result["agent_type"] == "distillation"
    assert "intent_confidence" in result


@pytest.mark.asyncio
async def test_route_fallback_to_conversational():
    """Test fallback to conversational when target agent not registered."""
    router = AgentRouter()
    router.register_agent(MockAgent("conversational"))
    # Don't register distillation agent

    result = await router.route(
        "请提炼这段内容",
        context=CanvasContext(cards=[], connections=[], groups=[], active_labels=[]),
        session_messages=[]
    )

    # Should fallback to conversational
    assert result["agent"] == "conversational"


@pytest.mark.asyncio
async def test_route_no_agent_raises_error():
    """Test that routing raises error when no agent available."""
    router = AgentRouter()
    # Don't register any agent

    with pytest.raises(ValueError, match="No agent available"):
        await router.route(
            "test input",
            context=CanvasContext(cards=[], connections=[], groups=[], active_labels=[]),
            session_messages=[]
        )


@pytest.mark.asyncio
async def test_multiple_keyword_match():
    """Test that first matching keyword wins."""
    router = AgentRouter()
    router.register_agent(MockAgent("distillation"))
    router.register_agent(MockAgent("socratic"))

    # Input contains both "提炼" and "挑战"
    intent = await router.classify_intent(
        "请提炼并挑战我的观点",
        context=CanvasContext(cards=[], connections=[], groups=[], active_labels=[]),
        session_messages=[]
    )

    # Should match distillation (first in keyword dict)
    assert intent.agent_type == "distillation"
