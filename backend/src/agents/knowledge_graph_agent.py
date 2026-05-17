# ═══════════════════════════════════════════════════════
# Knowledge Graph Agent — Entity and Relation Extraction
# ═══════════════════════════════════════════════════════
from __future__ import annotations

import json
import logging
from typing import Any

from src.llm.client import chat_json

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """你是一个知识图谱提取专家。你的任务是从卡片文本中提取实体和关系。

## 实体类型
- concept: 概念、想法、理论
- person: 人物
- theory: 理论、学说
- tool: 工具、方法、技术
- method: 方法论、流程
- event: 事件、现象

## 关系类型
- is_a: 是一种（A 是 B 的一种）
- part_of: 属于（A 是 B 的一部分）
- causes: 导致（A 导致 B）
- uses: 使用（A 使用 B）
- related_to: 相关（A 和 B 相关）
- contradicts: 矛盾（A 和 B 矛盾）

## 输出格式
返回 JSON 对象：
{
  "entities": [
    {
      "name": "实体名称",
      "entity_type": "concept",
      "description": "简短描述",
      "card_ids": [1, 2]
    }
  ],
  "relations": [
    {
      "source_name": "源实体名称",
      "target_name": "目标实体名称",
      "relation_type": "related_to",
      "confidence": 0.8,
      "evidence": "为什么存在这个关系"
    }
  ]
}

## 要求
1. 提取 5-15 个最重要的实体
2. 提取实体之间有意义的关系
3. 每个实体必须关联到至少一个卡片 ID
4. 关系的 confidence 在 0.6-1.0 之间
5. 实体名称应该简洁明了
6. 只提取明确存在的实体，不要推测"""


class KnowledgeGraphAgent:
    """Agent for extracting entities and relations from cards."""

    def extract(self, cards: list[dict[str, Any]]) -> dict[str, Any]:
        """Extract entities and relations from cards.

        Args:
            cards: List of card dicts with id, text, etc.

        Returns:
            Dict with entities and relations lists
        """
        if not cards:
            return {"entities": [], "relations": []}

        # Build card list for prompt
        card_lines = []
        for card in cards[:30]:  # Limit to 30 cards
            card_lines.append(f"[#{card['id']}] {card.get('text', '')[:150]}")
        cards_section = "\n".join(card_lines)

        user_prompt = f"""请从以下卡片中提取实体和关系：

{cards_section}

请返回 JSON 格式的知识图谱数据。"""

        try:
            result = chat_json(
                system=SYSTEM_PROMPT,
                user=user_prompt,
                max_tokens=4000,
                temperature=0.3,
            )
        except Exception as e:
            logger.error("Knowledge graph extraction failed: %s", e)
            return {"entities": [], "relations": [], "error": str(e)}

        # Process entities
        entities = []
        entity_name_map: dict[str, int] = {}  # name -> temp id
        for i, ent in enumerate(result.get("entities", [])):
            name = ent.get("name", "").strip()
            if not name:
                continue
            entity_name_map[name] = i
            entities.append({
                "id": i,
                "name": name,
                "entity_type": ent.get("entity_type", "concept"),
                "description": ent.get("description", ""),
                "card_ids": ent.get("card_ids", []),
            })

        # Process relations
        relations = []
        for rel in result.get("relations", []):
            src_name = rel.get("source_name", "").strip()
            tgt_name = rel.get("target_name", "").strip()
            if src_name not in entity_name_map or tgt_name not in entity_name_map:
                continue
            relations.append({
                "source_id": entity_name_map[src_name],
                "target_id": entity_name_map[tgt_name],
                "relation_type": rel.get("relation_type", "related_to"),
                "confidence": min(1.0, max(0.6, rel.get("confidence", 0.8))),
                "evidence": rel.get("evidence", ""),
            })

        logger.info("Extracted %d entities, %d relations from %d cards", len(entities), len(relations), len(cards))
        return {"entities": entities, "relations": relations}
