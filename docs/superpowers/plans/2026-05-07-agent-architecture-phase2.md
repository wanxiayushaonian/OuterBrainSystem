# Phase 2 Implementation Plan: Agent Router + Distillation Agent

**Duration**: Week 3-4 (2 weeks)  
**Goal**: 实现核心提炼功能和 Agent 路由系统

---

## Overview

Phase 2 在 Phase 1 混合加载的基础上，引入 Agent 系统：
- **Agent Router**: 根据用户意图选择合适的 Agent
- **Distillation Agent**: 提炼对话内容，生成带关键词的精华卡片
- **L2 工具**: Agent 专用复合工具
- **卡片类型系统**: 支持结构化 metadata

---

## Task Breakdown

### Task 1: 扩展卡片数据模型 (1 day)

**目标**: 为卡片添加 `type` 和 `metadata` 字段

**Files**:
- Modify: `backend/src/core/runtime/types.py`
- Test: `backend/tests/test_card_types.py` (new)

**Steps**:

1. **定义卡片类型枚举**

```python
# backend/src/core/runtime/types.py
from typing import Literal

CardType = Literal[
    "note",           # 普通笔记
    "distillation",   # 提炼卡片
    "socratic",       # 苏格拉底卡片
    "flow_analysis",  # 流程分析卡片
    "choice",         # 选择卡片
    "vote",           # 投票卡片
    "conclusion"      # 结论卡片
]
```

2. **更新 CanvasContext 中的 cards 结构**

卡片现在包含:
```python
{
    "id": int,
    "text": str,
    "type": CardType,  # 新增
    "status": str,
    "x": float,
    "y": float,
    "metadata": Dict[str, Any],  # 新增
    "updated_at": str
}
```

3. **编写测试**

```python
# backend/tests/test_card_types.py
def test_note_card():
    card = {
        "id": 1,
        "text": "Test note",
        "type": "note",
        "status": "pending",
        "metadata": {}
    }
    assert card["type"] == "note"
    assert isinstance(card["metadata"], dict)

def test_distillation_card():
    card = {
        "id": 2,
        "text": "Distilled content",
        "type": "distillation",
        "status": "pending",
        "metadata": {
            "original_text": "Long original text...",
            "extracted_keywords": ["keyword1", "keyword2"],
            "recommended_keywords": ["existing_keyword"],
            "user_selected_keywords": []
        }
    }
    assert card["type"] == "distillation"
    assert "extracted_keywords" in card["metadata"]
```

4. **向后兼容处理**

在 `context_manager.py` 中，为旧卡片自动添加默认值:

```python
def _normalize_card(self, card: Dict) -> Dict:
    """Normalize card to include type and metadata."""
    if "type" not in card:
        card["type"] = "note"
    if "metadata" not in card:
        card["metadata"] = {}
    return card
```

---

### Task 2: 实现 Agent Router (2 days)

**目标**: 根据用户输入选择合适的 Agent

**Files**:
- Create: `backend/src/core/agent_router.py`
- Create: `backend/src/core/agent_types.py`
- Test: `backend/tests/test_agent_router.py`

**Steps**:

1. **定义 Agent 接口**

```python
# backend/src/core/agent_types.py
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
    """Base Agent interface."""
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Agent name."""
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """Agent description for routing."""
        pass
    
    @abstractmethod
    async def process(
        self,
        user_input: str,
        context: "CanvasContext",
        session_messages: List["Message"]
    ) -> Dict[str, Any]:
        """Process user input and return result."""
        pass
```

2. **实现 Agent Router**

```python
# backend/src/core/agent_router.py
from typing import Dict, Any, List, Optional
from src.core.agent_types import Agent, AgentIntent
from src.core.runtime import CanvasContext, Message

class AgentRouter:
    """Routes user input to appropriate agent."""
    
    def __init__(self):
        self._agents: Dict[str, Agent] = {}
        self._intent_keywords = {
            "distillation": ["提炼", "总结", "浓缩", "distill", "summarize"],
            "socratic": ["挑战", "质疑", "反思", "challenge", "question"],
            "flow_analysis": ["分析", "流程", "结构", "analyze", "flow"],
            "conclusion": ["结论", "合并", "conclude", "merge"],
        }
    
    def register_agent(self, agent: Agent) -> None:
        """Register an agent."""
        self._agents[agent.name] = agent
    
    def _keyword_match(self, user_input: str) -> Optional[str]:
        """Simple keyword-based intent detection."""
        user_input_lower = user_input.lower()
        for agent_type, keywords in self._intent_keywords.items():
            if any(kw in user_input_lower for kw in keywords):
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
        """Route user input to appropriate agent and execute."""
        intent = await self.classify_intent(user_input, context, session_messages)
        
        agent = self._agents.get(intent.agent_type)
        if not agent:
            # Fallback to conversational
            agent = self._agents.get("conversational")
        
        if not agent:
            raise ValueError("No agent available")
        
        result = await agent.process(user_input, context, session_messages)
        result["agent_type"] = intent.agent_type
        result["intent_confidence"] = intent.confidence
        
        return result
```

