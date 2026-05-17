"""Cognitive Debate Agent for structured argumentation and counter-evidence."""
from src.agents.base_agent import BaseAgent
from src.core.runtime import CanvasContext, Message
from typing import Dict, Any, List, Optional
import json
import re
import logging

logger = logging.getLogger(__name__)


class CognitiveDebateAgent(BaseAgent):
    """Agent for structured cognitive debate — finds counter-evidence and generates pro/con analysis.

    This agent:
    1. Takes a claim or set of cards
    2. Searches existing cards for supporting and contradicting evidence
    3. Generates structured pro/con arguments
    4. Creates debate cards with evidence chains
    """

    @property
    def name(self) -> str:
        return "cognitive_debate"

    @property
    def description(self) -> str:
        return "Structured debate mode — finds counter-evidence, generates pro/con analysis"

    def _find_related_cards(
        self,
        claim: str,
        context: CanvasContext,
        card_ids: Optional[List[int]] = None
    ) -> Dict[str, List[Dict]]:
        """Find cards that support or contradict the claim.

        Args:
            claim: The claim to evaluate
            context: Canvas context
            card_ids: Specific cards to include

        Returns:
            Dict with 'supporting' and 'contradicting' card lists
        """
        if card_ids:
            cards = [c for c in context.cards if c.get("id") in card_ids]
        else:
            cards = context.cards

        # Simple keyword-based pre-filter
        claim_words = set(claim.lower().split())
        related = []
        for card in cards:
            card_words = set(card.get("text", "").lower().split())
            overlap = claim_words & card_words
            if len(overlap) >= 1:  # At least 1 word overlap
                related.append(card)

        return {
            "related": related[:20],
            "all": cards[:30]
        }

    def _build_debate_prompt(
        self,
        user_input: str,
        context: CanvasContext,
        session_messages: List[Message],
        card_ids: Optional[List[int]] = None
    ) -> str:
        """Build system prompt for cognitive debate.

        Args:
            user_input: User's input (claim or topic)
            context: Canvas context
            session_messages: Conversation history
            card_ids: Specific card IDs to debate

        Returns:
            System prompt string
        """
        # Get target cards
        if card_ids:
            target_cards = [c for c in context.cards if c.get("id") in card_ids]
        else:
            target_cards = [c for c in context.cards if c.get("status") in ("pending", "verified")]

        # Build card descriptions
        card_lines = []
        for card in target_cards[:15]:
            status = card.get("status", "")
            icon = {"pending": "🟡", "verified": "✅", "conclusion": "🎯"}.get(status, "⚪")
            card_lines.append(f"  {icon} [#{card['id']}] {card['text'][:80]}")
        cards_section = "\n".join(card_lines) if card_lines else "  (无目标卡片)"

        # Find related cards for evidence
        related = self._find_related_cards(user_input, context, card_ids)
        related_lines = []
        for card in related["related"][:15]:
            if card.get("id") not in (card_ids or []):
                related_lines.append(f"  [#{card['id']}] {card['text'][:60]}")
        related_section = "\n".join(related_lines) if related_lines else "  (未找到相关证据卡片)"

        # Build active labels
        labels = context.active_labels or ["supports", "contradicts", "extends", "questions", "relates"]

        return f"""你是一个认知纠偏专家。你的任务是对画布上的观点进行批判性辩论。

## 待辩论的观点/卡片
{cards_section}

## 相关证据卡片
{related_section}

## 辩论框架
请从以下角度进行辩论：

### 正方（支持）
1. 找出支持该观点的证据和逻辑
2. 强化论点的最佳理由
3. 潜在的强支撑

### 反方（反驳）
1. 找出反驳该观点的证据和逻辑
2. 识别逻辑漏洞和假设
3. 替代解释和反例

### 综合评估
1. 论证强度评分 (0-1)
2. 关键分歧点
3. 需要进一步验证的假设
4. 建议的下一步思考

## 输出格式
{{
  "claim": "被辩论的核心观点",
  "pro_arguments": [
    {{
      "point": "支持论点",
      "evidence": "证据来源（卡片ID或推理）",
      "strength": "strong|moderate|weak"
    }}
  ],
  "con_arguments": [
    {{
      "point": "反驳论点",
      "evidence": "证据来源",
      "strength": "strong|moderate|weak"
    }}
  ],
  "assessment": {{
    "overall_strength": 0.7,
    "key_disagreement": "核心分歧点",
    "assumptions_to_verify": ["需要验证的假设1"],
    "suggested_next_steps": ["建议的下一步"]
  }}
}}

请进行客观、严谨的辩论分析。"""

    def _parse_llm_response(self, response: str, user_input: str) -> Dict[str, Any]:
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

        return {
            "claim": user_input[:100],
            "pro_arguments": [],
            "con_arguments": [],
            "assessment": {
                "overall_strength": 0.5,
                "key_disagreement": "无法自动分析",
                "assumptions_to_verify": [],
                "suggested_next_steps": []
            }
        }

    async def process(
        self,
        user_input: str,
        context: CanvasContext,
        session_messages: List[Message],
        card_ids: Optional[List[int]] = None
    ) -> Dict[str, Any]:
        """Process cognitive debate request.

        Args:
            user_input: User's input (claim or topic)
            context: Canvas context
            session_messages: Conversation history
            card_ids: Specific card IDs to debate

        Returns:
            Dict with debate results and suggested cards
        """
        logger.info(f"Cognitive debate agent processing: {user_input[:50]}...")

        system_prompt = self._build_debate_prompt(
            user_input, context, session_messages, card_ids
        )
        response = await self._call_llm(system_prompt, user_input, context)
        result = self._parse_llm_response(response, user_input)

        pro_count = len(result.get("pro_arguments", []))
        con_count = len(result.get("con_arguments", []))
        strength = result.get("assessment", {}).get("overall_strength", 0)

        # Build debate summary card
        claim = result.get("claim", user_input[:100])
        text = f"⚖️ 辩论: {claim[:40]}{'...' if len(claim) > 40 else ''}"

        pro_args = result.get("pro_arguments", [])
        con_args = result.get("con_arguments", [])
        assessment = result.get("assessment", {})

        card = {
            "type": "debate",
            "text": text,
            "status": "pending",
            "metadata": {
                "debate": {
                    "topic": claim,
                    "positions": [
                        {
                            "title": "支持论点",
                            "supporting_evidence": "\n".join(
                                f"{arg['point']}: {arg.get('evidence', '')}" for arg in pro_args
                            ),
                            "challenges": ""
                        },
                        {
                            "title": "反驳论点",
                            "supporting_evidence": "",
                            "challenges": "\n".join(
                                f"{arg['point']}: {arg.get('evidence', '')}" for arg in con_args
                            )
                        }
                    ],
                    "synthesis": assessment.get("key_disagreement", "") + "\n" + "\n".join(
                        assessment.get("suggested_next_steps", [])
                    )
                },
                "debate_type": "cognitive_debate",
                "claim": claim,
                "pro_arguments": pro_args,
                "con_arguments": con_args,
                "assessment": assessment,
                "source_card_ids": card_ids or []
            }
        }

        message = f"辩论分析完成: {pro_count} 个支持论点, {con_count} 个反驳论点"
        message += f" (论证强度: {strength:.0%})"

        return {
            "action": "create_card",
            "card": card,
            "message": message,
            "metadata": {
                "debate_result": result,
                "source_card_ids": card_ids
            }
        }
