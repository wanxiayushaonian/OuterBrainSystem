# Agent Architecture Phase 1: Context Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Context Manager with hybrid loading strategy to solve canvas state bloat problem

**Architecture:** Create a new ContextManager class that loads core cards (recent, conclusions, viewport) fully and peripheral cards as index-only. Add get_card_detail tool for on-demand loading.

**Tech Stack:** Python 3.12, FastAPI, SQLite, Pydantic

**Estimated Time:** 2 weeks

---

## File Structure

### New Files
- `backend/src/core/context_manager.py` - Context Manager implementation
- `backend/src/core/context_types.py` - CanvasContext and CardIndex data classes
- `tests/test_context_manager.py` - Context Manager tests

### Modified Files
- `backend/src/api/chat.py` - Integrate Context Manager
- `backend/src/providers/anthropic/tools.py` - Add get_card_detail tool
- `backend/src/providers/anthropic/runtime.py` - Update system prompt generation
- `backend/src/db/router.py` - Add database queries for context loading

---

## Task 1: Database Schema Extension

**Files:**
- Modify: `backend/src/db/router.py`
- Test: Manual verification with SQLite

- [ ] **Step 1: Add database indexes**

Run migration:
```sql
CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at);
CREATE INDEX IF NOT EXISTS idx_cards_updated_at ON cards(updated_at);
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
```

- [ ] **Step 2: Verify indexes exist**

Run: `sqlite3 backend/data/nexus.db ".indexes cards"`
Expected: See idx_cards_created_at, idx_cards_updated_at, idx_cards_status

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/
git commit -m "feat(db): add indexes for context manager queries"
```

---

## Task 2: Context Data Types

**Files:**
- Create: `backend/src/core/context_types.py`
- Test: `tests/test_context_types.py`

- [ ] **Step 1: Write test for CardIndex**

```python
# tests/test_context_types.py
def test_card_index_creation():
    index = CardIndex(id=1, title="Test", status="pending")
    assert index.id == 1
    assert index.title == "Test"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_context_types.py -v`
Expected: FAIL with "CardIndex not defined"

- [ ] **Step 3: Implement CardIndex dataclass**

```python
# backend/src/core/context_types.py
from dataclasses import dataclass
from typing import List, Dict, Any
from datetime import datetime

@dataclass
class CardIndex:
    """Lightweight card index for peripheral region."""
    id: int
    title: str
    status: str
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_context_types.py::test_card_index_creation -v`
Expected: PASS

- [ ] **Step 5: Write test for CanvasContext**

```python
def test_canvas_context_creation():
    ctx = CanvasContext(
        core_cards=[],
        peripheral_cards=[],
        connections=[],
        groups=[],
        active_labels=["supports", "contradicts"],
        total_cards=0,
        last_updated=datetime.now()
    )
    assert len(ctx.core_cards) == 0
    assert len(ctx.active_labels) == 2
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_context_types.py::test_canvas_context_creation -v`
Expected: FAIL

- [ ] **Step 7: Implement CanvasContext dataclass**

```python
@dataclass
class CanvasContext:
    """Canvas context with hybrid loading."""
    core_cards: List[Dict[str, Any]]
    peripheral_cards: List[CardIndex]
    connections: List[Dict[str, Any]]
    groups: List[Dict[str, Any]]
    active_labels: List[str]
    total_cards: int
    last_updated: datetime
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_context_types.py -v`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add backend/src/core/context_types.py tests/test_context_types.py
git commit -m "feat(core): add CanvasContext and CardIndex data types"
```

---

## Task 3: Context Manager Core Logic

**Files:**
- Create: `backend/src/core/context_manager.py`
- Test: `tests/test_context_manager.py`

- [ ] **Step 1: Write test for loading recent cards**

```python
# tests/test_context_manager.py
from datetime import datetime, timedelta

def test_load_recent_cards():
    manager = ContextManager(db_path="test.db")
    recent = manager._get_recent_cards(hours=1, limit=20)
    assert isinstance(recent, list)
    # Verify all cards are within 1 hour
    for card in recent:
        assert card["updated_at"] > datetime.now() - timedelta(hours=1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_context_manager.py::test_load_recent_cards -v`
Expected: FAIL

- [ ] **Step 3: Implement _get_recent_cards method**

