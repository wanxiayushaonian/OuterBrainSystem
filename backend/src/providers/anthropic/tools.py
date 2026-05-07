"""Anthropic provider tools for canvas manipulation."""
from typing import Dict, Any, List
from src.core.tools import Tool


class AddCardTool(Tool):
    """Tool for adding cards to canvas."""

    @property
    def name(self) -> str:
        return "add_card"

    @property
    def description(self) -> str:
        return "在画布上创建新卡片。卡片是思维碎片的基本单元。"

    @property
    def schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "卡片内容文本"
                },
                "source": {
                    "type": "string",
                    "description": "卡片来源标签（如：浏览器、笔记、终端等）"
                },
                "x": {
                    "type": "number",
                    "description": "X坐标位置（可选，默认自动布局）"
                },
                "y": {
                    "type": "number",
                    "description": "Y坐标位置（可选，默认自动布局）"
                }
            },
            "required": ["text", "source"]
        }

    async def execute(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> int:
        canvas_context = context.get("context")
        if not canvas_context:
            raise ValueError("Canvas context not provided")

        existing_ids = [c["id"] for c in canvas_context.cards]
        new_id = max(existing_ids) + 1 if existing_ids else 1

        card = {
            "id": new_id,
            "text": arguments["text"],
            "source": arguments["source"],
            "x": arguments.get("x", 0),
            "y": arguments.get("y", 0),
            "inCanvas": True,
            "status": "",
            "time": ""
        }
        canvas_context.cards.append(card)
        return new_id


class EditCardTool(Tool):
    """Tool for editing card content."""

    @property
    def name(self) -> str:
        return "edit_card"

    @property
    def description(self) -> str:
        return "修改已有卡片的内容或状态。"

    @property
    def schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "card_id": {
                    "type": "integer",
                    "description": "要修改的卡片ID"
                },
                "text": {
                    "type": "string",
                    "description": "新的卡片内容（可选）"
                },
                "status": {
                    "type": "string",
                    "enum": ["", "pending", "verified", "conclusion"],
                    "description": "新的状态（可选）：空字符串=无状态, pending=待验证, verified=已验证, conclusion=结论"
                }
            },
            "required": ["card_id"]
        }

    async def execute(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        canvas_context = context.get("context")
        if not canvas_context:
            raise ValueError("Canvas context not provided")

        card_id = arguments["card_id"]
        card = next((c for c in canvas_context.cards if c["id"] == card_id), None)
        if not card:
            raise ValueError(f"Card #{card_id} not found")

        if "text" in arguments:
            card["text"] = arguments["text"]
        if "status" in arguments:
            card["status"] = arguments["status"]

        return {"id": card_id, "text": card["text"], "status": card["status"], "success": True}


class DeleteCardTool(Tool):
    """Tool for deleting cards."""

    @property
    def name(self) -> str:
        return "delete_card"

    @property
    def description(self) -> str:
        return "删除画布上的卡片及其所有连接。"

    @property
    def schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "card_id": {
                    "type": "integer",
                    "description": "要删除的卡片ID"
                }
            },
            "required": ["card_id"]
        }

    async def execute(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        canvas_context = context.get("context")
        if not canvas_context:
            raise ValueError("Canvas context not provided")

        card_id = arguments["card_id"]
        card = next((c for c in canvas_context.cards if c["id"] == card_id), None)
        if not card:
            raise ValueError(f"Card #{card_id} not found")

        # Remove card
        canvas_context.cards = [c for c in canvas_context.cards if c["id"] != card_id]

        # Remove related connections
        removed_connections = [
            conn for conn in canvas_context.connections
            if conn["from"] == card_id or conn["to"] == card_id
        ]
        canvas_context.connections = [
            conn for conn in canvas_context.connections
            if conn["from"] != card_id and conn["to"] != card_id
        ]

        return {
            "id": card_id,
            "removed_connections": len(removed_connections),
            "success": True
        }


class MoveCardTool(Tool):
    """Tool for moving card position."""

    @property
    def name(self) -> str:
        return "move_card"

    @property
    def description(self) -> str:
        return "移动卡片到新位置。"

    @property
    def schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "card_id": {
                    "type": "integer",
                    "description": "要移动的卡片ID"
                },
                "x": {
                    "type": "number",
                    "description": "新的X坐标"
                },
                "y": {
                    "type": "number",
                    "description": "新的Y坐标"
                }
            },
            "required": ["card_id", "x", "y"]
        }

    async def execute(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        canvas_context = context.get("context")
        if not canvas_context:
            raise ValueError("Canvas context not provided")

        card_id = arguments["card_id"]
        card = next((c for c in canvas_context.cards if c["id"] == card_id), None)
        if not card:
            raise ValueError(f"Card #{card_id} not found")

        card["x"] = arguments["x"]
        card["y"] = arguments["y"]

        return {"id": card_id, "x": card["x"], "y": card["y"], "success": True}


class AddConnectionTool(Tool):
    """Tool for creating connections between cards."""

    @property
    def name(self) -> str:
        return "add_connection"

    @property
    def description(self) -> str:
        return "在两张卡片之间创建连接关系。连接表示卡片之间的逻辑关系。"

    @property
    def schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "from": {
                    "type": "integer",
                    "description": "起始卡片ID"
                },
                "to": {
                    "type": "integer",
                    "description": "目标卡片ID"
                },
                "label": {
                    "type": "string",
                    "description": "连接关系类型（必须从系统提供的可用关系类型中选择）"
                }
            },
            "required": ["from", "to", "label"]
        }

    async def execute(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        canvas_context = context.get("context")
        if not canvas_context:
            raise ValueError("Canvas context not provided")

        from_id = arguments["from"]
        to_id = arguments["to"]
        label = arguments["label"]

        card_ids = {c["id"] for c in canvas_context.cards}
        if from_id not in card_ids:
            raise ValueError(f"Card #{from_id} not found")
        if to_id not in card_ids:
            raise ValueError(f"Card #{to_id} not found")

        if label not in canvas_context.active_labels:
            raise ValueError(
                f"Invalid label '{label}'. Available: {', '.join(canvas_context.active_labels)}"
            )

        connection = {"from": from_id, "to": to_id, "label": label}
        canvas_context.connections.append(connection)

        return {"from": from_id, "to": to_id, "label": label, "success": True}


class DeleteConnectionTool(Tool):
    """Tool for deleting connections."""

    @property
    def name(self) -> str:
        return "delete_connection"

    @property
    def description(self) -> str:
        return "删除两张卡片之间的连接。"

    @property
    def schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "from": {
                    "type": "integer",
                    "description": "起始卡片ID"
                },
                "to": {
                    "type": "integer",
                    "description": "目标卡片ID"
                }
            },
            "required": ["from", "to"]
        }

    async def execute(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        canvas_context = context.get("context")
        if not canvas_context:
            raise ValueError("Canvas context not provided")

        from_id = arguments["from"]
        to_id = arguments["to"]

        original_count = len(canvas_context.connections)
        canvas_context.connections = [
            c for c in canvas_context.connections
            if not (c["from"] == from_id and c["to"] == to_id)
        ]
        removed = original_count - len(canvas_context.connections)

        if removed == 0:
            raise ValueError(f"No connection found from #{from_id} to #{to_id}")

        return {"from": from_id, "to": to_id, "removed": removed, "success": True}


class SearchCardsTool(Tool):
    """Tool for searching cards."""

    @property
    def name(self) -> str:
        return "search_cards"

    @property
    def description(self) -> str:
        return "搜索画布上的卡片内容，返回匹配的卡片列表。"

    @property
    def schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索关键词"
                },
                "status": {
                    "type": "string",
                    "enum": ["", "pending", "verified", "conclusion"],
                    "description": "按状态过滤（可选）"
                }
            },
            "required": ["query"]
        }

    async def execute(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> List[Dict[str, Any]]:
        canvas_context = context.get("context")
        if not canvas_context:
            raise ValueError("Canvas context not provided")

        query = arguments["query"].lower()
        status_filter = arguments.get("status")

        results = []
        for card in canvas_context.cards:
            if query in card.get("text", "").lower():
                if status_filter is None or card.get("status") == status_filter:
                    results.append({
                        "id": card["id"],
                        "text": card["text"],
                        "status": card.get("status", ""),
                        "source": card.get("source", "")
                    })

        return results


class AnalyzeCanvasTool(Tool):
    """Tool for analyzing canvas structure."""

    @property
    def name(self) -> str:
        return "analyze_canvas"

    @property
    def description(self) -> str:
        return "分析画布结构，找出孤立卡片、薄弱环节和逻辑缺口。"

    @property
    def schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {},
            "required": []
        }

    async def execute(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        canvas_context = context.get("context")
        if not canvas_context:
            raise ValueError("Canvas context not provided")

        cards = canvas_context.cards
        connections = canvas_context.connections

        # Find isolated cards (no connections)
        connected_ids = set()
        for conn in connections:
            connected_ids.add(conn["from"])
            connected_ids.add(conn["to"])

        isolated = [c for c in cards if c["id"] not in connected_ids]

        # Find cards with most connections (hub cards)
        connection_count: Dict[int, int] = {}
        for conn in connections:
            connection_count[conn["from"]] = connection_count.get(conn["from"], 0) + 1
            connection_count[conn["to"]] = connection_count.get(conn["to"], 0) + 1

        hub_cards = sorted(
            [(cid, count) for cid, count in connection_count.items()],
            key=lambda x: x[1],
            reverse=True
        )[:5]

        # Status distribution
        status_dist = {}
        for card in cards:
            s = card.get("status", "") or "none"
            status_dist[s] = status_dist.get(s, 0) + 1

        # Find weak points: cards with status "pending" that have few connections
        weak_points = []
        for card in cards:
            if card.get("status") == "pending":
                count = connection_count.get(card["id"], 0)
                if count < 2:
                    weak_points.append({"id": card["id"], "text": card["text"], "connections": count})

        return {
            "total_cards": len(cards),
            "total_connections": len(connections),
            "isolated_cards": [{"id": c["id"], "text": c["text"]} for c in isolated],
            "hub_cards": [{"id": cid, "connections": count} for cid, count in hub_cards],
            "status_distribution": status_dist,
            "weak_points": weak_points,
            "suggestions": _generate_suggestions(cards, connections, isolated, weak_points)
        }


def _generate_suggestions(cards, connections, isolated, weak_points) -> List[str]:
    """Generate improvement suggestions based on canvas analysis."""
    suggestions = []

    if isolated:
        suggestions.append(f"有 {len(isolated)} 张孤立卡片，考虑将它们与其他卡片建立连接。")

    if weak_points:
        suggestions.append(f"有 {len(weak_points)} 张待验证卡片缺少支撑，需要更多证据。")

    conclusion_cards = [c for c in cards if c.get("status") == "conclusion"]
    if not conclusion_cards and len(cards) > 3:
        suggestions.append("画布中还没有结论卡片，考虑在充分论证后标记结论。")

    if len(connections) < len(cards) * 0.5:
        suggestions.append("连接密度较低，卡片之间的逻辑关系可能不够清晰。")

    return suggestions


class GetCardDetailTool(Tool):
    """Tool for getting full card details (for peripheral cards)."""

    @property
    def name(self) -> str:
        return "get_card_detail"

    @property
    def description(self) -> str:
        return "获取卡片的完整内容（包括 text 和 metadata）。用于加载外围区域的卡片详情。"

    @property
    def schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "card_id": {
                    "type": "integer",
                    "description": "要获取的卡片ID"
                }
            },
            "required": ["card_id"]
        }

    async def execute(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        canvas_context = context.get("context")
        if not canvas_context:
            raise ValueError("Canvas context not provided")

        card_id = arguments["card_id"]

        # Check if card is in core region (already loaded)
        for card in canvas_context.cards:
            if card["id"] == card_id:
                return card

        # Card not in core region - it's in peripheral region
        # In current implementation, peripheral cards are not accessible
        # This will be enhanced in future when we store full state
        return {
            "error": f"Card #{card_id} is in peripheral region and not currently loaded. "
                     "Please ask user to navigate to that card in the canvas."
        }
