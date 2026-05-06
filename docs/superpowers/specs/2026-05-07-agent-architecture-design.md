# OuterBrainSystem Agent Architecture Design

**Date**: 2026-05-07  
**Status**: Approved  
**Implementation Strategy**: Gradual Evolution (4 Phases, 8 weeks)

---

## Executive Summary

This design transforms OuterBrainSystem from a single-agent tool-calling system into a multi-agent cognitive architecture. The goal is to realize the vision described in `request.txt`: a "thinking chain management system" that helps users see how they think, not just store what they think.

**Key Changes**:
1. **Context Manager** - Hybrid loading strategy to handle canvas state growth
2. **5 Specialized Agents** - Each focused on specific cognitive tasks
3. **Rich Interactive Cards** - Shift from "dialogue-driven" to "card-driven" interaction
4. **Layered Tool System** - L1 (atomic) → L2 (composite) → L3 (workflow)

---

## 1. Overall Architecture

### Current State
```
Frontend → Chat API → Agent Loop (max 10 iterations) → 9 atomic tools → Canvas Context
```

### Target State
```
Frontend (Vite + TypeScript)
    ↓
Chat API (FastAPI) - preserve existing interface
    ↓
┌─────────────────────────────────────┐
│   Context Manager (NEW)             │
│   - Hybrid loading strategy         │
│   - Core region + peripheral index  │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│   Agent Router (ENHANCED)           │
│   - Intent recognition              │
│   - Agent dispatch                  │
│   - Hybrid collaboration mode       │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│   5 Specialized Agents              │
│   1. Conversational Agent           │
│   2. Distillation Agent             │
│   3. Socratic Agent                 │
│   4. Flow Analyzer Agent            │
│   5. Conclusion Agent               │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│   Layered Tool System               │
│   L1: Atomic tools (9 existing)     │
│   L2: Composite tools (agent-specific) │
│   L3: Workflow tools (end-to-end)   │
└─────────────────────────────────────┘
    ↓
Canvas Context (cards, connections, groups)
```

### Core Design Principles
1. **Backward Compatible** - Existing functionality unaffected
2. **Gradual Enhancement** - Implemented in 4 phases
3. **Card-Driven** - Shift from "dialogue-driven" to "card-driven" interaction
4. **Context Efficient** - Hybrid loading controls token consumption

---

## 2. Context Manager Design

### Problem
Current system includes full canvas state (all cards, connections, groups) in System Prompt. As users accumulate hundreds of cards, context window explodes.

### Solution: Hybrid Loading Strategy

**Core Region (full load)**:
- Cards modified/created in last 1 hour
- All cards with `status: "conclusion"`
- Cards in current frontend viewport
- Recently clicked/edited cards
- **Limit: 50 cards max**

**Peripheral Region (index only)**:
- Load only `id` + `title` + `status`
- Do not load full `text` and `metadata`

**On-Demand Retrieval**:
- New tool: `get_card_detail(card_id)` - fetch full card content
- Agents can dynamically load peripheral cards as needed

### Data Structure

```python
@dataclass
class CanvasContext:
    # Core region - full data
    core_cards: List[Card]
    
    # Peripheral region - index data
    peripheral_cards: List[CardIndex]  # {id, title, status}
    
    # Connections and groups
    connections: List[Connection]
    groups: List[Group]
    active_labels: List[str]
    
    # Metadata
    total_cards: int
    last_updated: datetime
```

### Loading Logic

```python
class ContextManager:
    def load_context(self, session_id: str, viewport: Viewport) -> CanvasContext:
        # 1. Load core region
        core_cards = self._load_core_cards(session_id, viewport)
        
        # 2. Load peripheral index
        peripheral_cards = self._load_peripheral_index(session_id, core_cards)
        
        # 3. Load connections and groups
        connections = self._load_connections(session_id)
        groups = self._load_groups(session_id)
        
        return CanvasContext(...)
    
    def _load_core_cards(self, session_id: str, viewport: Viewport) -> List[Card]:
        # Hybrid rules: time + status + viewport
        recent = self._get_recent_cards(hours=1, limit=20)
        conclusions = self._get_cards_by_status("conclusion")
        viewport_cards = self._get_cards_in_viewport(viewport)
        
        # Deduplicate + limit count
        core = list(set(recent + conclusions + viewport_cards))[:50]
        return core
```

