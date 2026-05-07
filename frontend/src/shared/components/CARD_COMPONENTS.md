# Card Components Documentation

## Overview

Nexus 支持 7 种卡片类型，每种卡片都有专门的渲染组件和样式。

## Card Types

| Type | Icon | Description | Component |
|------|------|-------------|-----------|
| `note` | 📝 | 基础笔记卡片 | Default renderer |
| `distillation` | 💎 | 内容提炼卡片，带关键词选择 | `distillation-card.ts` |
| `socratic` | ❓ | 苏格拉底式质疑卡片 | `socratic-card.ts` |
| `flow_analysis` | 🔄 | 流程/论证分析卡片 | `flow-analysis-card.ts` |
| `choice` | 🎯 | 决策选择卡片，带优劣分析 | `choice-card.ts` |
| `vote` | 🗳️ | 投票卡片，实时统计 | `vote-card.ts` |
| `conclusion` | 🎓 | 结论卡片，汇总多个卡片 | Default renderer |

## Architecture

```
frontend/src/shared/components/
├── card-renderer.ts          # 统一路由器
├── card-renderer.css         # 默认卡片样式
├── distillation-card.ts      # 提炼卡片
├── distillation-card.css
├── socratic-card.ts          # 质疑卡片
├── socratic-card.css
├── flow-analysis-card.ts     # 流程分析卡片
├── flow-analysis-card.css
├── choice-card.ts            # 选择卡片
├── choice-card.css
├── vote-card.ts              # 投票卡片
└── vote-card.css
```

## Usage

### 1. Unified Renderer (Recommended)

```typescript
import { renderCardContent } from './shared/components/card-renderer';

const card: Card = {
  id: 1,
  text: 'Card content',
  type: 'distillation',
  metadata: { /* ... */ },
  // ... other fields
};

const container = document.getElementById('card-container');
renderCardContent(card, container);
```

### 2. Direct Component Usage

```typescript
import { renderDistillationCard } from './shared/components/distillation-card';

const card: Card = {
  id: 1,
  text: 'Distilled insights',
  type: 'distillation',
  metadata: {
    original_text: 'Long text...',
    extracted_keywords: ['key1', 'key2'],
    recommended_keywords: ['key3'],
    user_selected_keywords: [],
  },
  // ... other fields
};

renderDistillationCard(card, container);
```

## Card Type Specifications

### 1. Note Card

**Type**: `note`

**Fields**:
```typescript
{
  text: string;
  title?: string;
  keywords?: string[];
}
```

**Example**:
```typescript
{
  id: 1,
  text: '深度学习模型训练要点',
  type: 'note',
  title: '训练要点',
  keywords: ['深度学习', '训练'],
}
```

### 2. Distillation Card

**Type**: `distillation`

**Metadata**:
```typescript
interface DistillationMetadata {
  original_text: string;
  extracted_keywords: string[];
  recommended_keywords: string[];
  user_selected_keywords: string[];
  reasoning?: string;
}
```

**Features**:
- Interactive keyword selection (checkboxes)
- Collapsible original content
- Recommended keywords display
- Auto-save on keyword toggle

**Example**:
```typescript
{
  id: 2,
  text: 'Transformer核心创新',
  type: 'distillation',
  metadata: {
    original_text: 'Transformer通过自注意力...',
    extracted_keywords: ['自注意力', '并行化'],
    recommended_keywords: ['BERT', 'GPT'],
    user_selected_keywords: ['自注意力'],
    reasoning: '提炼了核心创新点',
  },
}
```

### 3. Socratic Card

**Type**: `socratic`

**Metadata**:
```typescript
interface SocraticMetadata {
  original_claim: string;
  challenges: Array<{
    question: string;
    response?: string;
    user_reflection?: string;
  }>;
  reasoning?: string;
}
```

**Features**:
- Display original claim
- List of challenge questions
- Optional AI responses
- User reflection textarea (auto-save on blur)

**Example**:
```typescript
{
  id: 3,
  text: '对"大模型更好"的质疑',
  type: 'socratic',
  metadata: {
    original_claim: '大模型总是更好',
    challenges: [
      {
        question: '资源受限场景呢？',
        response: '小模型可能更合适',
        user_reflection: '',
      },
    ],
  },
}
```

### 4. Flow Analysis Card

**Type**: `flow_analysis`

**Metadata**:
```typescript
interface FlowAnalysisMetadata {
  flow_type: string;
  stages: Array<{
    name: string;
    description: string;
    insights?: string[];
    issues?: string[];
  }>;
  overall_insight?: string;
  reasoning?: string;
}
```

**Features**:
- Sequential stage display with arrows
- Per-stage insights and issues
- Overall insight summary
- Visual flow indicators

