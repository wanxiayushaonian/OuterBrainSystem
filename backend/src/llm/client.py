# ═══════════════════════════════════════════════════════
# LLM Client — Anthropic SDK wrapper
# ═══════════════════════════════════════════════════════
import json
import logging
import os

from anthropic import Anthropic
from omegaconf import OmegaConf

logger = logging.getLogger(__name__)

# Lazy singleton
_client: Anthropic | None = None
_cfg: OmegaConf | None = None


def get_client() -> Anthropic:
    global _client
    if _client is None:
        # Support both ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN
        api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN environment variable is required")

        # Support third-party Anthropic-compatible API via custom base URL
        base_url = os.environ.get("ANTHROPIC_BASE_URL") or get_cfg().llm.get("base_url", "")
        if base_url:
            _client = Anthropic(api_key=api_key, base_url=base_url)
        else:
            _client = Anthropic(api_key=api_key)
    return _client


def get_cfg() -> OmegaConf:
    global _cfg
    if _cfg is None:
        from pathlib import Path
        conf_path = Path(__file__).parent.parent.parent / "run" / "conf" / "config.yaml"
        _cfg = OmegaConf.load(conf_path)
    return _cfg


def chat(
    system: str,
    user: str,
    model: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
    retries: int = 2,
) -> str:
    """Send a single-turn chat request to the Anthropic API."""
    cfg = get_cfg()
    client = get_client()

    # ANTHROPIC_MODEL env var overrides all model settings
    env_model = os.environ.get("ANTHROPIC_MODEL")
    effective_model = env_model or model or cfg.llm.model

    for attempt in range(retries + 1):
        response = client.messages.create(
            model=effective_model,
            max_tokens=max_tokens or cfg.llm.max_tokens,
            temperature=temperature if temperature is not None else cfg.llm.temperature,
            system=system,
            messages=[{"role": "user", "content": user}],
            thinking={"type": "disabled"},
        )

        # Extract text from response
        text = ""
        for block in response.content:
            if hasattr(block, "text"):
                text += block.text

        if text.strip():
            return text

        # Empty response — retry once
        if attempt < retries:
            logger.warning(f"LLM returned empty response, retrying (attempt {attempt + 2}/{retries + 1})")

    return text


def _repair_json(text: str) -> str:
    """Attempt to repair truncated or malformed JSON."""
    import re

    # Remove trailing commas before } or ]
    text = re.sub(r",\s*([}\]])", r"\1", text)

    # Track open brackets/braces to close them
    stack = []
    in_string = False
    escape = False
    last_string_start = -1

    for i, ch in enumerate(text):
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            if in_string:
                last_string_start = i
            continue
        if in_string:
            continue
        if ch in "{[":
            stack.append(ch)
        elif ch == "}" and stack and stack[-1] == "{":
            stack.pop()
        elif ch == "]" and stack and stack[-1] == "[":
            stack.pop()

    # If we're mid-string, close it
    if in_string:
        text += '"'

    # Close any open brackets/braces in reverse order
    closers = {"{": "}", "[": "]"}
    for opener in reversed(stack):
        text += closers[opener]

    return text


def _extract_json(text: str) -> dict | list:
    """Extract JSON from LLM response, handling various formats."""
    import re

    text = text.strip()
    if not text:
        raise ValueError("Empty response from LLM")

    # Strategy 1: Direct parse
    try:
        result = json.loads(text)
        if isinstance(result, (dict, list)):
            return result
    except json.JSONDecodeError:
        pass

    # Strategy 2: Strip markdown code block
    if "```" in text:
        match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
        if match:
            try:
                result = json.loads(match.group(1).strip())
                if isinstance(result, (dict, list)):
                    return result
            except json.JSONDecodeError:
                pass

    # Strategy 3: Extract JSON object (try { } first, before [ ])
    start = text.find("{")
    if start != -1:
        candidate = text[start:]
        # Try to find a valid closing }
        end = candidate.rfind("}")
        if end != -1:
            try:
                return json.loads(candidate[: end + 1])
            except json.JSONDecodeError:
                pass
        # Truncated: try to repair
        repaired = _repair_json(candidate)
        try:
            return json.loads(repaired)
        except json.JSONDecodeError:
            pass

    # Strategy 4: Extract JSON array (only if no object found)
    start = text.find("[")
    if start != -1:
        candidate = text[start:]
        end = candidate.rfind("]")
        if end != -1:
            try:
                return json.loads(candidate[: end + 1])
            except json.JSONDecodeError:
                pass
        repaired = _repair_json(candidate)
        try:
            return json.loads(repaired)
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract valid JSON from response: {text[:300]}")


