"""Anthropic Claude runtime adapter."""
import json
from typing import AsyncIterator, Dict, Any, List, Optional
from anthropic import AsyncAnthropic
from src.core.runtime import ChatRuntime, Message, ToolCall, ToolResult, StreamChunk, CanvasContext
from src.core.providers import ProviderRegistry
from src.core.tools import ToolRegistry


def _serialize_chunk(chunk: StreamChunk) -> dict:
    """Convert StreamChunk to JSON-safe dict."""
    d: Dict[str, Any] = {"type": chunk.type}
    if chunk.content is not None:
        d["content"] = chunk.content
    if chunk.tool_call is not None:
        d["tool_call"] = {
            "id": chunk.tool_call.id,
            "name": chunk.tool_call.name,
            "arguments": chunk.tool_call.arguments,
        }
    if chunk.tool_result is not None:
        d["tool_result"] = {
            "tool_call_id": chunk.tool_result.tool_call_id,
            "content": chunk.tool_result.content,
            "is_error": chunk.tool_result.is_error,
        }
    if chunk.error is not None:
        d["error"] = chunk.error
    return d


@ProviderRegistry.register("anthropic")
class AnthropicRuntime(ChatRuntime):
    """Anthropic Claude runtime adapter."""

    def __init__(
        self,
        api_key: str,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        **kwargs
    ):
        client_kwargs = {"api_key": api_key}
        if base_url:
            client_kwargs["base_url"] = base_url

        self.client = AsyncAnthropic(**client_kwargs)
        self.model = model or "claude-sonnet-4-5-20250929"
        self._active_streams = []

    async def stream_chat(
        self,
        messages: List[Message],
        tools: List[Dict[str, Any]],
        context: CanvasContext,
        **kwargs
    ) -> AsyncIterator[StreamChunk]:
        """Stream chat with Anthropic API."""
        anthropic_messages = self._convert_messages(messages)
        system_prompt = self._build_system_prompt(context)

        # State for accumulating tool call arguments
        tool_id: Optional[str] = None
        tool_name: Optional[str] = None
        tool_json = ""

        async with self.client.messages.stream(
            model=self.model,
            max_tokens=4096,
            system=system_prompt,
            messages=anthropic_messages,
            tools=tools,
            **kwargs
        ) as stream:
            self._active_streams.append(stream)

            try:
                async for event in stream:
                    etype = event.type

                    if etype == "content_block_start":
                        block = event.content_block
                        if block.type == "tool_use":
                            tool_id = block.id
                            tool_name = block.name
                            tool_json = ""
                        elif block.type == "thinking":
                            yield StreamChunk(type="thinking", content="")

                    elif etype == "content_block_delta":
                        delta = event.delta
                        if delta.type == "text_delta":
                            yield StreamChunk(type="text", content=delta.text)
                        elif delta.type == "thinking_delta":
                            yield StreamChunk(type="thinking", content=delta.thinking)
                        elif delta.type == "input_json_delta":
                            tool_json += delta.partial_json

                    elif etype == "content_block_stop":
                        # Tool call complete — parse accumulated JSON and yield
                        if tool_id and tool_name:
                            try:
                                arguments = json.loads(tool_json) if tool_json else {}
                            except json.JSONDecodeError:
                                arguments = {}
                            yield StreamChunk(
                                type="tool_call",
                                tool_call=ToolCall(
                                    id=tool_id,
                                    name=tool_name,
                                    arguments=arguments
                                )
                            )
                            tool_id = None
                            tool_name = None
                            tool_json = ""
            finally:
                self._active_streams.remove(stream)

        yield StreamChunk(type="done")

    async def execute_tool(
        self,
        tool_call: ToolCall,
        context: CanvasContext
    ) -> ToolResult:
        """Execute a tool call."""
        tool = ToolRegistry.get_tool(tool_call.name)
        if not tool:
            return ToolResult(
                tool_call_id=tool_call.id,
                content=f"Unknown tool: {tool_call.name}",
                is_error=True
            )

        try:
            result = await tool.execute(
                tool_call.arguments,
                {"context": context}
            )
            return ToolResult(
                tool_call_id=tool_call.id,
                content=result
            )
        except Exception as e:
            return ToolResult(
                tool_call_id=tool_call.id,
                content=str(e),
                is_error=True
            )

    async def cleanup(self):
        """Clean up active streams."""
        for stream in self._active_streams:
            await stream.close()
        self._active_streams.clear()

    def _convert_messages(self, messages: List[Message]) -> List[Dict]:
        """Convert to Anthropic message format."""
        anthropic_messages = []

        for msg in messages:
            if msg.role == "system":
                continue  # System messages go in system parameter

            content = []

            # Add text content
            if msg.content:
                content.append({"type": "text", "text": msg.content})

            # Add tool calls
            if msg.tool_calls:
                for tc in msg.tool_calls:
                    content.append({
                        "type": "tool_use",
                        "id": tc.id,
                        "name": tc.name,
                        "input": tc.arguments
                    })

            # Add tool results
            if msg.tool_results:
                for tr in msg.tool_results:
                    content.append({
                        "type": "tool_result",
                        "tool_use_id": tr.tool_call_id,
                        "content": json.dumps(tr.content) if not isinstance(tr.content, str) else tr.content,
                        "is_error": tr.is_error
                    })

            anthropic_messages.append({
                "role": msg.role,
                "content": content
            })

        return anthropic_messages

    @staticmethod
    def _build_system_prompt(context: CanvasContext) -> str:
        """Build system prompt with full canvas context."""
        # Status icons
        status_icons = {
            "": "⚪",
            "pending": "🟡",
            "verified": "✅",
            "conclusion": "🎯"
        }

        def _wrap(text: str) -> str:
            """Wrap user content to prevent prompt injection."""
            return f"<content>{text}</content>"

        # Build cards description
        cards_desc = []
        for card in context.cards:
            icon = status_icons.get(card.get("status", ""), "⚪")
            cards_desc.append(f"  {icon} [ID:{card['id']}] {_wrap(card['text'])}")
        cards_section = "\n".join(cards_desc) if cards_desc else "  (空)"

        # Build connections description
        connections_desc = []
        for conn in context.connections:
            label = conn.get("label", "→")
            connections_desc.append(f"  [{conn['from']}] --{label}--> [{conn['to']}]")
        connections_section = "\n".join(connections_desc) if connections_desc else "  (空)"

        # Build groups description
        groups_desc = []
        for group in context.groups:
            card_ids = ", ".join(str(cid) for cid in group.get("card_ids", []))
            groups_desc.append(f"  {_wrap(group.get('name', '未命名'))} (卡片: {card_ids})")
        groups_section = "\n".join(groups_desc) if groups_desc else "  (无)"

        # Labels
        labels_section = "\n".join(f"  - {l}" for l in context.active_labels) if context.active_labels else "  (无)"

        # Build peripheral cards index
        peripheral_desc = []
        if context.peripheral_cards:
            for p in context.peripheral_cards:
                peripheral_desc.append(f"  📎 [ID:{p['id']}] {_wrap(p['title'])} ({p['status']})")
        peripheral_section = "\n".join(peripheral_desc) if peripheral_desc else "  (无)"

        return f"""你是一个思维链路管理助手。用户正在使用画布来组织思维碎片。

## 当前画布状态

### 卡片 ({len(context.cards)} 个，核心区域)
{cards_section}

### 外围卡片索引 ({len(context.peripheral_cards or [])} 个)
{peripheral_section}

注意：系统使用混合加载策略。核心区域显示完整内容（最近修改、结论卡片等）。
外围卡片仅显示索引。如需查看外围卡片的详细内容，使用 get_card_detail 工具。

### 连接 ({len(context.connections)} 个)
{connections_section}

### 分组 ({len(context.groups)} 个)
{groups_section}

### 可用关系类型（创建连接时必须从中选择）
{labels_section}

## 卡片类型系统

系统支持 7 种卡片类型，每种有不同的用途和展示方式：

1. **note** (📝 笔记卡片) - 默认类型
   - 用途：基础笔记、想法记录
   - 字段：text, title (可选), keywords (可选)

2. **distillation** (💎 提炼卡片)
   - 用途：从长文本中提炼关键信息
   - 必需字段：text (提炼后的核心内容)
   - metadata 结构：
     {{
       "original_text": "原始长文本",
       "extracted_keywords": ["关键词1", "关键词2"],
       "recommended_keywords": ["推荐词1"],
       "user_selected_keywords": [],
       "reasoning": "提炼理由"
     }}

3. **socratic** (❓ 苏格拉底质疑卡片)
   - 用途：对观点进行批判性思考
   - 必需字段：text (质疑的主题)
   - metadata 结构：
     {{
       "original_claim": "原始观点",
       "challenges": [
         {{"question": "质疑问题", "response": "AI回应", "user_reflection": ""}}
       ],
       "reasoning": "质疑理由"
     }}

4. **flow_analysis** (🔄 流程分析卡片)
   - 用途：分析流程、论证结构
   - 必需字段：text (流程标题)
   - metadata 结构：
     {{
       "flow_type": "流程类型",
       "stages": [
         {{"name": "阶段名", "description": "描述", "insights": [], "issues": []}}
       ],
       "overall_insight": "整体洞察",
       "reasoning": "分析理由"
     }}

5. **choice** (🎯 选择卡片)
   - 用途：决策分析，对比多个方案
   - 必需字段：text (决策主题)
   - metadata 结构：
     {{
       "context": "决策背景",
       "options": [
         {{"name": "方案名", "description": "描述", "pros": [], "cons": [], "score": 8}}
       ],
       "recommendation": "推荐建议",
       "user_choice": null,
       "reasoning": "分析理由"
     }}

6. **vote** (🗳️ 投票卡片)
   - 用途：收集意见，快速投票
   - 必需字段：text (投票标题)
   - metadata 结构：
     {{
       "question": "投票问题",
       "options": [
         {{"id": "opt1", "text": "选项1", "votes": 0}}
       ],
       "allow_multiple": false,
       "user_votes": [],
       "total_voters": 0,
       "reasoning": "投票说明"
     }}

7. **conclusion** (🎓 结论卡片)
   - 用途：汇总多个卡片的结论
   - 必需字段：text (结论标题), summary (结论内容)
   - 可选字段：chainIds (关联的卡片ID列表)

## 何时使用哪种卡片类型

- 用户要求"提炼"、"总结"、"浓缩" → 使用 **distillation**
- 用户要求"质疑"、"挑战"、"反思" → 使用 **socratic**
- 用户要求"分析流程"、"论证结构" → 使用 **flow_analysis**
- 用户要求"对比方案"、"决策分析" → 使用 **choice**
- 用户要求"投票"、"收集意见" → 使用 **vote**
- 用户要求"总结结论"、"汇总" → 使用 **conclusion**
- 其他情况 → 使用默认的 **note**

## 可用工具
- add_card: 创建新卡片（支持 type 和 metadata 参数）
- edit_card: 修改卡片内容或状态
- delete_card: 删除卡片及其连接
- move_card: 移动卡片位置
- add_connection: 创建卡片连接
- delete_connection: 删除连接
- search_cards: 搜索卡片内容
- analyze_canvas: 分析画布结构，找出薄弱环节
- get_card_detail: 获取卡片的完整内容（用于加载外围区域的卡片）

## 重要规则
- 创建连接前，必须确认卡片ID存在
- 使用合理的位置布局卡片
- 连接的label必须从可用关系类型中选择
- 分析画布时，关注逻辑完整性和薄弱环节
- 状态含义：pending=待验证, verified=已验证, conclusion=结论
- 创建专门类型的卡片时，必须提供正确的 metadata 结构"""