3. **编写测试**

```python
# backend/tests/test_agent_router.py
import pytest
from src.core.agent_router import AgentRouter
from src.core.agent_types import Agent, AgentIntent

class MockAgent(Agent):
    def __init__(self, name: str):
        self._name = name
    
    @property
    def name(self) -> str:
        return self._name
    
    @property
    def description(self) -> str:
        return f"Mock {self._name} agent"
    
    async def process(self, user_input, context, session_messages):
        return {"agent": self._name, "processed": True}

@pytest.mark.asyncio
async def test_keyword_routing():
    router = AgentRouter()
    router.register_agent(MockAgent("distillation"))
    router.register_agent(MockAgent("conversational"))
    
    intent = await router.classify_intent(
        "请帮我提炼一下这段对话",
        context=None,
        session_messages=[]
    )
    
    assert intent.agent_type == "distillation"
    assert intent.confidence > 0.5

@pytest.mark.asyncio
async def test_default_routing():
    router = AgentRouter()
    router.register_agent(MockAgent("conversational"))
    
    intent = await router.classify_intent(
        "今天天气怎么样",
        context=None,
        session_messages=[]
    )
    
    assert intent.agent_type == "conversational"
```

---

### Task 3: 实现 Distillation Agent (3 days)

**目标**: 提炼对话内容，生成带关键词的精华卡片

**Files**:
- Create: `backend/src/agents/distillation_agent.py`
- Create: `backend/src/agents/base_agent.py`
- Test: `backend/tests/test_distillation_agent.py`

**Steps**:

1. **创建 Base Agent**

```python
# backend/src/agents/base_agent.py
from src.core.agent_types import Agent
from src.core.runtime import CanvasContext, Message
from typing import Dict, Any, List

class BaseAgent(Agent):
    """Base agent with common functionality."""
    
    def __init__(self, runtime):
        self.runtime = runtime
    
    async def _call_llm(
        self,
        system_prompt: str,
        user_input: str,
        context: CanvasContext
    ) -> str:
        """Call LLM with system prompt."""
        messages = [
            Message(role="system", content=system_prompt),
            Message(role="user", content=user_input)
        ]
        
        response = ""
        async for chunk in self.runtime.stream_chat(
            messages=messages,
            tools=[],
            context=context
        ):
            if chunk.type == "text":
                response += chunk.content or ""
        
        return response
```

2. **实现 Distillation Agent**

```python
# backend/src/agents/distillation_agent.py
from src.agents.base_agent import BaseAgent
from src.core.runtime import CanvasContext, Message
from typing import Dict, Any, List
import json

class DistillationAgent(BaseAgent):
    """Agent for distilling conversation content."""
    
    @property
    def name(self) -> str:
        return "distillation"
    
    @property
    def description(self) -> str:
        return "Distills conversation content into concise cards with keywords"
    
    def _build_distillation_prompt(
        self,
        user_input: str,
        context: CanvasContext,
        session_messages: List[Message]
    ) -> str:
        """Build system prompt for distillation."""
        # Get recent conversation
        recent_messages = session_messages[-10:] if len(session_messages) > 10 else session_messages
        conversation = "\n".join([
            f"{msg.role}: {msg.content}" 
            for msg in recent_messages 
            if msg.content
        ])
        
        return f"""你是一个内容提炼专家。你的任务是将对话内容提炼为精华卡片。

## 当前对话历史
{conversation}

## 提炼要求
1. 提取核心观点，压缩为 1-2 句话的标题
2. 识别 3-5 个关键词
3. 推荐已有的相关关键词（从画布现有卡片中）
4. 输出 JSON 格式

## 输出格式
{{
  "title": "压缩后的核心观点",
  "original_text": "原始完整文本",
  "extracted_keywords": ["关键词1", "关键词2", "关键词3"],
  "recommended_keywords": ["画布已有关键词A"],
  "reasoning": "提炼理由"
}}

请提炼用户的输入内容。"""
    
    async def process(
        self,
        user_input: str,
        context: CanvasContext,
        session_messages: List[Message]
    ) -> Dict[str, Any]:
        """Process distillation request."""
        system_prompt = self._build_distillation_prompt(
            user_input, context, session_messages
        )
        
        # Call LLM
        response = await self._call_llm(system_prompt, user_input, context)
        
        # Parse JSON response
        try:
            distilled = json.loads(response)
        except json.JSONDecodeError:
            # Fallback: extract JSON from markdown code block
            import re
            json_match = re.search(r'```json\n(.*?)\n```', response, re.DOTALL)
            if json_match:
                distilled = json.loads(json_match.group(1))
            else:
                distilled = {
                    "title": user_input[:100],
                    "original_text": user_input,
                    "extracted_keywords": [],
                    "recommended_keywords": [],
                    "reasoning": "Failed to parse LLM response"
                }
        
        # Build distillation card
        card = {
            "type": "distillation",
            "text": distilled["title"],
            "metadata": {
                "original_text": distilled["original_text"],
                "extracted_keywords": distilled["extracted_keywords"],
                "recommended_keywords": distilled.get("recommended_keywords", []),
                "user_selected_keywords": [],
                "reasoning": distilled.get("reasoning", "")
            }
        }
        
        return {
            "action": "create_card",
            "card": card,
            "message": f"已提炼内容，提取 {len(distilled['extracted_keywords'])} 个关键词"
        }
```

