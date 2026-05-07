# Distillation Card Component

## 概述

DistillationCard 是一个用于展示提炼内容的 React/TypeScript 组件，支持关键词选择、原始内容查看和推荐关键词显示。

## 功能特性

- ✅ 显示提炼后的标题
- ✅ 关键词复选框交互
- ✅ 推荐关键词显示（来自画布已有卡片）
- ✅ 原始内容折叠/展开
- ✅ 提炼理由显示
- ✅ 深色模式支持
- ✅ XSS 防护

## 文件结构

```
frontend/src/shared/components/
├── distillation-card.ts      # 组件逻辑
└── distillation-card.css     # 样式文件

frontend/
└── distillation-card-demo.html  # 演示页面
```

## 数据结构

### Card 接口扩展

```typescript
interface Card {
  id: number;
  text: string;
  type?: 'note' | 'distillation' | 'socratic' | ...;
  metadata?: Record<string, any>;
  // ... 其他字段
}
```

### DistillationMetadata

```typescript
interface DistillationMetadata {
  original_text: string;              // 原始完整文本
  extracted_keywords: string[];       // 提取的关键词
  recommended_keywords: string[];     // 推荐的已有关键词
  user_selected_keywords: string[];   // 用户选择的关键词
  reasoning?: string;                 // 提炼理由
}
```

## 使用方法

### 1. 导入组件

```typescript
import { renderDistillationCard, isDistillationCard } from './shared/components/distillation-card';
```

### 2. 渲染卡片

```typescript
const card: Card = {
  id: 1,
  text: "AI 提升开发效率",
  type: "distillation",
  metadata: {
    original_text: "我们讨论了 AI 如何提升开发效率...",
    extracted_keywords: ["AI", "开发效率", "自动化"],
    recommended_keywords: ["机器学习"],
    user_selected_keywords: ["AI", "自动化"],
    reasoning: "核心观点是 AI 工具的应用价值"
  },
  // ... 其他字段
};

const container = document.getElementById('card-container');
if (isDistillationCard(card)) {
  renderDistillationCard(card, container);
}
```

### 3. 获取用户选择的关键词

```typescript
import { getSelectedKeywords } from './shared/components/distillation-card';

const selectedKeywords = getSelectedKeywords(cardId);
console.log('User selected:', selectedKeywords);
```

## API 参考

### renderDistillationCard(card, container)

渲染 distillation 卡片到指定容器。

**参数**:
- `card: Card` - 卡片对象
- `container: HTMLElement` - 目标容器元素

**返回**: `void`

### isDistillationCard(card)

检查卡片是否为 distillation 类型。

**参数**:
- `card: Card` - 卡片对象

**返回**: `boolean`

### getSelectedKeywords(cardId)

获取用户选择的关键词列表。

**参数**:
- `cardId: number` - 卡片 ID

**返回**: `string[]`

## 样式定制

### CSS 变量

组件使用标准颜色，可通过 CSS 覆盖：

```css
.distillation-card {
  --primary-color: #3498db;
  --background-color: #f8f9fa;
  --border-color: #ddd;
}
```

### 深色模式

组件自动支持深色模式（通过 `prefers-color-scheme: dark`）。

## 集成到 Canvas

### 在 Canvas 渲染器中集成

```typescript
// features/canvas/renderer.ts
import { renderDistillationCard, isDistillationCard } from '../../shared/components/distillation-card';

function renderCard(card: Card): HTMLElement {
  const cardElement = document.createElement('div');
  cardElement.className = 'card';

  if (isDistillationCard(card)) {
    renderDistillationCard(card, cardElement);
  } else {
    // 渲染普通卡片
    cardElement.innerHTML = `<div class="card-text">${card.text}</div>`;
  }

  return cardElement;
}
```

## 事件处理

### 关键词选择事件

组件内部自动处理关键词选择，更新 `card.metadata.user_selected_keywords` 并调用 `scheduleSave()`。

如需自定义行为，可修改 `toggleKeyword()` 函数：

```typescript
function toggleKeyword(cardId: number, keyword: string, selected: boolean): void {
  // 更新数据
  // ...

  // 自定义逻辑
  console.log(`Keyword ${keyword} ${selected ? 'selected' : 'deselected'}`);

  // 触发自定义事件
  window.dispatchEvent(new CustomEvent('keyword-changed', {
    detail: { cardId, keyword, selected }
  }));
}
```

## 演示

打开 `frontend/distillation-card-demo.html` 查看组件演示。

```bash
# 在浏览器中打开
open frontend/distillation-card-demo.html
```

## 测试

### 单元测试（待实现）

```typescript
// tests/distillation-card.test.ts
import { renderDistillationCard, getSelectedKeywords } from '../src/shared/components/distillation-card';

test('renders distillation card', () => {
  const card = createMockDistillationCard();
  const container = document.createElement('div');
  renderDistillationCard(card, container);
  expect(container.querySelector('.distillation-card')).toBeTruthy();
});

test('toggles keyword selection', () => {
  // ...
});
```

## 已知限制

1. 当前版本使用原生 DOM 操作，未来可考虑迁移到 React/Vue
2. 关键词数量建议不超过 10 个，以保持 UI 整洁
3. 原始文本过长时可能需要滚动

## 未来改进

- [ ] 支持关键词拖拽排序
- [ ] 支持关键词颜色标记
- [ ] 支持关键词搜索/过滤
- [ ] 支持批量选择/取消
- [ ] 支持关键词关联可视化

## 相关文档

- [Phase 2 Implementation Plan](../../docs/superpowers/plans/2026-05-07-agent-architecture-phase2.md)
- [Agent Architecture Design](../../docs/superpowers/specs/2026-05-07-agent-architecture-design.md)
