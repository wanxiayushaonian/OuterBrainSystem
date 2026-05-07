"""Context Manager for hybrid loading strategy."""
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any
from src.core.context_types import HybridCanvasContext, CardIndex


class ContextManager:
    """Manages canvas context with hybrid loading strategy.

    Core region: Recent cards, conclusions, viewport cards (full content)
    Peripheral region: Other cards (index only)
    """

    def _normalize_card(self, card: Dict) -> Dict:
        """Normalize card to include type and metadata for backward compatibility."""
        if "type" not in card:
            card["type"] = "note"
        if "metadata" not in card:
            card["metadata"] = {}
        return card

    def _filter_recent_cards(self, cards: List[Dict], hours: int) -> List[Dict]:
        """Filter cards modified in last N hours."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        recent = []

        for card in cards:
            updated_at_str = card.get("updated_at")
            if updated_at_str:
                try:
                    updated_at = datetime.fromisoformat(updated_at_str)
                    if updated_at.tzinfo is None:
                        updated_at = updated_at.replace(tzinfo=timezone.utc)
                    if updated_at > cutoff:
                        recent.append(card)
                except (ValueError, TypeError):
                    # Skip cards with invalid timestamps
                    continue

        return recent

    def _filter_by_status(self, cards: List[Dict], status: str) -> List[Dict]:
        """Filter cards by status."""
        return [c for c in cards if c.get("status") == status]

    def _deduplicate_and_limit(self, cards: List[Dict], limit: int) -> List[Dict]:
        """Deduplicate cards by ID and limit count."""
        seen_ids = set()
        result = []

        for card in cards:
            card_id = card.get("id")
            if card_id not in seen_ids:
                seen_ids.add(card_id)
                result.append(card)
                if len(result) >= limit:
                    break

        return result

    def _create_card_index(self, card: Dict) -> CardIndex:
        """Create lightweight card index from full card."""
        return CardIndex(
            id=card.get("id", 0),
            title=card.get("text", "")[:100],  # Truncate to 100 chars
            status=card.get("status", "")
        )

    def load_context_from_state(
        self,
        state: Dict[str, Any],
        viewport: Dict[str, Any]
    ) -> HybridCanvasContext:
        """Load canvas context from space state with hybrid strategy.

        Args:
            state: Space state dict with cards, connections, groups
            viewport: Frontend viewport info (x, y, width, height)

        Returns:
            HybridCanvasContext with core and peripheral cards
        """
        cards = state.get("cards", [])

        # Normalize cards for backward compatibility
        cards = [self._normalize_card(c) for c in cards]

        # 1. Load core cards (full content)
        recent = self._filter_recent_cards(cards, hours=1)
        conclusions = self._filter_by_status(cards, "conclusion")

        # TODO: Add viewport filtering when viewport data is available
        # viewport_cards = self._filter_by_viewport(cards, viewport)

        # Combine and deduplicate
        core_cards = self._deduplicate_and_limit(
            recent + conclusions,
            limit=50
        )

        # 2. Load peripheral cards (index only)
        core_ids = {c.get("id") for c in core_cards if c.get("id") is not None}
        peripheral_cards = [
            self._create_card_index(c)
            for c in cards
            if c.get("id") is not None and c["id"] not in core_ids
        ]

        # 3. Load connections and groups
        connections = state.get("connections", [])
        groups = state.get("groups", [])

        # 4. Load active labels from state (with defaults)
        active_labels = state.get("active_labels", [
            "supports", "contradicts", "extends", "questions", "relates"
        ])

        return HybridCanvasContext(
            core_cards=core_cards,
            peripheral_cards=peripheral_cards,
            connections=connections,
            groups=groups,
            active_labels=active_labels,
            total_cards=len(cards),
            last_updated=datetime.now(timezone.utc)
        )
