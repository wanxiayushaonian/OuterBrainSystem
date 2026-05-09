"""Relation Discoverer Agent for finding semantic connections between cards."""
from src.agents.base_agent import BaseAgent
from src.core.runtime import CanvasContext, Message
from typing import Dict, Any, List, Optional
import json
import re
import logging

logger = logging.getLogger(__name__)


class RelationDiscovererAgent(BaseAgent):
    """Agent for discovering potential relationships between cards.

    This agent:
    1. Takes a target card (new or existing)
    2. Scans all other cards on the canvas
    3. Uses LLM to identify semantic relationships
    4. Suggests connections with relationship labels and confidence scores
    """

    @property
    def name(self) -> str:
        return "relation_discoverer"

    @property
    def description(self) -> str:
        return "Discovers potential connections between cards based on semantic analysis"

    def _build_discovery_prompt(
        self,
        user_input: str,
        context: CanvasContext,
        target_card_id: Optional[int] = None
    ) -> str:
        """Build system prompt for relation discovery.

        Args:
            user_input: User's input text or card content
            context: Canvas context
            target_card_id: Specific card to find relations for (None = scan all)

        Returns:
            System prompt string
        """
        # Get target card
        target_card = None
        if target_card_id:
            for card in context.cards:
                if card.get("id") == target_card_id:
                    target_card = card
                    break

        target_text = target_card["text"] if target_card else user_input
        target_id = target_card["id"] if target_card else None

        # Get other cards (exclude target)
        other_cards = [c for c in context.cards if c.get("id") != target_id]
        if not other_cards:
            return f"""你是一个关系发现专家。目标卡片：
「{target_text}」

画布上没有其他卡片可供关联。返回空结果。"""

        # Build card list
        card_lines = []
        for card in other_cards[:30]:
            status = card.get("status", "")
            icon = {"pending": "🟡", "verified": "✅", "conclusion": "🎯"}.get(status, "⚪")
            card_lines.append(f"  {icon} [#{card['id']}] {card['text'][:80]}")
        cards_section = "\n".join(card_lines)

        # Get existing connections to avoid duplicates
        existing_conns = set()
        for conn in context.connections:
            existing_conns.add((conn.get("from"), conn.get("to")))
            existing_conns.add((conn.get("to"), conn.get("from")))

        # Build active labels
        labels = context.active_labels or ["supports", "contradicts", "extends", "questions", "relates"]
        labels_section = ", ".join(labels)

        return f"""你是一个关系发现专家。你的任务是分析目标卡片与画布上其他卡片之间的潜在关系。

## 目标卡片
[#{target_id or '新'}] {target_text}

## 画布上的其他卡片 ({len(other_cards)} 张)
{cards_section}

## 已有连接（避免重复）
共 {len(existing_conns)} 条已有连接

## 可用关系类型
{labels_section}

## 分析维度
请从以下角度发现关系：

1. **语义关联** — 两张卡片讨论相同或相近的主题
2. **因果关系** — 一张卡片是另一张的原因或结果
3. **支持/反驳** — 一张卡片的论点支持或反驳另一张
4. **补充扩展** — 一张卡片补充或扩展了另一张的内容
5. **类比相似** — 两张卡片在不同领域有相似的结构或模式

## 输出格式
{{
  "target_card_id": {target_id or 'null'},
  "suggestions": [
    {{
      "target_id": 1,
      "label": "关系类型（从可用关系类型中选择）",
      "reason": "为什么存在这个关系（简短说明）",
      "confidence": 0.8
    }}
  ],
  "summary": "发现 X 个潜在关系"
}}

## 要求
- 只返回 confidence >= 0.6 的关系
- 每个目标卡片最多推荐 3 个关系
- 不要推荐已有的连接
- 优先推荐强相关的关系

请分析目标卡片与画布上其他卡片的关系。"""

    def _parse_llm_response(self, response: str) -> Dict[str, Any]:
        """Parse LLM JSON response with fallback."""
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            json_match = re.search(r'```json\n(.*?)\n```', response, re.DOTALL)
            if json_match:
                try:
                    return json.loads(json_match.group(1))
                except json.JSONDecodeError:
                    pass
        return {"target_card_id": None, "suggestions": [], "summary": "解析失败"}

    async def process(
        self,
        user_input: str,
        context: CanvasContext,
        session_messages: List[Message],
        card_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Process relation discovery request.

        Args:
            user_input: User's input text
            context: Canvas context
            session_messages: Conversation history
            card_id: Specific card to find relations for

        Returns:
            Dict with suggestions for connections
        """
        logger.info(f"Relation discoverer scanning for card {card_id or 'all'}...")

        system_prompt = self._build_discovery_prompt(user_input, context, card_id)
        response = await self._call_llm(system_prompt, user_input, context)
        result = self._parse_llm_response(response)

        suggestions = result.get("suggestions", [])
        # Filter by confidence threshold
        suggestions = [s for s in suggestions if s.get("confidence", 0) >= 0.6]

        message = result.get("summary", f"发现 {len(suggestions)} 个潜在关系")

        return {
            "action": "suggest_connections",
            "suggestions": suggestions,
            "message": message,
            "metadata": {
                "target_card_id": card_id,
                "total_scanned": len(context.cards),
                "suggestion_count": len(suggestions)
            }
        }