3. **编写测试**

```python
# backend/tests/test_distillation_agent.py
import pytest
from src.agents.distillation_agent import DistillationAgent
from src.core.runtime import CanvasContext, Message

@pytest.mark.asyncio
async def test_distillation_agent_process():
    # Mock runtime
    class MockRuntime:
        async def stream_chat(self, messages, tools, context):
            # Simulate LLM response
            json_response = '''```json
{
  "title": "AI 提升生产力",
  "original_text": "讨论了 AI 如何提升开发效率",
  "extracted_keywords": ["AI", "生产力", "开发效率"],
  "recommended_keywords": ["自动化"],
  "reasoning": "核心观点是 AI 工具的应用"
}
```'''
            from src.core.runtime import StreamChunk
            yield StreamChunk(type="text", content=json_response)
    
    agent = DistillationAgent(MockRuntime())
    
    result = await agent.process(
        user_input="我们讨论了 AI 如何提升开发效率",
        context=CanvasContext(cards=[], connections=[], groups=[], active_labels=[]),
        session_messages=[]
    )
    
    assert result["action"] == "create_card"
    assert result["card"]["type"] == "distillation"
    assert "extracted_keywords" in result["card"]["metadata"]
    assert len(result["card"]["metadata"]["extracted_keywords"]) > 0
```

---

### Task 4: 集成 Agent Router 到 Chat API (1 day)

**目标**: 在 chat endpoint 中使用 Agent Router

**Files**:
- Modify: `backend/src/api/chat.py`
- Test: `backend/tests/test_chat_with_agents.py`

**Steps**:

1. **修改 chat endpoint**

```python
# backend/src/api/chat.py
from src.core.agent_router import AgentRouter
from src.agents.distillation_agent import DistillationAgent

# In chat_stream endpoint
async def chat_stream(request: ChatRequest):
    # ... existing setup ...
    
    # Initialize agent router
    router = AgentRouter()
    router.register_agent(DistillationAgent(runtime))
    # router.register_agent(ConversationalAgent(runtime))  # Phase 2.5
    
    # Route to appropriate agent
    agent_result = await router.route(
        user_input=request.input,
        context=canvas_context,
        session_messages=session.messages
    )
    
    # Handle agent result
    if agent_result.get("action") == "create_card":
        # Execute tool to create card
        card_data = agent_result["card"]
        # ... create card via tool ...
    
    # Stream agent message
    yield f"data: {json.dumps({'type': 'text', 'content': agent_result['message']})}\n\n"
```

2. **编写集成测试**

```python
# backend/tests/test_chat_with_agents.py
@pytest.mark.asyncio
async def test_chat_routes_to_distillation():
    # Test that "提炼" keyword triggers distillation agent
    pass
```

---

### Task 5: L2 工具 - distill_text (1 day)

**目标**: 创建 Agent 专用的复合工具

**Files**:
- Create: `backend/src/providers/anthropic/l2_tools.py`
- Test: `backend/tests/test_l2_tools.py`

**Steps**:

1. **实现 distill_text 工具**

