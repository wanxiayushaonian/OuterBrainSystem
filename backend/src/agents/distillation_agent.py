"""Distillation Agent for extracting key insights from conversations."""
from src.agents.base_agent import BaseAgent
from src.core.runtime import CanvasContext, Message
from typing import Dict, Any, List
import json
import re
import logging

logger = logging.getLogger(__name__)


class DistillationAgent(BaseAgent):
    """Agent for distilling conversation content into concise cards with keywords.

    This agent:
    1. Extracts core insights from conversation
    2. Identifies 3-5 key keywords
    3. Recommends related keywords from existing canvas cards
    4. Generates a distillation card with structured metadata
    """

    @property
    def name(self) -> str:
        return "distillation"

    @property
    def description(self) -> str:
        return "Distills conversation content into concise cards with keywords"

    def _extract_keywords_from_canvas(self, context: CanvasContext) -> List[str]:
        """Extract existing keywords from canvas cards.

        Args:
            context: Canvas context

        Returns:
            List of unique keywords from existing cards
        """
        keywords = set()
        for card in context.cards:
            metadata = card.get("metadata", {})
            if "extracted_keywords" in metadata:
                keywords.update(metadata["extracted_keywords"])
            if "user_selected_keywords" in metadata:
                keywords.update(metadata["user_selected_keywords"])
        return list(keywords)

    def _build_distillation_prompt(
        self,
        user_input: str,
        context: CanvasContext,
        session_messages: List[Message]
    ) -> str:
        """Build system prompt for distillation.

        Args:
            user_input: User's input text
            context: Canvas context
            session_messages: Conversation history

        Returns:
            System prompt string
        """
        # Get recent conversation (last 10 messages)
        recent_messages = session_messages[-10:] if len(session_messages) > 10 else session_messages
        conversation = "\n".join([
            f"{msg.role}: {msg.content}"
            for msg in recent_messages
            if msg.content
        ])

        # Get existing keywords from canvas
        existing_keywords = self._extract_keywords_from_canvas(context)
        keywords_section = ", ".join(existing_keywords[:20]) if existing_keywords else "无"

        return f"""你是一个内容提炼专家。你的任务是将对话内容提炼为精华卡片。

## 当前对话历史
{conversation}

## 画布已有关键词
{keywords_section}

## 提炼要求
1. 提取核心观点，压缩为 1-2 句话的标题（不超过 50 字）
2. 识别 3-5 个关键词（优先使用画布已有关键词）
3. 从画布已有关键词中推荐相关的（如果有）
4. 输出 JSON 格式

## 输出格式
{{
  "title": "压缩后的核心观点",
  "original_text": "原始完整文本（保留关键信息）",
  "extracted_keywords": ["关键词1", "关键词2", "关键词3"],
  "recommended_keywords": ["画布已有关键词A", "画布已有关键词B"],
  "reasoning": "提炼理由（为什么选择这些关键词）"
}}

## 注意事项
- 标题要简洁有力，突出核心观点
- 关键词要具体、有代表性
- 优先复用画布已有关键词，保持一致性
- reasoning 要说明提炼的逻辑

请提炼用户的输入内容。"""

    def _parse_llm_response(self, response: str, user_input: str) -> Dict[str, Any]:
        """Parse LLM JSON response with fallback.

        Args:
            response: LLM response text
            user_input: Original user input (for fallback)

        Returns:
            Parsed distillation data
        """
        try:
            # Try direct JSON parse
            distilled = json.loads(response)
        except json.JSONDecodeError:
            # Try extracting JSON from markdown code block
            json_match = re.search(r'```json\n(.*?)\n```', response, re.DOTALL)
            if json_match:
                try:
                    distilled = json.loads(json_match.group(1))
                except json.JSONDecodeError:
                    distilled = None
            else:
                distilled = None

        # Fallback if parsing failed
        if not distilled:
            logger.warning("Failed to parse LLM response, using fallback")
            distilled = {
                "title": user_input[:50] + ("..." if len(user_input) > 50 else ""),
                "original_text": user_input,
                "extracted_keywords": [],
                "recommended_keywords": [],
                "reasoning": "Failed to parse LLM response"
            }

        return distilled

    async def process(
        self,
        user_input: str,
        context: CanvasContext,
        session_messages: List[Message]
    ) -> Dict[str, Any]:
        """Process distillation request.

        Args:
            user_input: User's input text
            context: Canvas context
            session_messages: Conversation history

        Returns:
            Dict with action="create_card" and distillation card data
        """
        logger.info(f"Distillation agent processing: {user_input[:50]}...")

        # Build system prompt
        system_prompt = self._build_distillation_prompt(
            user_input, context, session_messages
        )

        # Call LLM
        response = await self._call_llm(system_prompt, user_input, context)

        # Parse response
        distilled = self._parse_llm_response(response, user_input)

        # Build distillation card
        card = {
            "type": "distillation",
            "text": distilled["title"],
            "status": "pending",
            "metadata": {
                "original_text": distilled["original_text"],
                "extracted_keywords": distilled["extracted_keywords"],
                "recommended_keywords": distilled.get("recommended_keywords", []),
                "user_selected_keywords": [],
                "reasoning": distilled.get("reasoning", "")
            }
        }

        keyword_count = len(distilled["extracted_keywords"])
        message = f"已提炼内容，提取 {keyword_count} 个关键词"

        if distilled.get("recommended_keywords"):
            rec_count = len(distilled["recommended_keywords"])
            message += f"，推荐 {rec_count} 个已有关键词"

        return {
            "action": "create_card",
            "card": card,
            "message": message,
            "metadata": {
                "distilled": distilled
            }
        }
