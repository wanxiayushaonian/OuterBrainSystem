"""Research Path Agent for generating research briefs from topic cards."""
from src.agents.base_agent import BaseAgent
from src.core.runtime import CanvasContext, Message
from typing import Dict, Any, List, Optional
import json
import re
import logging

logger = logging.getLogger(__name__)


class ResearchPathAgent(BaseAgent):
    """Agent for generating research path briefs from a topic.

    This agent:
    1. Takes a topic card or theme
    2. Analyzes connected cards and the broader canvas
    3. Generates a structured research path with:
       - Current state of understanding
       - Gaps and blind spots
       - Recommended next steps
       - Suggested reading/references
    """

    @property
    def name(self) -> str:
        return "research_path"

    @property
    def description(self) -> str:
        return "Generates research path briefs — maps current understanding, gaps, and next steps"

    def _build_research_graph(
        self,
        context: CanvasContext,
        topic_card_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Build a research graph centered on the topic card.

        Args:
            context: Canvas context
            topic_card_id: Center card ID

        Returns:
            Dict with graph structure
        """
        # Find topic card
        topic_card = None
        if topic_card_id:
            for card in context.cards:
                if card.get("id") == topic_card_id:
                    topic_card = card
                    break

        # Build connection map
        conn_map: Dict[int, List[Dict]] = {}
        for conn in context.connections:
            from_id = conn.get("from")
            to_id = conn.get("to")
            label = conn.get("label", "relates")

            if from_id not in conn_map:
                conn_map[from_id] = []
            conn_map[from_id].append({"target": to_id, "label": label})

            if to_id not in conn_map:
                conn_map[to_id] = []
            conn_map[to_id].append({"target": from_id, "label": label})

        # BFS from topic card to find related cards (2 hops)
        visited = set()
        related_cards = []
        if topic_card_id:
            queue = [(topic_card_id, 0)]
            visited.add(topic_card_id)
            while queue:
                card_id, depth = queue.pop(0)
                if depth > 2:
                    continue
                for card in context.cards:
                    if card.get("id") == card_id and card_id != topic_card_id:
                        related_cards.append({"card": card, "depth": depth})
                for conn in conn_map.get(card_id, []):
                    if conn["target"] not in visited:
                        visited.add(conn["target"])
                        queue.append((conn["target"], depth + 1))

        # Find conclusion cards for current understanding
        conclusions = [c for c in context.cards if c.get("status") == "conclusion"]

        # Find pending cards for open questions
        pending = [c for c in context.cards if c.get("status") == "pending"]

        return {
            "topic_card": topic_card,
            "related_cards": related_cards[:15],
            "conclusions": conclusions[:10],
            "pending_cards": pending[:10],
            "total_cards": len(context.cards),
            "total_connections": len(context.connections)
        }

    def _build_research_prompt(
        self,
        user_input: str,
        context: CanvasContext,
        session_messages: List[Message],
        topic_card_id: Optional[int] = None
    ) -> str:
        """Build system prompt for research path generation.

        Args:
            user_input: User's input text
            context: Canvas context
            session_messages: Conversation history
            topic_card_id: Topic card to analyze from

        Returns:
            System prompt string
        """
        graph = self._build_research_graph(context, topic_card_id)

        # Topic card description
        topic = graph["topic_card"]
        topic_desc = f"[#{topic['id']}] {topic['text']}" if topic else f"主题: {user_input[:100]}"

        # Related cards
        related_lines = []
        for item in graph["related_cards"]:
            card = item["card"]
            depth = item["depth"]
            prefix = "  " * depth + ("→" if depth > 0 else "●")
            related_lines.append(f"  {prefix} [#{card['id']}] {card['text'][:60]}")
        related_section = "\n".join(related_lines) if related_lines else "  (无直接关联卡片)"

        # Conclusions
        conclusion_lines = []
        for c in graph["conclusions"]:
            conclusion_lines.append(f"  🎯 [#{c['id']}] {c['text'][:60]}")
        conclusions_section = "\n".join(conclusion_lines) if conclusion_lines else "  (尚无结论)"

        # Pending cards
        pending_lines = []
        for p in graph["pending_cards"]:
            pending_lines.append(f"  🟡 [#{p['id']}] {p['text'][:60]}")
        pending_section = "\n".join(pending_lines) if pending_lines else "  (无待处理卡片)"

        return f"""你是一个研究路径规划专家。你的任务是分析一个主题的研究现状，生成结构化的研究路径简报。

## 研究主题
{topic_desc}

## 关联卡片（按距离）
{related_section}

## 已有结论
{conclusions_section}

## 待处理问题
{pending_section}

## 画布统计
- 总卡片: {graph['total_cards']}
- 总连接: {graph['total_connections']}

## 研究路径分析框架

### 1. 当前理解状态
- 已经明确了什么？
- 核心结论是什么？

### 2. 思维盲区
- 哪些角度还没有覆盖？
- 有哪些潜在的假设没有被质疑？
- 缺少什么类型的证据？

### 3. 研究路径建议
- 下一步应该探索什么？
- 优先级排序（紧急/重要）
- 建议的研究方向

### 4. 参考建议
- 需要阅读/了解的关键概念
- 可能的参考框架或理论

## 输出格式
{{
  "topic": "研究主题",
  "current_state": {{
    "summary": "当前理解的一句话总结",
    "key_findings": ["已明确的要点1", "要点2"],
    "confidence_level": 0.6
  }},
  "blind_spots": [
    {{
      "area": "盲区描述",
      "importance": "high|medium|low",
      "suggestion": "如何弥补"
    }}
  ],
  "research_path": [
    {{
      "step": 1,
      "action": "具体行动建议",
      "priority": "high|medium|low",
      "estimated_effort": "1天|1周|..."
    }}
  ],
  "references": [
    {{
      "topic": "需要了解的概念/理论",
      "reason": "为什么重要"
    }}
  ]
}}

请生成一份结构化的研究路径简报。"""

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
            "topic": user_input[:100],
            "current_state": {
                "summary": "需要进一步分析",
                "key_findings": [],
                "confidence_level": 0.3
            },
            "blind_spots": [],
            "research_path": [],
            "references": []
        }

    async def process(
        self,
        user_input: str,
        context: CanvasContext,
        session_messages: List[Message],
        card_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Process research path generation.

        Args:
            user_input: User's input text
            context: Canvas context
            session_messages: Conversation history
            card_id: Topic card ID

        Returns:
            Dict with research path brief
        """
        logger.info(f"Research path agent processing: {user_input[:50]}...")

        system_prompt = self._build_research_prompt(
            user_input, context, session_messages, card_id
        )
        response = await self._call_llm(system_prompt, user_input, context)
        result = self._parse_llm_response(response, user_input)

        # Build research path card
        topic = result.get("topic", user_input[:50])
        blind_spot_count = len(result.get("blind_spots", []))
        step_count = len(result.get("research_path", []))
        confidence = result.get("current_state", {}).get("confidence_level", 0)

        text = f"🗺️ 研究路径: {topic[:40]}{'...' if len(topic) > 40 else ''}"

        card = {
            "type": "note",
            "text": text,
            "status": "pending",
            "metadata": {
                "research_path_type": "research_brief",
                "topic": topic,
                "current_state": result.get("current_state", {}),
                "blind_spots": result.get("blind_spots", []),
                "research_path": result.get("research_path", []),
                "references": result.get("references", []),
                "source_card_id": card_id
            }
        }

        message = f"研究路径简报: 理解度 {confidence:.0%}"
        if blind_spot_count:
            message += f", {blind_spot_count} 个盲区"
        if step_count:
            message += f", {step_count} 个建议步骤"

        return {
            "action": "create_card",
            "card": card,
            "message": message,
            "metadata": {
                "research_result": result,
                "source_card_id": card_id
            }
        }
