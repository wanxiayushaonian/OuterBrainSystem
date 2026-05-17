// ═══════════════════════════════════════════════════════
// Canvas Templates — Pre-built thinking frameworks
// ═══════════════════════════════════════════════════════
import { state, pushUndo, scheduleSave, addConnection } from '../../core/types/state';
import { renderCanvas, renderConnections } from '../canvas/renderer';
import type { Card } from '../../core/types/types';

export interface TemplateCard {
  text: string;
  type?: Card['type'];
  dx: number;
  dy: number;
}

export interface TemplateConnection {
  from: number; // template card index
  to: number;
  label: string;
}

export interface CanvasTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  cards: TemplateCard[];
  connections: TemplateConnection[];
}

// ── Pre-set templates ──

export const TEMPLATES: CanvasTemplate[] = [
  {
    id: 'swot',
    name: 'SWOT 分析',
    icon: '⊞',
    description: '优势、劣势、机会、威胁四维分析框架',
    cards: [
      { text: '优势 Strengths', dx: -130, dy: -100, type: 'note' },
      { text: '劣势 Weaknesses', dx: 130, dy: -100, type: 'note' },
      { text: '机会 Opportunities', dx: -130, dy: 100, type: 'note' },
      { text: '威胁 Threats', dx: 130, dy: 100, type: 'note' },
    ],
    connections: [
      { from: 0, to: 2, label: '转化' },
      { from: 1, to: 3, label: '转化' },
    ],
  },
  {
    id: 'six-hats',
    name: '六顶帽',
    icon: '🎩',
    description: '爱德华·德博诺六顶思考帽思维法',
    cards: [
      { text: '主题', dx: 0, dy: 0, type: 'note' },
      { text: '⬜ 白帽 — 事实与数据', dx: 0, dy: -180, type: 'note' },
      { text: '🟥 红帽 — 直觉与情感', dx: 156, dy: -90, type: 'note' },
      { text: '⬛ 黑帽 — 风险与批判', dx: 156, dy: 90, type: 'note' },
      { text: '🟨 黄帽 — 乐观与价值', dx: 0, dy: 180, type: 'note' },
      { text: '🟩 绿帽 — 创意与可能', dx: -156, dy: 90, type: 'note' },
      { text: '🟦 蓝帽 — 控制与总结', dx: -156, dy: -90, type: 'note' },
    ],
    connections: [
      { from: 0, to: 1, label: '视角' },
      { from: 0, to: 2, label: '视角' },
      { from: 0, to: 3, label: '视角' },
      { from: 0, to: 4, label: '视角' },
      { from: 0, to: 5, label: '视角' },
      { from: 0, to: 6, label: '视角' },
    ],
  },
  {
    id: '5w1h',
    name: '5W1H',
    icon: '❓',
    description: 'Who/What/When/Where/Why/How 全面分析',
    cards: [
      { text: 'Who — 谁？', dx: -150, dy: -110, type: 'note' },
      { text: 'What — 什么？', dx: 0, dy: -110, type: 'note' },
      { text: 'When — 何时？', dx: 150, dy: -110, type: 'note' },
      { text: 'Where — 何地？', dx: -150, dy: 110, type: 'note' },
      { text: 'Why — 为什么？', dx: 0, dy: 110, type: 'note' },
      { text: 'How — 怎么做？', dx: 150, dy: 110, type: 'note' },
    ],
    connections: [
      { from: 0, to: 1, label: '关联' },
      { from: 1, to: 2, label: '关联' },
      { from: 3, to: 4, label: '关联' },
      { from: 4, to: 5, label: '关联' },
      { from: 0, to: 3, label: '关联' },
      { from: 1, to: 4, label: '关联' },
      { from: 2, to: 5, label: '关联' },
    ],
  },
  {
    id: 'cornell',
    name: '康奈尔笔记',
    icon: '📝',
    description: '笔记区、线索区、摘要区三段式笔记法',
    cards: [
      { text: '线索区\nCues / Questions', dx: -220, dy: -60, type: 'note' },
      { text: '笔记区\nNotes / Details', dx: 40, dy: -60, type: 'note' },
      { text: '摘要区\nSummary', dx: -90, dy: 140, type: 'note' },
    ],
    connections: [
      { from: 0, to: 1, label: '对应' },
      { from: 0, to: 2, label: '总结' },
      { from: 1, to: 2, label: '总结' },
    ],
  },
  {
    id: 'problem-breakdown',
    name: '问题拆解',
    icon: '🧩',
    description: '核心问题拆解为子问题，综合得出结论',
    cards: [
      { text: '核心问题', dx: 0, dy: -160, type: 'note' },
      { text: '子问题 A', dx: -200, dy: 20, type: 'note' },
      { text: '子问题 B', dx: 0, dy: 20, type: 'note' },
      { text: '子问题 C', dx: 200, dy: 20, type: 'note' },
      { text: '结论', dx: 0, dy: 200, type: 'conclusion' },
    ],
    connections: [
      { from: 0, to: 1, label: '拆解' },
      { from: 0, to: 2, label: '拆解' },
      { from: 0, to: 3, label: '拆解' },
      { from: 1, to: 4, label: '支撑' },
      { from: 2, to: 4, label: '支撑' },
      { from: 3, to: 4, label: '支撑' },
    ],
  },
];

/**
 * Apply a template to the canvas at the given origin position.
 * Returns the IDs of created cards.
 */
export function applyTemplate(template: CanvasTemplate, originX: number, originY: number): number[] {
  pushUndo();

  const now = new Date();
  const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const idMap: number[] = [];
  const createdIds: number[] = [];

  // Create cards
  for (const tc of template.cards) {
    const id = state.nextId++;
    idMap.push(id);
    createdIds.push(id);

    const card: Card = {
      id,
      text: tc.text,
      source: '模板 Template',
      time,
      status: '',
      inCanvas: true,
      x: originX + tc.dx,
      y: originY + tc.dy,
      type: tc.type || 'note',
    };
    state.cards.push(card);
  }

  // Create connections
  for (const conn of template.connections) {
    const fromId = idMap[conn.from];
    const toId = idMap[conn.to];
    if (fromId !== undefined && toId !== undefined) {
      addConnection(fromId, toId, conn.label);
    }
  }

  scheduleSave();
  renderCanvas();
  renderConnections();

  return createdIds;
}
