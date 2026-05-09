"""Flow Analyzer Agent for analyzing thought process structure."""
from src.agents.base_agent import BaseAgent
from src.core.runtime import CanvasContext, Message
from typing import Dict, Any, List
import json
import re
import logging

logger = logging.getLogger(__name__)


class FlowAnalyzerAgent(BaseAgent):
    """Agent for analyzing the structure and flow of thinking on the canvas.

    This agent:
    1. Maps the connections and relationships between cards
    2. Identifies patterns (chains, clusters, orphans)
    3. Detects bottlenecks and gaps in reasoning
    4. Suggests improvements to the thought structure
    """

    @property
    def name(self) -> str:
        return "flow_analysis"

    @property
    def description(self) -> str:
        return "Analyzes thought process structure, identifies patterns and bottlenecks"

    def _build_connection_map(self, context: CanvasContext) -> Dict[int, List[Dict]]:
        """Build a map of card connections.

        Args:
            context: Canvas context

        Returns:
            Dict mapping card_id to list of connections
        """
        conn_map: Dict[int, List[Dict]] = {}
        for conn in context.connections:
            from_id = conn.get("from")
            to_id = conn.get("to")
            label = conn.get("label", "relates")

            if from_id not in conn_map:
                conn_map[from_id] = []
            conn_map[from_id].append({"target": to_id, "direction": "outgoing", "label": label})

            if to_id not in conn_map:
                conn_map[to_id] = []
            conn_map[to_id].append({"target": from_id, "direction": "incoming", "label": label})

        return conn_map

    def _find_orphan_cards(self, context: CanvasContext, conn_map: Dict[int, List[Dict]]) -> List[int]:
        """Find cards with no connections.

        Args:
            context: Canvas context
            conn_map: Connection map

        Returns:
            List of orphan card IDs
        """
        orphan_ids = []
        for card in context.cards:
            card_id = card.get("id")
            if card_id not in conn_map or len(conn_map[card_id]) == 0:
                orphan_ids.append(card_id)
        return orphan_ids

    def _find_bottleneck_cards(self, conn_map: Dict[int, List[Dict]], threshold: int = 4) -> List[int]:
        """Find cards with unusually many connections (bottlenecks).

        Args:
            conn_map: Connection map
            threshold: Minimum connections to be considered a bottleneck

        Returns:
            List of bottleneck card IDs
        """
        bottlenecks = []
        for card_id, connections in conn_map.items():
            if len(connections) >= threshold:
                bottlenecks.append(card_id)
        return bottlenecks

    def _build_flow_prompt(
        self,
        user_input: str,
        context: CanvasContext,
        session_messages: List[Message]
    ) -> str:
        """Build system prompt for flow analysis.

        Args:
            user_input: User's input text
            context: Canvas context
            session_messages: Conversation history

        Returns:
            System prompt string
        """
        # Build connection map
        conn_map = self._build_connection_map(context)
        orphan_ids = self._find_orphan_cards(context, conn_map)
        bottleneck_ids = self._find_bottleneck_cards(conn_map)

        # Card summary with connections
        card_lines = []
        for card in context.cards[:30]:
            card_id = card.get("id")
            status = card.get("status", "")
            icon = {"pending": "🟡", "verified": "✅", "conclusion": "🎯"}.get(status, "⚪")
            conn_count = len(conn_map.get(card_id, []))
            conn_info = f" [{conn_count}条连接]" if conn_count > 0 else " [孤立]"
            card_lines.append(f"  {icon} #{card_id}: {card['text'][:60]}{conn_info}")
        cards_section = "\n".join(card_lines) if card_lines else "  (空)"

        # Connection summary
        conn_lines = []
        for conn in context.connections[:30]:
            conn_lines.append(f"  #{conn['from']} --[{conn.get('label', 'relates')}]--> #{conn['to']}")
        connections_section = "\n".join(conn_lines) if conn_lines else "  (无连接)"

        # Structural issues
        issues = []
        if orphan_ids:
            issues.append(f"孤立卡片 ({len(orphan_ids)} 张): {orphan_ids[:5]}")
        if bottleneck_ids:
            issues.append(f"枢纽卡片 ({len(bottleneck_ids)} 张): {bottleneck_ids[:5]}")
        if len(context.connections) == 0 and len(context.cards) > 3:
            issues.append("卡片之间没有建立连接")
        issues_section = "\n".join(f"  - {i}" for i in issues) if issues else "  未检测到明显结构问题"

        return f"""你是一个思维结构分析专家。你的任务是分析画布上卡片之间的关系和思维流程。

## 画布卡片
{cards_section}

## 连接关系
{connections_section}

## 检测到的结构问题
{issues_section}

## 分析维度
请从以下角度分析思维结构：

1. **流程完整性**
   - 思维链是否有清晰的起点和终点？
   - 是否有断裂的环节？

2. **逻辑结构**
   - 因果关系是否清晰？
   - 是否存在循环论证？

3. **覆盖度**
   - 是否有被忽略的角度？
   - 孤立的卡片是否应该建立连接？

4. **瓶颈识别**
   - 是否有过多连接的枢纽卡片？
   - 是否需要拆分或重组？

5. **优化建议**
   - 如何改善思维结构？
   - 缺少哪些类型的连接？

## 输出格式
{{
  "structure_type": "chain|tree|network|cluster|fragmented",
  "completeness_score": 0.7,
  "analysis": {{
    "flow_description": "思维流程的整体描述",
    "strengths": ["优势1", "优势2"],
    "weaknesses": ["弱点1", "弱点2"]
  }},
  "identified_issues": [
    {{
      "type": "orphan|bottleneck|gap|cycle|dead_end",
      "description": "具体问题描述",
      "affected_cards": [1, 2],
      "severity": "low|medium|high"
    }}
  ],
  "suggestions": [
    {{
      "action": "connect|split|merge|add_card|remove_card",
      "description": "建议的具体操作",
      "target_cards": [1, 2],
      "priority": "low|medium|high"
    }}
  ]
}}

请分析画布上的思维结构，给出诊断和改进建议。"""

    def _parse_llm_response(self, response: str, context: CanvasContext) -> Dict[str, Any]:
        """Parse LLM JSON response with fallback.

        Args:
            response: LLM response text
            context: Canvas context (for fallback)

        Returns:
            Parsed flow analysis data
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
            card_count = len(context.cards)
            conn_count = len(context.connections)
            result = {
                "structure_type": "fragmented" if conn_count < card_count // 2 else "network",
                "completeness_score": 0.5,
                "analysis": {
                    "flow_description": f"画布包含 {card_count} 张卡片和 {conn_count} 条连接",
                    "strengths": [],
                    "weaknesses": ["无法自动分析，请手动检查"]
                },
                "identified_issues": [],
                "suggestions": []
            }

        return result

    async def process(
        self,
        user_input: str,
        context: CanvasContext,
        session_messages: List[Message]
    ) -> Dict[str, Any]:
        """Process flow analysis request.

        Args:
            user_input: User's input text
            context: Canvas context
            session_messages: Conversation history

        Returns:
            Dict with action="create_card" and flow analysis card data
        """
        logger.info(f"Flow analyzer agent processing: {user_input[:50]}...")

        system_prompt = self._build_flow_prompt(user_input, context, session_messages)
        response = await self._call_llm(system_prompt, user_input, context)
        result = self._parse_llm_response(response, context)

        # Build analysis summary for card text
        structure_type = result.get("structure_type", "unknown")
        structure_icons = {
            "chain": "🔗", "tree": "🌳", "network": "🕸️",
            "cluster": "📦", "fragmented": "🧩"
        }
        icon = structure_icons.get(structure_type, "📊")

        score = result.get("completeness_score", 0)
        issue_count = len(result.get("identified_issues", []))
        suggestion_count = len(result.get("suggestions", []))

        text = f"{icon} 思维结构分析: {structure_type}"
        if score > 0:
            text += f" (完整度: {score:.0%})"

        card = {
            "type": "flow_analysis",
            "text": text,
            "status": "pending",
            "metadata": {
                "structure_type": structure_type,
                "completeness_score": score,
                "analysis": result.get("analysis", {}),
                "identified_issues": result.get("identified_issues", []),
                "suggestions": result.get("suggestions", []),
                "card_count": len(context.cards),
                "connection_count": len(context.connections)
            }
        }

        message = f"分析完成: 思维结构为 {structure_type} 类型"
        if issue_count:
            message += f"，发现 {issue_count} 个问题"
        if suggestion_count:
            message += f"，提出 {suggestion_count} 条建议"

        return {
            "action": "create_card",
            "card": card,
            "message": message,
            "metadata": {
                "flow_result": result
            }
        }