def chat_multi(
    system: str,
    messages: list[dict],
    model: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
    retries: int = 2,
) -> str:
    """Send a multi-turn chat request to the Anthropic API."""
    cfg = get_cfg()
    client = get_client()

    env_model = os.environ.get("ANTHROPIC_MODEL")
    effective_model = env_model or model or cfg.llm.model

    for attempt in range(retries + 1):
        response = client.messages.create(
            model=effective_model,
            max_tokens=max_tokens or cfg.llm.max_tokens,
            temperature=temperature if temperature is not None else cfg.llm.temperature,
            system=system,
            messages=messages,
            thinking={"type": "disabled"},
        )

        text = ""
        for block in response.content:
            if hasattr(block, "text"):
                text += block.text

        if text.strip():
            return text

        if attempt < retries:
            logger.warning(f"LLM returned empty response, retrying (attempt {attempt + 2}/{retries + 1})")

    return text


# ── Tools for function calling ──

CANVAS_TOOLS = [
    {
        "name": "add_card",
        "description": "在画布上创建一张新卡片。支持 7 种类型：note(默认), distillation(提炼), socratic(质疑), flow_analysis(流程分析), choice(选择), vote(投票), conclusion(结论)。",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "卡片内容"},
                "source": {"type": "string", "description": "来源，如 'AI 质询'"},
                "status": {"type": "string", "enum": ["", "pending", "verified", "conclusion"], "description": "卡片状态"},
                "type": {"type": "string", "enum": ["note", "distillation", "socratic", "flow_analysis", "choice", "vote", "conclusion"], "description": "卡片类型"},
                "metadata": {"type": "object", "description": "卡片元数据（用于专门类型）"},
                "summary": {"type": "string", "description": "结论摘要（仅 conclusion 类型）"},
                "chainIds": {"type": "array", "items": {"type": "integer"}, "description": "关联卡片ID（仅 conclusion 类型）"},
            },
            "required": ["text"],
        },
    },
    {
        "name": "add_connection",
        "description": "在两张卡片之间创建连接关系。当你发现两张卡片之间存在逻辑关系时使用。label 必须从系统提示中列出的可用关系类型中选择。",
        "input_schema": {
            "type": "object",
            "properties": {
                "from": {"type": "integer", "description": "起点卡片 ID"},
                "to": {"type": "integer", "description": "终点卡片 ID"},
                "label": {"type": "string", "description": "关系类型，必须从可用关系类型列表中选择"},
            },
            "required": ["from", "to", "label"],
        },
    },
    {
        "name": "edit_card",
        "description": "修改已有卡片的内容或状态。",
        "input_schema": {
            "type": "object",
            "properties": {
                "card_id": {"type": "integer", "description": "要修改的卡片ID"},
                "text": {"type": "string", "description": "新的卡片内容（可选）"},
                "status": {"type": "string", "enum": ["", "pending", "verified", "conclusion"], "description": "新的状态（可选）"},
            },
            "required": ["card_id"],
        },
    },
    {
        "name": "delete_card",
        "description": "删除画布上的卡片及其所有连接。",
        "input_schema": {
            "type": "object",
            "properties": {
                "card_id": {"type": "integer", "description": "要删除的卡片ID"},
            },
            "required": ["card_id"],
        },
    },
    {
        "name": "move_card",
        "description": "移动卡片到画布上的新位置。",
        "input_schema": {
            "type": "object",
            "properties": {
                "card_id": {"type": "integer", "description": "要移动的卡片ID"},
                "x": {"type": "number", "description": "新的X坐标"},
                "y": {"type": "number", "description": "新的Y坐标"},
            },
            "required": ["card_id", "x", "y"],
        },
    },
    {
        "name": "delete_connection",
        "description": "删除两张卡片之间的连接关系。",
        "input_schema": {
            "type": "object",
            "properties": {
                "from": {"type": "integer", "description": "起点卡片 ID"},
                "to": {"type": "integer", "description": "终点卡片 ID"},
            },
            "required": ["from", "to"],
        },
    },
    {
        "name": "search_cards",
        "description": "搜索画布上的卡片内容，返回匹配的卡片列表。",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "搜索关键词"},
                "status": {"type": "string", "enum": ["", "pending", "verified", "conclusion"], "description": "按状态过滤（可选）"},
            },
            "required": ["query"],
        },
    },
    # ── L3 Agent Tools ──
    {
        "name": "challenge_thinking",
        "description": "用苏格拉底式提问挑战画布上的思维。生成质疑问题、发现逻辑漏洞、提出新视角。",
        "input_schema": {
            "type": "object",
            "properties": {
                "focus": {"type": "string", "description": "要挑战的具体内容或主题"},
                "card_ids": {"type": "array", "items": {"type": "integer"}, "description": "要聚焦的卡片ID（可选）"},
            },
            "required": ["focus"],
        },
    },
    {
        "name": "analyze_flow",
        "description": "分析画布上思维结构的完整性。检测孤立卡片、瓶颈、断裂环节，给出结构评分和改进建议。",
        "input_schema": {
            "type": "object",
            "properties": {
                "focus": {"type": "string", "description": "分析角度：structure/gaps/completeness/general", "default": "general"},
            },
        },
    },
    {
        "name": "synthesize_cards",
        "description": "将多张卡片综合为一个结论。提取关键要点、识别共识与分歧、生成结论卡片。",
        "input_schema": {
            "type": "object",
            "properties": {
                "card_ids": {"type": "array", "items": {"type": "integer"}, "description": "要综合的卡片ID（空=自动检测）"},
                "focus": {"type": "string", "description": "结论聚焦的角度", "default": "general"},
            },
        },
    },
    {
        "name": "discover_relations",
        "description": "扫描画布，发现目标卡片与其他卡片之间的潜在语义关系。用于自动推荐连接。",
        "input_schema": {
            "type": "object",
            "properties": {
                "card_id": {"type": "integer", "description": "要分析的卡片ID（不填=扫描最近的卡片）"},
                "focus": {"type": "string", "description": "分析角度", "default": "general"},
            },
        },
    },
    {
        "name": "debate_mode",
        "description": "对选中卡片启动辩论模式。自动搜索支持/反驳证据，生成正反方对比分析。",
        "input_schema": {
            "type": "object",
            "properties": {
                "card_ids": {"type": "array", "items": {"type": "integer"}, "description": "要辩论的卡片ID"},
                "focus": {"type": "string", "description": "辩论焦点", "default": "general"},
            },
        },
    },
    {
        "name": "research_path",
        "description": "从一个主题卡片生成研究路径简报。分析当前理解、思维盲区、建议下一步。",
        "input_schema": {
            "type": "object",
            "properties": {
                "card_id": {"type": "integer", "description": "主题卡片ID"},
                "focus": {"type": "string", "description": "研究方向", "default": "general"},
            },
        },
    },
]