### Expected Impact
- **Before**: 100 cards = ~5000 tokens in System Prompt
- **After**: 100 cards = ~2000 tokens (50 full + 50 index)
- **Reduction**: 60% token savings

---

## 3. Multi-Agent Architecture

### 3.1 Agent Roles

#### 1. Conversational Agent
- **Responsibility**: Daily conversation, tool calls, general tasks
- **Reasoning Mode**: ReAct (Thought → Action → Observation)
- **Trigger**: Default agent, handles unclassified requests
- **Output**: Text replies + tool calls

#### 2. Distillation Agent
- **Responsibility**: Title compression, keyword extraction, gravity wall recommendation
- **Reasoning Mode**: Self-Reflection (generate then self-check)
- **Trigger**:
  - User explicitly says "distill", "save", "solidify"
  - Conversational Agent detects long output (>500 chars)
- **Output**: `distillation_card` type card

#### 3. Socratic Agent
- **Responsibility**: Socratic questioning, challenge assumptions and logic
- **Reasoning Mode**: ReAct + Task Decomposition
- **Trigger**:
  - User explicitly says "challenge", "question", "refute"
  - Conversational Agent detects user making assertions ("I think...", "should...")
- **Output**: `socratic_card` type card

#### 4. Flow Analyzer Agent
- **Responsibility**: Generate thinking flow summary, discover branches and weak points
- **Reasoning Mode**: Task Decomposition (analyze graph → identify branches → find weak points → generate suggestions)
- **Trigger**:
  - User explicitly says "analyze", "summarize", "flow"
  - Periodic trigger (every 10 new cards)
- **Output**: `flow_analysis_card` type card

#### 5. Conclusion Agent
- **Responsibility**: Merge card groups into conclusion cards
- **Reasoning Mode**: Self-Reflection (check logical completeness after generation)
- **Trigger**:
  - User explicitly says "solidify", "conclusion", "merge"
  - Flow Analyzer suggests merge
- **Output**: `conclusion_card` type card

### 3.2 Agent Router

```python
class AgentRouter:
    def route(self, user_input: str, context: CanvasContext) -> Agent:
        # 1. Intent recognition
        intent = self._detect_intent(user_input)
        
        # 2. Route to corresponding agent
        if intent == "distill":
            return DistillationAgent()
        elif intent == "challenge":
            return SocraticAgent()
        elif intent == "analyze":
            return FlowAnalyzerAgent()
        elif intent == "conclude":
            return ConclusionAgent()
        else:
            return ConversationalAgent()
    
    def _detect_intent(self, user_input: str) -> str:
        # Keyword matching + LLM classification
        keywords = {
            "distill": ["沉淀", "保存", "固化", "提取"],
            "challenge": ["质疑", "挑战", "反驳", "质询"],
            "analyze": ["分析", "总结", "流向", "梳理"],
            "conclude": ["结论", "合并", "固化结论"]
        }
        # ... implementation details
```

### 3.3 Collaboration Mode

**Hybrid Mode**: Router + Autonomous Collaboration

- **Default**: Conversational Agent is entry point (router)
- **Autonomous**: Certain scenarios support inter-agent collaboration
  - Example: Distillation Agent completes → auto-trigger Flow Analyzer Agent
  - Example: Flow Analyzer suggests merge → auto-trigger Conclusion Agent

**Collaboration Rules**:
- Max depth: 2 levels (prevent infinite loops)
- Record call chain for debugging
- User can interrupt at any time

---

## 4. Layered Tool System

### L1: Atomic Tools (preserve existing 9)
- `add_card` - Create card
- `edit_card` - Edit card
- `delete_card` - Delete card
- `move_card` - Move card
- `add_connection` - Create connection
- `delete_connection` - Delete connection
- `search_cards` - Search cards
- `analyze_canvas` - Analyze canvas
- `get_card_detail` - Get full card (NEW, for on-demand loading)

### L2: Composite Tools (agent-specific)