```python
# backend/src/providers/anthropic/l2_tools.py
from src.core.tools import Tool
from typing import Dict, Any

class DistillTextTool(Tool):
    """L2 tool for distilling text content."""
    
    @property
    def name(self) -> str:
        return "distill_text"
    
    @property
    def description(self) -> str:
        return "Distill long text into concise summary with keywords"
    
    @property
    def schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "Text to distill"
                },
                "max_keywords": {
                    "type": "integer",
                    "description": "Maximum number of keywords to extract",
                    "default": 5
                }
            },
            "required": ["text"]
        }
    
    async def execute(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> str:
        """Execute distillation."""
        text = arguments["text"]
        max_keywords = arguments.get("max_keywords", 5)
        
        # Call distillation agent internally
        # ... implementation ...
        
        return json.dumps({
            "title": "Distilled title",
            "keywords": ["keyword1", "keyword2"],
            "summary": "Brief summary"
        })
```

---

### Task 6: 前端 DistillationCard 组件 (2 days)

**目标**: 实现提炼卡片的前端展示和交互

**Files**:
- Create: `frontend/src/components/cards/DistillationCard.tsx`
- Modify: `frontend/src/components/Canvas.tsx`

**Steps**:

1. **创建 DistillationCard 组件**

```typescript
// frontend/src/components/cards/DistillationCard.tsx
interface DistillationCardProps {
  card: {
    id: number;
    text: string;
    metadata: {
      original_text: string;
      extracted_keywords: string[];
      recommended_keywords: string[];
      user_selected_keywords: string[];
    };
  };
  onKeywordToggle: (cardId: number, keyword: string) => void;
}

export const DistillationCard: React.FC<DistillationCardProps> = ({
  card,
  onKeywordToggle
}) => {
  return (
    <div className="distillation-card">
      <h3>{card.text}</h3>
      
      <div className="keywords-section">
        <h4>提取的关键词</h4>
        {card.metadata.extracted_keywords.map(kw => (
          <label key={kw}>
            <input
              type="checkbox"
              checked={card.metadata.user_selected_keywords.includes(kw)}
              onChange={() => onKeywordToggle(card.id, kw)}
            />
            {kw}
          </label>
        ))}
      </div>
      
      <details>
        <summary>原始内容</summary>
        <p>{card.metadata.original_text}</p>
      </details>
    </div>
  );
};
```

2. **集成到 Canvas**

```typescript
// frontend/src/components/Canvas.tsx
import { DistillationCard } from './cards/DistillationCard';

const renderCard = (card) => {
  switch (card.type) {
    case 'distillation':
      return <DistillationCard card={card} onKeywordToggle={handleKeywordToggle} />;
    case 'note':
    default:
      return <NoteCard card={card} />;
  }
};
```

---

## Testing Strategy

### Unit Tests
- `test_card_types.py` - 卡片类型验证
- `test_agent_router.py` - 路由逻辑
- `test_distillation_agent.py` - 提炼逻辑
- `test_l2_tools.py` - L2 工具

### Integration Tests
- `test_chat_with_agents.py` - 端到端 Agent 流程
- `test_distillation_e2e.py` - 完整提炼流程

### Manual Testing
1. 启动后端: `cd backend && uv run uvicorn src.main:app --reload`
2. 启动前端: `cd frontend && npm run dev`
3. 测试场景:
   - 输入 "请提炼这段对话" → 应触发 Distillation Agent
   - 生成的卡片应包含关键词列表
   - 可以勾选关键词并保存

---

## Acceptance Criteria

- [ ] 卡片支持 `type` 和 `metadata` 字段
- [ ] Agent Router 可根据关键词路由到 Distillation Agent
- [ ] Distillation Agent 生成包含关键词的卡片
- [ ] 前端 DistillationCard 组件可展示和交互
- [ ] 所有单元测试通过
- [ ] 端到端测试通过

---

## Timeline

| Task | Duration | Dependencies |
|------|----------|--------------|
| Task 1: 卡片数据模型 | 1 day | None |
| Task 2: Agent Router | 2 days | Task 1 |
| Task 3: Distillation Agent | 3 days | Task 1, Task 2 |
| Task 4: Chat API 集成 | 1 day | Task 2, Task 3 |
| Task 5: L2 工具 | 1 day | Task 3 |
| Task 6: 前端组件 | 2 days | Task 1 |

**Total**: 10 days (2 weeks)

---

## Next Steps

After Phase 2 completion:
- Phase 3: Socratic Agent + Flow Analyzer Agent
- Phase 4: Conclusion Agent + L3 Tools