def chat_multi_stream(
    system: str,
    messages: list[dict],
    model: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
    tools: list[dict] | None = None,
):
    """Send a multi-turn chat request with streaming. Returns an iterator of events."""
    cfg = get_cfg()
    client = get_client()

    env_model = os.environ.get("ANTHROPIC_MODEL")
    effective_model = env_model or model or cfg.llm.model

    kwargs = {
        "model": effective_model,
        "max_tokens": max_tokens or cfg.llm.max_tokens,
        "temperature": temperature if temperature is not None else cfg.llm.temperature,
        "system": system,
        "messages": messages,
        "thinking": {"type": "disabled"},
    }
    if tools:
        kwargs["tools"] = tools

    return client.messages.stream(**kwargs)


def chat_json(
    system: str,
    user: str,
    model: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
) -> dict:
    """Send a chat request expecting JSON output."""
    raw = chat(system, user, model, max_tokens, temperature)
    try:
        return _extract_json(raw)
    except ValueError:
        logger.warning(f"Failed to parse JSON from LLM response. Raw output:\n{raw[:500]}")
        raise


# ── Agent Runtime Wrapper ────────────────────────────────

class SyncAgentRuntime:
    """Sync wrapper so agents can call LLM via the existing client.

    Agents expect a ChatRuntime with async stream_chat(). This wrapper
    adapts the sync chat() function to that interface.
    """

    async def stream_chat(self, messages, tools, context, **kwargs):
        """Adapter that yields StreamChunks from sync chat."""
        from src.core.runtime.types import StreamChunk

        # Build message list for chat_multi
        msg_list = []
        for m in messages:
            msg_list.append({"role": m.role, "content": m.content or ""})

        system = ""
        if msg_list and msg_list[0]["role"] == "system":
            system = msg_list.pop(0)["content"]

        try:
            text = chat_multi(system=system, messages=msg_list)
            if text:
                yield StreamChunk(type="text", content=text)
            yield StreamChunk(type="done")
        except Exception as e:
            logger.error(f"Agent LLM call failed: {e}")
            yield StreamChunk(type="error", error=str(e))

    async def cleanup(self):
        pass