**`distill_text(text, context)`** - Distillation Agent
- Internal calls: compress title + extract keywords + recommend gravity wall + `add_card`

**`create_socratic_card(target_card_id, questions)`** - Socratic Agent
- Internal calls: generate question list + `add_card` + `add_connection`

**`merge_cards_to_conclusion(card_ids, reasoning)`** - Conclusion Agent
- Internal calls: merge content + `add_card` + batch `add_connection`

**`analyze_and_suggest(context)`** - Flow Analyzer Agent
- Internal calls: `analyze_canvas` + generate suggestions + `add_card`

### L3: Workflow Tools (end-to-end)

**`distill_and_analyze_workflow(text)`**
- Calls: Distillation Agent → Flow Analyzer Agent

**`challenge_and_refine_workflow(card_id)`**
- Calls: Socratic Agent → wait for user answers → Conversational Agent refine

---

## 5. Card Type System

### 5.1 Data Model

```python
@dataclass
class Card:
    id: int
    type: str  # "note" | "distillation" | "socratic" | "flow_analysis" | "conclusion" | "choice" | "vote"
    text: str
    source: str
    x: float
    y: float
    status: str  # "" | "pending" | "verified" | "conclusion"
    metadata: Dict[str, Any]  # Type-specific structured data
    created_at: datetime
    updated_at: datetime
```

### 5.2 Card Type Definitions

#### 1. note (Normal Note Card)
```json
{
  "type": "note",
  "text": "Plain text content",
  "metadata": {}
}
```
**Frontend**: Standard text display

---

#### 2. distillation (Distillation Card)
```json
{
  "type": "distillation",
  "text": "Compressed title",
  "metadata": {
    "original_text": "Original long text",
    "extracted_keywords": ["keyword1", "keyword2"],
    "recommended_keywords": ["existing_keywordA"],
    "gravity_wall": [
      {"keyword": "keywordA", "frequency": 5, "last_used": "2024-05-06"}
    ],
    "user_selected_keywords": []
  }
}
```
**Frontend Interaction**: Display keyword list, user checks to keep

---

#### 3. socratic (Socratic Card)
```json
{
  "type": "socratic",
  "text": "Challenge: Reflection on [topic]",
  "metadata": {
    "target_card_id": 15,
    "questions": [
      {"id": "q1", "text": "What is your assumption?", "answer": ""},
      {"id": "q2", "text": "Are there counterexamples?", "answer": ""}
    ]
  }
}
```
**Frontend Interaction**: Input box under each question, user fills answers

---

#### 4. flow_analysis (Flow Analysis Card)
```json
{
  "type": "flow_analysis",
  "text": "Thinking Flow Analysis V3.2",
  "metadata": {
    "branches": [
      {"name": "Branch1", "cards": [1,2,3], "status": "active"}
    ],
    "weak_points": [
      {"card_id": 5, "reason": "Lacks support"}
    ],
    "suggestions": [
      {"text": "Merge into conclusion", "action": "merge", "card_ids": [1,2,3], "voted": null}
    ]
  }
}
```
**Frontend Interaction**: Suggestion list, user can click "Accept" or "Ignore"

---

#### 5. choice (Choice Card)
```json
{
  "type": "choice",
  "text": "Please choose next direction",
  "metadata": {
    "options": [
      {"id": "opt1", "text": "Deepen Branch1", "selected": false},
      {"id": "opt2", "text": "Explore new direction", "selected": false}
    ],
    "multi_select": false
  }
}
```
**Frontend Interaction**: Single or multi-select buttons

---

#### 6. vote (Vote Card)
```json
{
  "type": "vote",
  "text": "Is this suggestion useful?",
  "metadata": {
    "target_card_id": 20,
    "vote": null  // "useful" | "not_useful" | null
  }
}
```
**Frontend Interaction**: 👍 / 👎 buttons

---

#### 7. conclusion (Conclusion Card)
```json
{
  "type": "conclusion",
  "text": "Conclusion: [title]",
  "status": "conclusion",
  "metadata": {
    "source_cards": [1, 2, 3],
    "reasoning": "Reasoning process",
    "confidence": 0.85,
    "editable": true
  }
}
```
**Frontend Interaction**: Can directly edit reasoning field