```python
# backend/src/core/context_manager.py
from datetime import datetime, timedelta
from typing import List, Dict, Any

class ContextManager:
    def __init__(self, db_path: str):
        self.db_path = db_path
    
    def _get_recent_cards(self, hours: int, limit: int) -> List[Dict[str, Any]]:
        """Get cards modified in last N hours."""
        cutoff = datetime.now() - timedelta(hours=hours)
        # Query database for recent cards
        # Implementation depends on your DB layer
        return []
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_context_manager.py::test_load_recent_cards -v`
Expected: PASS

- [ ] **Step 5: Write test for loading conclusion cards**

```python
def test_load_conclusion_cards():
    manager = ContextManager(db_path="test.db")
    conclusions = manager._get_cards_by_status("conclusion")
    assert isinstance(conclusions, list)
    for card in conclusions:
        assert card["status"] == "conclusion"
```

- [ ] **Step 6: Implement _get_cards_by_status method**

```python
def _get_cards_by_status(self, status: str) -> List[Dict[str, Any]]:
    """Get all cards with specific status."""
    # Query database
    return []
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_context_manager.py::test_load_conclusion_cards -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/core/context_manager.py tests/test_context_manager.py
git commit -m "feat(core): add ContextManager card loading methods"
```

---

## Task 4: Context Manager Integration

**Files:**
- Modify: `backend/src/core/context_manager.py`
- Modify: `backend/src/api/chat.py`
- Test: `tests/test_context_manager.py`

- [ ] **Step 1: Write test for load_context**

```python
def test_load_context():
    manager = ContextManager(db_path="test.db")
    viewport = {"x": 0, "y": 0, "width": 1000, "height": 800}
    context = manager.load_context(session_id="test", viewport=viewport)
    
    assert isinstance(context, CanvasContext)
    assert len(context.core_cards) <= 50
    assert context.total_cards >= len(context.core_cards)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_context_manager.py::test_load_context -v`
Expected: FAIL

- [ ] **Step 3: Implement load_context method**

```python
def load_context(self, session_id: str, viewport: Dict) -> CanvasContext:
    """Load canvas context with hybrid strategy."""
    # 1. Load core cards
    recent = self._get_recent_cards(hours=1, limit=20)
    conclusions = self._get_cards_by_status("conclusion")
    viewport_cards = self._get_cards_in_viewport(viewport)
    
    # Deduplicate and limit
    core_cards = self._deduplicate_and_limit(
        recent + conclusions + viewport_cards, 
        limit=50
    )
    
    # 2. Load peripheral index
    peripheral = self._load_peripheral_index(session_id, core_cards)
    
    # 3. Load connections and groups
    connections = self._load_connections(session_id)
    groups = self._load_groups(session_id)
    
    return CanvasContext(
        core_cards=core_cards,
        peripheral_cards=peripheral,
        connections=connections,
        groups=groups,
        active_labels=["supports", "contradicts", "extends", "questions", "relates"],
        total_cards=len(core_cards) + len(peripheral),
        last_updated=datetime.now()
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_context_manager.py::test_load_context -v`
Expected: PASS

- [ ] **Step 5: Integrate into chat.py**

Modify `backend/src/api/chat.py`:
```python
from src.core.context_manager import ContextManager

async def stream_chat_response(...):
    # Replace old context loading
    context_manager = ContextManager(db_path="backend/data/nexus.db")
    canvas_context = context_manager.load_context(
        session_id=session_id,
        viewport=canvas_context_dict.get("viewport", {})
    )
```

- [ ] **Step 6: Test integration manually**

Run: Start backend, send chat request, verify context loads correctly

- [ ] **Step 7: Commit**

```bash
git add backend/src/core/context_manager.py backend/src/api/chat.py
git commit -m "feat(api): integrate ContextManager into chat endpoint"
```

---

## Task 5: Add get_card_detail Tool

**Files:**
- Modify: `backend/src/providers/anthropic/tools.py`
- Modify: `backend/src/core/tools/__init__.py`
- Test: Manual testing

- [ ] **Step 1: Add GetCardDetailTool class**

```python
# backend/src/providers/anthropic/tools.py
class GetCardDetailTool(Tool):
    """Tool for getting full card details."""
    
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
        
        # Check if card is in core region
        for card in canvas_context.core_cards:
            if card["id"] == card_id:
                return card
        
        # Load from database if in peripheral region
        # Implementation depends on your DB layer
        return {"error": "Card not found"}
```