# Lazy singleton for agent runtime
_agent_runtime: SyncAgentRuntime | None = None


def get_agent_runtime() -> SyncAgentRuntime:
    global _agent_runtime
    if _agent_runtime is None:
        _agent_runtime = SyncAgentRuntime()
    return _agent_runtime


# ── L3 Agent Tool Executor ───────────────────────────────

L3_TOOL_NAMES = {
    "challenge_thinking", "analyze_flow", "synthesize_cards",
    "discover_relations", "debate_mode", "research_path",
}


async def execute_agent_tool(tool_name: str, tool_input: dict, context: dict) -> str | None:
    """Execute an L3 agent tool server-side.

    Returns JSON result string if handled, None if not an L3 tool.
    """
    if tool_name not in L3_TOOL_NAMES:
        return None

    from src.agents import (
        SocraticAgent, FlowAnalyzerAgent, ConclusionAgent,
        RelationDiscovererAgent, CognitiveDebateAgent, ResearchPathAgent,
    )
    from src.core.runtime.types import CanvasContext

    runtime = get_agent_runtime()

    agents = {
        "challenge_thinking": SocraticAgent(runtime),
        "analyze_flow": FlowAnalyzerAgent(runtime),
        "synthesize_cards": ConclusionAgent(runtime),
        "discover_relations": RelationDiscovererAgent(runtime),
        "debate_mode": CognitiveDebateAgent(runtime),
        "research_path": ResearchPathAgent(runtime),
    }

    agent = agents.get(tool_name)
    if not agent:
        return None

    canvas_context = CanvasContext(
        cards=context.get("cards", []),
        connections=context.get("connections", []),
        groups=context.get("groups", []),
        active_labels=context.get("active_labels", [])
    )

    try:
        # Agent-specific parameter handling
        kwargs = {
            "user_input": tool_input.get("focus", ""),
            "context": canvas_context,
            "session_messages": [],
        }

        if tool_name in ("discover_relations", "research_path"):
            # These agents use card_id (singular)
            kwargs["card_id"] = tool_input.get("card_id")
        elif tool_name in ("synthesize_cards", "debate_mode"):
            # These agents use card_ids (plural)
            kwargs["card_ids"] = tool_input.get("card_ids") or None
        # challenge_thinking and analyze_flow don't need card params

        result = await agent.process(**kwargs)
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Agent tool {tool_name} failed: {e}")
        return json.dumps({"action": "error", "message": str(e)}, ensure_ascii=False)
