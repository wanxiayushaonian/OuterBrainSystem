"""Integration tests for Chat API with Agent Router."""
import pytest
from datetime import datetime, timezone
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from src.core.agent_router import AgentRouter
from src.agents.distillation_agent import DistillationAgent
from src.core.runtime.types import CanvasContext, Message, StreamChunk


class MockRuntime:
    """Mock runtime for testing."""

    def __init__(self, response: str):
        self.response = response

    async def stream_chat(self, messages, tools, context):
        """Simulate LLM response."""
        yield StreamChunk(type="text", content=self.response)

    async def cleanup(self):
        """Mock cleanup."""
        pass


@pytest.mark.asyncio
async def test_agent_router_integration_with_distillation():
    """Test full integration: Router → Distillation Agent."""
    json_response = '''```json
{
  "title": "测试提炼",
  "original_text": "这是测试内容",
  "extracted_keywords": ["测试", "提炼"],
  "recommended_keywords": [],
  "reasoning": "测试理由"
}
```'''

    runtime = MockRuntime(json_response)
    router = AgentRouter()
    router.register_agent(DistillationAgent(runtime))

    context = CanvasContext(cards=[], connections=[], groups=[], active_labels=[])

    result = await router.route(
        user_input="请提炼这段内容",
        context=context,
        session_messages=[]
    )

    # Verify routing worked
    assert result["agent_type"] == "distillation"
    assert result["action"] == "create_card"
    assert result["card"]["type"] == "distillation"
    assert "extracted_keywords" in result["card"]["metadata"]


@pytest.mark.asyncio
async def test_agent_router_with_multiple_agents():
    """Test router with multiple registered agents."""
    json_response = '''```json
{
  "title": "提炼结果",
  "original_text": "原始内容",
  "extracted_keywords": ["关键词"],
  "recommended_keywords": [],
  "reasoning": "理由"
}
```'''

    runtime = MockRuntime(json_response)
    router = AgentRouter()
    router.register_agent(DistillationAgent(runtime))

    # Test distillation routing
    result = await router.route(
        user_input="请总结一下",
        context=CanvasContext(cards=[], connections=[], groups=[], active_labels=[]),
        session_messages=[]
    )

    assert result["agent_type"] == "distillation"


@pytest.mark.asyncio
async def test_distillation_with_canvas_context():
    """Test distillation agent uses canvas context for keyword recommendations."""
    json_response = '''```json
{
  "title": "新提炼",
  "original_text": "新内容",
  "extracted_keywords": ["新关键词"],
  "recommended_keywords": ["已有关键词"],
  "reasoning": "推荐已有关键词"
}
```'''

    runtime = MockRuntime(json_response)
    agent = DistillationAgent(runtime)

    # Canvas with existing keywords
    context = CanvasContext(
        cards=[
            {
                "id": 1,
                "type": "distillation",
                "metadata": {
                    "extracted_keywords": ["已有关键词"],
                    "user_selected_keywords": []
                }
            }
        ],
        connections=[],
        groups=[],
        active_labels=[]
    )

    result = await agent.process(
        user_input="请提炼",
        context=context,
        session_messages=[]
    )

    assert result["card"]["metadata"]["recommended_keywords"] == ["已有关键词"]


@pytest.mark.asyncio
async def test_agent_result_structure():
    """Test that agent result has expected structure for frontend."""
    json_response = '''```json
{
  "title": "结果",
  "original_text": "内容",
  "extracted_keywords": ["关键词"],
  "recommended_keywords": [],
  "reasoning": "理由"
}
```'''

    runtime = MockRuntime(json_response)
    agent = DistillationAgent(runtime)

    result = await agent.process(
        user_input="提炼",
        context=CanvasContext(cards=[], connections=[], groups=[], active_labels=[]),
        session_messages=[]
    )

    # Verify structure for frontend consumption
    assert "action" in result
    assert "card" in result
    assert "message" in result
    assert result["action"] == "create_card"
    assert result["card"]["type"] == "distillation"
    assert "text" in result["card"]
    assert "metadata" in result["card"]