---

### 5.3 Frontend Component Mapping

```typescript
// frontend/src/features/canvas/CardRenderer.tsx
const CardRenderer = ({ card }: { card: Card }) => {
  switch (card.type) {
    case "note":
      return <NoteCard card={card} />;
    case "distillation":
      return <DistillationCard card={card} />;
    case "socratic":
      return <SocraticCard card={card} />;
    case "flow_analysis":
      return <FlowAnalysisCard card={card} />;
    case "choice":
      return <ChoiceCard card={card} />;
    case "vote":
      return <VoteCard card={card} />;
    case "conclusion":
      return <ConclusionCard card={card} />;
    default:
      return <NoteCard card={card} />;
  }
};
```

---

## 6. Implementation Roadmap

### Phase 1: Context Manager (Week 1-2)
**Goal**: Solve context bloat problem

**Implementation**:
1. Create `backend/src/core/context_manager.py`
2. Implement hybrid loading strategy
3. Modify `chat.py` to integrate Context Manager
4. Add L1 tool: `get_card_detail(card_id)`
5. Database add indexes: `created_at`, `updated_at`, `status`

**Acceptance Criteria**:
- With 100 cards, System Prompt stays under 2000 tokens
- Agent can load peripheral cards via `get_card_detail`

---

### Phase 2: Agent Router + Distillation Agent (Week 3-4)
**Goal**: Implement core distillation functionality

**Implementation**:
1. Create `backend/src/core/agent_router.py`
2. Implement intent recognition (keywords + LLM classification)
3. Create `backend/src/agents/distillation_agent.py`
4. Implement L2 tool: `distill_text()`
5. Extend card data model: add `type` and `metadata` fields
6. Frontend add `DistillationCard` component

**Acceptance Criteria**:
- User says "distill this conversation", auto-routes to Distillation Agent
- Generated card includes: compressed title + keywords + gravity wall recommendations
- Frontend can check keywords and save

---

### Phase 3: Socratic + Flow Analyzer Agents (Week 5-6)
**Goal**: Enhance thinking quality

**Implementation**:
1. Create `backend/src/agents/socratic_agent.py`
2. Create `backend/src/agents/flow_analyzer_agent.py`
3. Implement L2 tools: `create_socratic_card()`, `analyze_and_suggest()`
4. Frontend add `SocraticCard` and `FlowAnalysisCard` components
5. Implement inter-agent collaboration: auto-trigger flow analysis after distillation

**Acceptance Criteria**:
- Socratic Agent generates 3-5 deep questions
- Flow Analyzer Agent identifies branches, weak points, suggestions
- User can answer questions directly on cards

---

### Phase 4: Conclusion Agent + L3 Tools (Week 7-8)
**Goal**: Complete the thinking chain

**Implementation**:
1. Create `backend/src/agents/conclusion_agent.py`
2. Implement L2 tool: `merge_cards_to_conclusion()`
3. Implement L3 workflow tools: `distill_and_analyze_workflow()`
4. Frontend add `ConclusionCard`, `ChoiceCard`, `VoteCard` components
5. Implement self-reflection mechanism (Distillation and Conclusion Agents)

**Acceptance Criteria**:
- Can merge multiple cards into conclusion card
- Conclusion card includes reasoning process and confidence
- Workflow tools can execute end-to-end

---

## 7. Technical Stack & Dependencies

### Backend New Dependencies
```toml
# pyproject.toml
[project.dependencies]
anthropic = "^0.40.0"  # existing
pydantic = "^2.0"      # existing
sentence-transformers = "^2.2.0"  # for embedding (optional, Phase 5+)
```

### Frontend New Dependencies
```json
// package.json
{
  "dependencies": {
    "react": "^18.2.0",  // existing
    "typescript": "^5.0.0",  // existing
    "@dnd-kit/core": "^6.0.0"  // for card drag interaction (optional)
  }
}
```

---

## 8. Key Design Decisions

