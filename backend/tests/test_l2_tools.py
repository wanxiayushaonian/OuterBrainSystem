"""Tests for L2 tools."""
import pytest
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from src.providers.anthropic.l2_tools import DistillTextTool
from src.agents.distillation_agent import DistillationAgent
from src.core.runtime.types import StreamChunk


class MockRuntime:
    """Mock runtime for testing."""

    def __init__(self, response: str):
        self.response = response

    async def stream_chat(self, messages, tools, context):
        """Simulate LLM response."""
        yield StreamChunk(type="text", content=self.response)


@pytest.mark.asyncio
async def test_distill_text_tool_with_agent():
    """Test distill_text tool with agent."""
    json_response = '''```json
{
  "title": "测试标题",
  "original_text": "测试内容",
  "extracted_keywords": ["关键词1", "关键词2", "关键词3"],
  "recommended_keywords": [],
  "reasoning": "测试理由"
}
```'''

    runtime = MockRuntime(json_response)
    agent = DistillationAgent(runtime)
    tool = DistillTextTool(distillation_agent=agent)

    result = await tool.execute(
        arguments={"text": "这是要提炼的文本内容"},
        context={"cards": [], "connections": [], "groups": [], "active_labels": []}
    )

    result_data = json.loads(result)
    assert result_data["success"] is True
    assert "title" in result_data
    assert "keywords" in result_data
    assert len(result_data["keywords"]) > 0


@pytest.mark.asyncio
async def test_distill_text_tool_max_keywords():
    """Test max_keywords parameter."""
    json_response = '''```json
{
  "title": "标题",
  "original_text": "内容",
  "extracted_keywords": ["k1", "k2", "k3", "k4", "k5", "k6"],
  "recommended_keywords": [],
  "reasoning": "理由"
}
```'''

    runtime = MockRuntime(json_response)
    agent = DistillationAgent(runtime)
    tool = DistillTextTool(distillation_agent=agent)

    result = await tool.execute(
        arguments={"text": "文本", "max_keywords": 3},
        context={"cards": [], "connections": [], "groups": [], "active_labels": []}
    )

    result_data = json.loads(result)
    assert len(result_data["keywords"]) <= 3


@pytest.mark.asyncio
async def test_distill_text_tool_with_context_cards():
    """Test tool with existing canvas cards."""
    json_response = '''```json
{
  "title": "新标题",
  "original_text": "新内容",
  "extracted_keywords": ["新关键词"],
  "recommended_keywords": ["已有关键词"],
  "reasoning": "推荐已有关键词"
}
```'''

    runtime = MockRuntime(json_response)
    agent = DistillationAgent(runtime)
    tool = DistillTextTool(distillation_agent=agent)

    context = {
        "cards": [
            {
                "id": 1,
                "type": "distillation",
                "metadata": {
                    "extracted_keywords": ["已有关键词"],
                    "user_selected_keywords": []
                }
            }
        ],
        "connections": [],
        "groups": [],
        "active_labels": []
    }

    result = await tool.execute(
        arguments={"text": "文本"},
        context=context
    )

    result_data = json.loads(result)
    assert "recommended_keywords" in result_data
    assert "已有关键词" in result_data["recommended_keywords"]


@pytest.mark.asyncio
async def test_distill_text_tool_fallback():
    """Test fallback when agent not available."""
    tool = DistillTextTool(distillation_agent=None)

    result = await tool.execute(
        arguments={"text": "这是测试文本"},
        context={"cards": [], "connections": [], "groups": [], "active_labels": []}
    )

    result_data = json.loads(result)
    assert result_data["success"] is True
    assert "title" in result_data
    assert "keywords" in result_data
    assert "Fallback" in result_data["reasoning"]


@pytest.mark.asyncio
async def test_distill_text_tool_schema():
    """Test tool schema."""
    tool = DistillTextTool()

    assert tool.name == "distill_text"
    assert "distill" in tool.description.lower()

    schema = tool.schema
    assert schema["type"] == "object"
    assert "text" in schema["properties"]
    assert "max_keywords" in schema["properties"]
    assert "text" in schema["required"]


@pytest.mark.asyncio
async def test_distill_text_tool_returns_card():
    """Test that tool returns card structure."""
    json_response = '''```json
{
  "title": "卡片标题",
  "original_text": "原始内容",
  "extracted_keywords": ["关键词"],
  "recommended_keywords": [],
  "reasoning": "理由"
}
```'''

    runtime = MockRuntime(json_response)
    agent = DistillationAgent(runtime)
    tool = DistillTextTool(distillation_agent=agent)

    result = await tool.execute(
        arguments={"text": "文本"},
        context={"cards": [], "connections": [], "groups": [], "active_labels": []}
    )

    result_data = json.loads(result)
    assert "card" in result_data
    assert result_data["card"]["type"] == "distillation"
    assert "metadata" in result_data["card"]
