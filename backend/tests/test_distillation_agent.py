"""Tests for Distillation Agent."""
import pytest
from datetime import datetime, timezone
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from src.agents.distillation_agent import DistillationAgent
from src.core.runtime.types import CanvasContext, Message, StreamChunk


class MockRuntime:
    """Mock runtime for testing."""

    def __init__(self, response: str):
        self.response = response

    async def stream_chat(self, messages, tools, context):
        """Simulate LLM response."""
        yield StreamChunk(type="text", content=self.response)


@pytest.mark.asyncio
async def test_distillation_agent_basic():
    """Test basic distillation agent functionality."""
    json_response = '''```json
{
  "title": "AI 提升开发效率",
  "original_text": "讨论了 AI 如何通过自动化工具提升开发效率",
  "extracted_keywords": ["AI", "开发效率", "自动化"],
  "recommended_keywords": [],
  "reasoning": "核心观点是 AI 工具的应用价值"
}
```'''

    runtime = MockRuntime(json_response)
    agent = DistillationAgent(runtime)

    result = await agent.process(
        user_input="我们讨论了 AI 如何提升开发效率",
        context=CanvasContext(cards=[], connections=[], groups=[], active_labels=[]),
        session_messages=[]
    )

    assert result["action"] == "create_card"
    assert result["card"]["type"] == "distillation"
    assert result["card"]["text"] == "AI 提升开发效率"
    assert "extracted_keywords" in result["card"]["metadata"]
    assert len(result["card"]["metadata"]["extracted_keywords"]) == 3
    assert "AI" in result["card"]["metadata"]["extracted_keywords"]


@pytest.mark.asyncio
async def test_distillation_agent_with_existing_keywords():
    """Test distillation with existing keywords in canvas."""
    json_response = '''```json
{
  "title": "机器学习模型优化",
  "original_text": "讨论了如何优化机器学习模型的性能",
  "extracted_keywords": ["机器学习", "模型优化", "性能"],
  "recommended_keywords": ["AI", "自动化"],
  "reasoning": "与已有的 AI 和自动化关键词相关"
}
```'''

    runtime = MockRuntime(json_response)
    agent = DistillationAgent(runtime)

    # Canvas with existing keywords
    context = CanvasContext(
        cards=[
            {
                "id": 1,
                "text": "Previous card",
                "type": "distillation",
                "metadata": {
                    "extracted_keywords": ["AI", "自动化"],
                    "user_selected_keywords": ["AI"]
                }
            }
        ],
        connections=[],
        groups=[],
        active_labels=[]
    )

    result = await agent.process(
        user_input="如何优化机器学习模型",
        context=context,
        session_messages=[]
    )

    assert result["action"] == "create_card"
    assert "recommended_keywords" in result["card"]["metadata"]
    assert len(result["card"]["metadata"]["recommended_keywords"]) == 2


@pytest.mark.asyncio
async def test_distillation_agent_parse_fallback():
    """Test fallback when LLM response is not valid JSON."""
    invalid_response = "This is not a valid JSON response"

    runtime = MockRuntime(invalid_response)
    agent = DistillationAgent(runtime)

    result = await agent.process(
        user_input="Test input for fallback",
        context=CanvasContext(cards=[], connections=[], groups=[], active_labels=[]),
        session_messages=[]
    )

    # Should still create a card with fallback data
    assert result["action"] == "create_card"
    assert result["card"]["type"] == "distillation"
    assert result["card"]["text"] == "Test input for fallback"
    assert result["card"]["metadata"]["extracted_keywords"] == []


@pytest.mark.asyncio
async def test_distillation_agent_with_conversation_history():
    """Test distillation with conversation history."""
    json_response = '''```json
{
  "title": "对话总结",
  "original_text": "讨论了多个话题",
  "extracted_keywords": ["话题1", "话题2"],
  "recommended_keywords": [],
  "reasoning": "综合对话历史提炼"
}
```'''

    runtime = MockRuntime(json_response)
    agent = DistillationAgent(runtime)

    session_messages = [
        Message(role="user", content="我们来讨论话题1"),
        Message(role="assistant", content="好的，关于话题1..."),
        Message(role="user", content="还有话题2"),
        Message(role="assistant", content="话题2的要点是..."),
    ]

    result = await agent.process(
        user_input="请提炼我们的对话",
        context=CanvasContext(cards=[], connections=[], groups=[], active_labels=[]),
        session_messages=session_messages
    )

    assert result["action"] == "create_card"
    assert result["card"]["type"] == "distillation"


@pytest.mark.asyncio
async def test_extract_keywords_from_canvas():
    """Test extracting keywords from existing canvas cards."""
    runtime = MockRuntime("")
    agent = DistillationAgent(runtime)

    context = CanvasContext(
        cards=[
            {
                "id": 1,
                "type": "distillation",
                "metadata": {
                    "extracted_keywords": ["keyword1", "keyword2"],
                    "user_selected_keywords": ["keyword1"]
                }
            },
            {
                "id": 2,
                "type": "distillation",
                "metadata": {
                    "extracted_keywords": ["keyword3", "keyword1"],
                    "user_selected_keywords": []
                }
            },
            {
                "id": 3,
                "type": "note",
                "metadata": {}
            }
        ],
        connections=[],
        groups=[],
        active_labels=[]
    )

    keywords = agent._extract_keywords_from_canvas(context)

    # Should have unique keywords
    assert "keyword1" in keywords
    assert "keyword2" in keywords
    assert "keyword3" in keywords
    assert len(keywords) == 3


@pytest.mark.asyncio
async def test_distillation_agent_name_and_description():
    """Test agent name and description properties."""
    runtime = MockRuntime("")
    agent = DistillationAgent(runtime)

    assert agent.name == "distillation"
    assert "distill" in agent.description.lower() or "提炼" in agent.description