- [ ] **Step 2: Register tool in ToolRegistry**

```python
# backend/src/core/tools/__init__.py
from src.providers.anthropic.tools import GetCardDetailTool

ToolRegistry.register(GetCardDetailTool())
```

- [ ] **Step 3: Test tool manually**

Start backend, send chat request with get_card_detail tool call, verify it returns full card

- [ ] **Step 4: Commit**

```bash
git add backend/src/providers/anthropic/tools.py backend/src/core/tools/
git commit -m "feat(tools): add get_card_detail tool for on-demand loading"
```

---

## Task 6: Update System Prompt Generation

**Files:**
- Modify: `backend/src/providers/anthropic/runtime.py`
- Test: Manual verification

- [ ] **Step 1: Update _build_system_prompt method**

```python
# backend/src/providers/anthropic/runtime.py
def _build_system_prompt(self, context: CanvasContext) -> str:
    """Build system prompt with hybrid context."""
    status_icons = {
        "": "⚪",
        "pending": "🟡",
        "verified": "✅",
        "conclusion": "🎯"
    }
    
    # Core cards - full details
    core_desc = []
    for card in context.core_cards:
        icon = status_icons.get(card.get("status", ""), "⚪")
        core_desc.append(f"  {icon} [ID:{card['id']}] {card['text']}")
    core_section = "\n".join(core_desc) if core_desc else "  (空)"
    
    # Peripheral cards - index only
    peripheral_desc = []
    for card_idx in context.peripheral_cards:
        icon = status_icons.get(card_idx.status, "⚪")
        peripheral_desc.append(f"  {icon} [ID:{card_idx.id}] {card_idx.title}")
    peripheral_section = "\n".join(peripheral_desc) if peripheral_desc else "  (空)"
    
    # Rest of the prompt...
    return f"""你是一个思维链路管理助手。

## 当前画布状态

### 核心区域卡片 ({len(context.core_cards)} 个，完整内容)
{core_section}

### 外围区域卡片 ({len(context.peripheral_cards)} 个，仅索引)
{peripheral_section}

提示：使用 get_card_detail(card_id) 工具获取外围卡片的完整内容。

### 连接 ({len(context.connections)} 个)
...
"""
```

- [ ] **Step 2: Test system prompt generation**

Verify prompt includes core cards (full) and peripheral cards (index only)

- [ ] **Step 3: Commit**

```bash
git add backend/src/providers/anthropic/runtime.py
git commit -m "feat(runtime): update system prompt for hybrid context"
```

---

## Task 7: End-to-End Testing

**Files:**
- Test: Manual integration testing

- [ ] **Step 1: Create test scenario with 100 cards**

Populate database with 100 test cards

- [ ] **Step 2: Verify context loading**

Send chat request, check:
- Core region has ≤50 cards
- Peripheral region has remaining cards as index
- System prompt is under 2000 tokens

- [ ] **Step 3: Test get_card_detail tool**

Ask AI to "get details of card #75", verify it loads full content

- [ ] **Step 4: Measure token savings**

Compare old vs new system prompt token count
Expected: ~60% reduction

- [ ] **Step 5: Document results**

Create `docs/phase1-results.md` with metrics

- [ ] **Step 6: Final commit**

```bash
git add docs/phase1-results.md
git commit -m "docs: add Phase 1 completion results"
```

---

## Verification Checklist

- [ ] Database indexes created and verified
- [ ] ContextManager loads core cards (recent + conclusions + viewport)
- [ ] ContextManager loads peripheral cards as index only
- [ ] get_card_detail tool works for on-demand loading
- [ ] System prompt includes hybrid context
- [ ] Token count reduced by ~60% with 100 cards
- [ ] All tests pass
- [ ] Code committed with conventional commits

---

## Next Steps

After Phase 1 completion:
1. Review Phase 1 results with user
2. Proceed to Phase 2: Agent Router + Distillation Agent
3. Update project roadmap

---

## Notes

- Keep backward compatibility - existing chat functionality should work unchanged
- Monitor performance - context loading should be <100ms
- Consider caching - ContextManager could cache loaded contexts for 1 minute

