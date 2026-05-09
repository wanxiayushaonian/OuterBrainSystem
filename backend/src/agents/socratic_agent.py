"""Socratic Agent for challenging thinking with probing questions."""
from src.agents.base_agent import BaseAgent
from src.core.runtime import CanvasContext, Message
from typing import Dict, Any, List
import json
import re
import logging

logger = logging.getLogger(__name__)


class SocraticAgent(BaseAgent):
    """Agent for Socratic questioning — challenges assumptions and finds logical gaps.

    This agent:
    1. Analyzes the target card(s) and surrounding context
    2. Identifies hidden assumptions and logical gaps
    3. Generates probing questions to deepen thinking
    4. Creates a socratic card with structured metadata
    """

    @property
    def name(self) -> str:
        return "socratic"

    @property
    def description(self) -> str:
        return "Challenges thinking with Socratic questioning, finds assumptions and logical gaps"

    def _extract_assumptions_from_canvas(self, context: CanvasContext) -> List[str]:
        """Extract potential assumptions from canvas cards.

        Args:
            context: Canvas context

        Returns:
            List of potential assumptions found in card text
        """
        assumptions = []
        # Look for assumption indicators in card text
        assumption_indicators = [
            " obviously", " clearly", " of course", " everyone knows",
            " 显然", " 当然", " 毫无疑问", " 众所周知", " 肯定",
            " always", " never", " all", " none",
            " 总是", " 从不", " 所有", " 没有"
        ]
        for card in context.cards:
            text = card.get("text", "").lower()
            for indicator in assumption_indicators:
                if indicator in text:
                    assumptions.append(card.get("text", "")[:100])
                    break
        return assumptions

    def _build_socratic_prompt(
        self,
        user_input: str,
        context: CanvasContext,
        session_messages: List[Message]
    ) -> str:
        """Build system prompt for Socratic questioning.

        Args:
            user_input: User's input text
            context: Canvas context
            session_messages: Conversation history

        Returns:
            System prompt string
        """
        # Get recent conversation
        recent_messages = session_messages[-10:] if len(session_messages) > 10 else session_messages
        conversation = "\n".join([
            f"{msg.role}: {msg.content}"
            for msg in recent_messages
            if msg.content
        ])

        # Get canvas card summary
        card_summaries = []
        for card in context.cards[:20]:  # Limit to 20 cards
            status = card.get("status", "")
            icon = {"pending": "🟡", "verified": "✅", "conclusion": "🎯"}.get(status, "⚪")
            card_summaries.append(f"  {icon} [#{card['id']}] {card['text'][:80]}")
        cards_section = "\n".join(card_summaries) if card_summaries else "  (空)"

        # Get existing assumptions
        assumptions = self._extract_assumptions_from_canvas(context)
        assumptions_section = "\n".join(f"  - {a}" for a in assumptions[:5]) if assumptions else "  未检测到明显假设"

        return f"""你是一个苏格拉底式的批判性思考助手。你的任务是通过提问来挑战和深化用户的思维。

## 当前对话历史
{conversation}

## 画布上的卡片
{cards_section}

## 检测到的潜在假设
{assumptions_section}

## 苏格拉底式提问框架
请从以下角度生成问题：

1. **澄清类** (Clarification)
   - "你说的 X 具体是什么意思？"
   - "能否举一个具体例子？"

2. **假设挑战类** (Challenging Assumptions)
   - "你为什么假设 X？"
   - "如果反过来想呢？"

3. **证据类** (Evidence)
   - "有什么证据支持这个观点？"
   - "有没有反面的例子？"

4. **视角类** (Perspective)
   - "从另一个角度看会怎样？"
   - "反对者会怎么说？"

5. **后果类** (Consequences)
   - "如果这是真的，会导致什么？"
   - "长期来看会怎样？"

## 输出格式
{{
  "target_card_id": null,
  "questions": [
    {{
      "type": "clarification|assumption|evidence|perspective|consequence",
      "question": "具体的问题内容",
      "reasoning": "为什么要问这个问题"
    }}
  ],
  "identified_gaps": ["逻辑漏洞1", "逻辑漏洞2"],
  "suggested_explorations": ["建议探索的方向1", "建议探索的方向2"]
}}

请基于画布内容和对话历史，生成 2-4 个有针对性的苏格拉底式问题。"""

    def _parse_llm_response(self, response: str, user_input: str) -> Dict[str, Any]:
        """Parse LLM JSON response with fallback.

        Args:
            response: LLM response text
            user_input: Original user input (for fallback)

        Returns:
            Parsed socratic data
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
            result = {
                "target_card_id": None,
                "questions": [
                    {
                        "type": "clarification",
                        "question": f"关于「{user_input[:50]}」，你能更具体地解释一下吗？",
                        "reasoning": "需要更清晰的理解"
                    }
                ],
                "identified_gaps": [],
                "suggested_explorations": []
            }

        return result

    async def process(
        self,
        user_input: str,
        context: CanvasContext,
        session_messages: List[Message]
    ) -> Dict[str, Any]:
        """Process Socratic questioning request.

        Args:
            user_input: User's input text
            context: Canvas context
            session_messages: Conversation history

        Returns:
            Dict with action="create_card" and socratic card data
        """
        logger.info(f"Socratic agent processing: {user_input[:50]}...")

        system_prompt = self._build_socratic_prompt(user_input, context, session_messages)
        response = await self._call_llm(system_prompt, user_input, context)
        result = self._parse_llm_response(response, user_input)

        # Build questions summary for card text
        questions = result.get("questions", [])
        if questions:
            primary_question = questions[0].get("question", "")
            text = f"🤔 {primary_question}"
            if len(questions) > 1:
                text += f" (+{len(questions) - 1} 个问题)"
        else:
            text = f"🤔 关于「{user_input[:40]}」的思考"

        card = {
            "type": "socratic",
            "text": text,
            "status": "pending",
            "metadata": {
                "questions": questions,
                "identified_gaps": result.get("identified_gaps", []),
                "suggested_explorations": result.get("suggested_explorations", []),
                "target_card_id": result.get("target_card_id"),
                "source_input": user_input[:200]
            }
        }

        gap_count = len(result.get("identified_gaps", []))
        message = f"生成 {len(questions)} 个苏格拉底式问题"
        if gap_count:
            message += f"，发现 {gap_count} 个潜在逻辑漏洞"

        return {
            "action": "create_card",
            "card": card,
            "message": message,
            "metadata": {
                "socratic_result": result
            }
        }