**Example**:
```typescript
{
  id: 4,
  text: 'ML开发流程',
  type: 'flow_analysis',
  metadata: {
    flow_type: '开发流程',
    stages: [
      {
        name: '数据准备',
        description: '收集和清洗',
        insights: ['质量是关键'],
        issues: ['标注成本高'],
      },
    ],
    overall_insight: '数据质量决定上限',
  },
}
```

### 5. Choice Card

**Type**: `choice`

**Metadata**:
```typescript
interface ChoiceMetadata {
  context: string;
  options: Array<{
    name: string;
    description: string;
    pros: string[];
    cons: string[];
    score?: number;
  }>;
  recommendation?: string;
  user_choice?: string;
  reasoning?: string;
}
```

**Features**:
- Radio button selection
- Pros/cons lists for each option
- Optional scoring (0-10)
- Recommendation display
- Auto-save on selection

**Example**:
```typescript
{
  id: 5,
  text: '选择框架',
  type: 'choice',
  metadata: {
    context: '为项目选择框架',
    options: [
      {
        name: 'PyTorch',
        description: '动态图',
        pros: ['灵活', '易用'],
        cons: ['部署复杂'],
        score: 9,
      },
    ],
    recommendation: '推荐PyTorch',
    user_choice: undefined,
  },
}
```

### 6. Vote Card

**Type**: `vote`

**Metadata**:
```typescript
interface VoteMetadata {
  question: string;
  options: Array<{
    id: string;
    text: string;
    votes: number;
    voters?: string[];
  }>;
  allow_multiple: boolean;
  user_votes: string[];
  total_voters?: number;
  reasoning?: string;
}
```

**Features**:
- Radio (single) or checkbox (multiple) voting
- Real-time vote count and percentage
- Visual progress bars
- Auto-save and re-render on vote

**Example**:
```typescript
{
  id: 6,
  text: '研究方向投票',
  type: 'vote',
  metadata: {
    question: '下一步研究什么？',
    options: [
      { id: 'opt1', text: '多模态', votes: 5 },
      { id: 'opt2', text: '压缩', votes: 3 },
    ],
    allow_multiple: false,
    user_votes: [],
    total_voters: 8,
  },
}
```

### 7. Conclusion Card

**Type**: `conclusion`

**Fields**:
```typescript
{
  text: string;
  summary: string;
  chainIds: number[];
}
```

**Features**:
- Display summary text
- Show linked card IDs
- Distinct visual style (yellow theme)

**Example**:
```typescript
{
  id: 7,
  text: 'Transformer总结',
  type: 'conclusion',
  summary: '核心优势是自注意力...',
  chainIds: [2, 3, 4],
}
```

## Styling

All card components support dark mode via `@media (prefers-color-scheme: dark)`.

### Color Themes

| Card Type | Light Theme | Dark Theme |
|-----------|-------------|------------|
| Note | White | Dark gray |
| Distillation | Light gray | Dark blue-gray |
| Socratic | Light blue-gray | Dark blue |
| Flow Analysis | Light blue | Dark blue |
| Choice | Light gray | Dark gray |
| Vote | Light teal | Dark teal |
| Conclusion | Light yellow | Dark yellow |

## Security

All components use `escapeHtml()` to prevent XSS attacks:

```typescript
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

## State Management

Interactive components (Distillation, Socratic, Choice, Vote) use:

```typescript
import { state, scheduleSave } from '../../core/types/state';

// Modify card metadata
card.metadata.user_selected_keywords.push(keyword);

// Trigger save
scheduleSave();
```

## Testing

Run the demo page to test all card types:

```bash
# Open in browser
open frontend/card-types-demo.html
```

## Integration Example

```typescript
// In your canvas renderer
import { renderCardContent } from './shared/components/card-renderer';

function renderCard(card: Card) {
  const cardElement = document.createElement('div');
  cardElement.className = 'card';
  
  const contentContainer = document.createElement('div');
  contentContainer.className = 'card-content';
  
  // Unified rendering
  renderCardContent(card, contentContainer);
  
  cardElement.appendChild(contentContainer);
  return cardElement;
}
```

## Future Enhancements

- [ ] Animation transitions between card types
- [ ] Export card as image/PDF
- [ ] Card templates for quick creation
- [ ] Collaborative editing for Vote cards
- [ ] Version history for card edits
- [ ] Card linking visualization
- [ ] Keyboard shortcuts for card actions

## Related Files

- `backend/src/core/runtime/types.py` - Card type definitions
- `backend/src/agents/distillation_agent.py` - Distillation card generation
- `frontend/src/core/types/types.ts` - TypeScript card interface
- `docs/superpowers/plans/2026-05-07-agent-architecture-phase2.md` - Phase 2 plan
