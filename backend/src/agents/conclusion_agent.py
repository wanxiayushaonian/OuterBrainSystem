"""Conclusion Agent for synthesizing card groups into conclusion cards."""
from src.agents.base_agent import BaseAgent
from src.core.runtime import CanvasContext, Message
from typing import Dict, Any, List, Optional
import json
import re
import logging

logger = logging.getLogger(__name__)


class ConclusionAgent(BaseAgent):
    """Agent for synthesizing multiple cards into a conclusion.

    This agent:
    1. Takes a set of related cards (by selection or topic)
    2. Identifies key themes and agreements/disagreements
    3. Generates a structured conclusion with takeaways
    4. Creates a conclusion card with chain references to source cards
    """

    @property
    def name(self) -> str:
        return "conclusion"

    @property
    def description(self) -> str:
        return "Synthesizes card groups into conclusion cards with key takeaways"

    def _get_target_cards(
        self,
        user_input: str,
        context: CanvasContext,
        card_ids: Optional[List[int]] = None
    ) -> List[Dict[str, Any]]:
        """Get target cards for conclusion.

        Args:
            user_input: User's input text
            context: Canvas context
            card_ids: Specific card IDs to include (None = auto-detect)

        Returns:
            List of target cards
        """
        if card_ids:
            # Use specified cards
            return [c for c in context.cards if c.get("id") in card_ids]

        # Auto-detect: use cards mentioned in user input
        mentioned_ids = set()
        import re as regex
        for match in regex.finditer(r'#(\d+)', user_input):
            mentioned_ids.add(int(match.group(1)))

        if mentioned_ids:
            return [c for c in context.cards if c.get("id") in mentioned_ids]

        # Fallback: use pending/verified cards
        return [c for c in context.cards if c.get("status") in ("pending", "verified")]

    def _build_conclusion_prompt(
        self,
        user_input: str,
        context: CanvasContext,
        session_messages: List[Message],
        target_cards: List[Dict[str, Any]]
    ) -> str:
        """Build system prompt for conclusion generation.

        Args:
            user_input: User's input text
            context: Canvas context
            session_messages: Conversation history
            target_cards: Cards to synthesize

        Returns:
            System prompt string
        """
        # Build card descriptions
        card_lines = []
        for card in target_cards:
            status = card.get("status", "")
            icon = {"pending": "🟡", "verified": "✅", "conclusion": "🎯"}.get(status, "⚪")
            card_lines.append(f"  {icon} [#{card['id']}] {card['text']}")
        cards_section = "\n".join(card_lines) if card_lines else "  (无目标卡片)"

        # Build connection context for target cards
        target_ids = {c.get("id") for c in target_cards}
        relevant_conns = [
            c for c in context.connections
            if c.get("from") in target_ids or c.get("to") in target_ids
        ]
        conn_lines = []
        for conn in relevant_conns:
            conn_lines.append(f"  #{conn['from']} --[{conn.get('label', 'relates')}]--> #{conn['to']}")
        connections_section = "\n".join(conn_lines) if conn_lines else "  (无直接连接)"

        # Recent conversation
        recent_messages = session_messages[-5:] if len(session_messages) > 5 else session_messages
        conversation = "\n".join([
            f"{msg.role}: {msg.content}"
            for msg in recent_messages
            if msg.content
        ])

        return f"""你是一个思维总结专家。你的任务是将多张卡片的内容综合为一个结论。

## 目标卡片 ({len(target_cards)} 张)
{cards_section}

## 相关连接
{connections_section}

## 最近对话
{conversation}

## 结论生成要求
1. 识别所有卡片的核心主题
2. 找出共识和分歧点
3. 提炼出 2-4 个关键要点
4. 生成一个简洁有力的结论摘要
5. 指出思维中的亮点和不足

## 输出格式
{{
  "title": "结论标题（不超过 30 字）",
  "summary": "结论摘要（2-3 句话，概括核心观点）",
  "key_takeaways": [
    "要点1：具体结论",
    "要点2：具体结论"
  ],
  "consensus": ["共识点1", "共识点2"],
  "disagreements": ["分歧点1"],
  "strengths": ["思维亮点1"],
  "gaps": ["需要补充的方面1"],
  "reasoning": "得出此结论的推理过程"
}}

请综合以上卡片内容，生成一个结构化的结论。"""

    def _parse_llm_response(
        self,
        response: str,
        target_cards: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Parse LLM JSON response with fallback.

        Args:
            response: LLM response text
            target_cards: Source cards (for fallback)

        Returns:
            Parsed conclusion data
        """
        try:
            result = json.loads(response)
        except json.JSONDecodeError:
            json_match = re.search(r'```json\n(.*?)\n```', response, re.DOTALL)
            if json_match:
                try:
                    result = json.loads(json_match.group(1))
                except json.JSONDecodeError:
                    result = None
            else:
                result = None

        if not result:
            logger.warning("Failed to parse LLM response, using fallback")
            card_count = len(target_cards)
            result = {
                "title": f"综合结论（{card_count} 张卡片）",
                "summary": f"基于 {card_count} 张卡片的综合分析",
                "key_takeaways": [c.get("text", "")[:50] for c in target_cards[:3]],
                "consensus": [],
                "disagreements": [],
                "strengths": [],
                "gaps": [],
                "reasoning": "自动生成的结论"
            }

        return result

    async def process(
        self,
        user_input: str,
        context: CanvasContext,
        session_messages: List[Message],
        card_ids: Optional[List[int]] = None
    ) -> Dict[str, Any]:
        """Process conclusion generation request.

        Args:
            user_input: User's input text
            context: Canvas context
            session_messages: Conversation history
            card_ids: Specific card IDs to synthesize (None = auto-detect)

        Returns:
            Dict with action="create_card" and conclusion card data
        """
        logger.info(f"Conclusion agent processing: {user_input[:50]}...")

        # Get target cards
        target_cards = self._get_target_cards(user_input, context, card_ids)
        if not target_cards:
            return {
                "action": "message",
                "message": "没有找到需要总结的卡片。请先选择一些卡片或确保画布上有待处理的卡片。",
                "card": None
            }

        # Build prompt and call LLM
        system_prompt = self._build_conclusion_prompt(
            user_input, context, session_messages, target_cards
        )
        response = await self._call_llm(system_prompt, user_input, context)
        result = self._parse_llm_response(response, target_cards)

        # Build conclusion card
        chain_ids = [c.get("id") for c in target_cards]
        text = result.get("title", "结论")
        summary = result.get("summary", "")

        card = {
            "type": "conclusion",
            "text": text,
            "status": "conclusion",
            "metadata": {
                "summary": summary,
                "key_takeaways": result.get("key_takeaways", []),
                "consensus": result.get("consensus", []),
                "disagreements": result.get("disagreements", []),
                "strengths": result.get("strengths", []),
                "gaps": result.get("gaps", []),
                "reasoning": result.get("reasoning", ""),
                "chain_ids": chain_ids,
                "source_count": len(target_cards)
            }
        }

        takeaway_count = len(result.get("key_takeaways", []))
        message = f"已生成结论「{text}」，综合 {len(target_cards)} 张卡片"
        if takeaway_count:
            message += f"，提炼 {takeaway_count} 个要点"

        return {
            "action": "create_card",
            "card": card,
            "message": message,
            "metadata": {
                "conclusion_result": result,
                "chain_ids": chain_ids
            }
        }