| Dimension | Decision | Rationale |
|-----------|----------|-----------|
| **Implementation Strategy** | Gradual Evolution | Risk-controlled, continuously available |
| **Context Management** | Hybrid Loading (core + index) | Balance response speed and completeness |
| **Agent Roles** | 5 Specialized Agents | Clear responsibilities, each focused |
| **Collaboration Mode** | Hybrid (router + autonomous) | Balance flexibility and controllability |
| **Reasoning Capability** | Combined (ReAct + decomposition + reflection) | Tailored to different agent characteristics |
| **Tool Hierarchy** | 3 layers (atomic + composite + workflow) | Clear hierarchy, adapt to different complexity |
| **Card Types** | Structured metadata | Maximum flexibility, support rich interaction |

---

## 9. Risks & Mitigation

### Risk 1: Agent intent recognition inaccurate
**Mitigation**: Provide manual agent switching UI (e.g., `/distill`, `/challenge` commands)

### Risk 2: Large card type component development
**Mitigation**: Phase 2 implement 1-2 core types first, gradually add later

### Risk 3: Inter-agent collaboration may cause circular calls
**Mitigation**: Set collaboration depth limit (max 2 levels), record call chain

### Risk 4: Frontend refactoring affects existing functionality
**Mitigation**: New components isolated from existing, distinguish via `type` field

---

## 10. Success Metrics

### Quantitative Metrics
- **Context Efficiency**: 100 cards, System Prompt < 2000 tokens (60% reduction)
- **Response Time**: Agent routing decision < 500ms
- **User Engagement**: Card interaction rate > 40% (vs. pure dialogue)

### Qualitative Metrics
- **Thinking Visibility**: Users can trace thinking path via canvas
- **Cognitive Support**: Socratic questions help users discover blind spots
- **Conclusion Quality**: Merged conclusion cards have clear reasoning

---

## 11. Future Enhancements (Phase 5+)

### Semantic Search
- Use sentence-transformers for card embedding
- Implement `search_cards_semantic(query)` tool
- Auto-recommend related cards based on similarity

### Relationship Discovery Agent
- Automatically scan new cards
- Recommend potential connections based on semantic similarity
- Generate "you might want to connect" suggestions

### Multi-Space Analysis
- Cross-space keyword analysis
- Discover thinking patterns across different spaces
- Generate meta-insights

---

## Appendix A: Example User Flow

### Scenario: User wants to distill a long conversation

1. **User**: "Help me distill this conversation about attention mechanisms"
2. **Agent Router**: Detects "distill" keyword → routes to Distillation Agent
3. **Distillation Agent**:
   - Compresses title: "Attention O(n²) Bottleneck"
   - Extracts keywords: ["attention", "complexity", "optimization"]
   - Queries gravity wall: finds existing "attention" (used 5 times)
   - Calls `distill_text()` → creates `distillation_card`
4. **Frontend**: Renders DistillationCard with:
   - Title input (editable)
   - Keyword checkboxes (user selects)
   - Gravity wall recommendations (user can add)
5. **User**: Checks "attention" and "optimization", clicks Save
6. **System**: Updates card metadata with `user_selected_keywords`
7. **Auto-trigger**: Flow Analyzer Agent analyzes canvas → generates suggestions
8. **Frontend**: Renders FlowAnalysisCard with new insights

---

## Appendix B: Database Schema Changes

### Cards Table Extension
```sql
ALTER TABLE cards ADD COLUMN type VARCHAR(50) DEFAULT 'note';
ALTER TABLE cards ADD COLUMN metadata JSONB DEFAULT '{}';
ALTER TABLE cards ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE cards ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX idx_cards_created_at ON cards(created_at);
CREATE INDEX idx_cards_updated_at ON cards(updated_at);
CREATE INDEX idx_cards_status ON cards(status);
CREATE INDEX idx_cards_type ON cards(type);
```

---

## Conclusion

This design transforms OuterBrainSystem from a simple tool-calling system into a sophisticated cognitive partner. By introducing specialized agents, rich interactive cards, and intelligent context management, we enable the core vision: **helping users see how they think, not just store what they think**.

The gradual evolution strategy ensures low risk and continuous availability, while the modular architecture allows for future enhancements without major refactoring.

**Next Steps**: Proceed to implementation planning (invoke `writing-plans` skill).
