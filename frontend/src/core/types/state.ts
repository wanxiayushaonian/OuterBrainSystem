// ═══════════════════════════════════════════════════════
// State management
// ═══════════════════════════════════════════════════════
import type { AppState, Card, Connection, Space, CardGroup } from './types';
import { t } from '../../i18n';
import { fetchSpaces, loadSpaceState, saveSpaceState } from '../api/spaces';

export const LABELS = ['支撑 Supports', '质疑 Questions', '相关 Related', '导致 Leads to', '反对 Opposes'];

// ── Preset label sets for different scenarios ──
export interface LabelPreset {
  name: string;
  labels: string[];
}

export const LABEL_PRESETS: Record<string, LabelPreset> = {
  general: {
    name: '通用 General',
    labels: ['支撑 Supports', '质疑 Questions', '相关 Related', '导致 Leads to', '反对 Opposes'],
  },
  software: {
    name: '软件开发 Software Dev',
    labels: ['实现 Implements', '依赖 Depends on', '细化 Refines', '测试 Tests', '设计 Designs', '部署 Deploys', '阻塞 Blocks'],
  },
  research: {
    name: '学术研究 Research',
    labels: ['假设 Hypothesizes', '证据 Evidence for', '质疑 Challenges', '补充 Supplements', '推导 Derives', '结论 Concludes'],
  },
  decision: {
    name: '决策分析 Decision',
    labels: ['支持 Pros', '反对 Cons', '风险 Risk of', '替代 Alternative to', '前提 Prerequisite', '影响 Impacts'],
  },
  requirements: {
    name: '需求分析 Requirements',
    labels: ['用户故事 User Story', '细化 Refines', '约束 Constrains', '验收 Accepts', '冲突 Conflicts', '来源 Originates', '优先 Priority'],
  },
};

export const state: AppState = {
  spaces: [],
  currentSpaceId: null,
  cards: [],
  connections: [],
  groups: [],
  nextGroupId: 1,
  versions: [],
  currentVersion: -1,
  branches: [{ id: 0, name: 'main', color: 'oklch(58% 0.18 255)', forkFrom: -1 }],
  currentBranch: 0,
  nextBranchId: 1,
  branchColors: [
    'oklch(58% 0.18 255)',
    'oklch(55% 0.16 145)',
    'oklch(60% 0.15 35)',
    'oklch(55% 0.14 75)',
    'oklch(55% 0.14 300)',
    'oklch(55% 0.12 200)',
  ],
  customLabels: [],
  customLabelPacks: {},
  activeLabelPacks: ['general'],
  selectedCards: new Set<number>(),
  zoom: 1,
  pan: { x: 0, y: 0 },
  nextId: 1,
  draggingCard: null,
  draggingGroupId: null,
  dragOffset: { x: 0, y: 0 },
  dragStartMouse: null,
  dragStartPositions: null,
  connecting: false,
  connectFrom: null,
  selectionStart: null,
  isViewingHistory: false,
  didDrag: false,
  highlightRootId: null,
  highlightDepth: 1,
};

// ── Query helpers ──
export function getCardById(id: number): Card | undefined {
  return state.cards.find(c => c.id === id);
}

export function getInboxCards(): Card[] {
  return state.cards.filter(c => !c.inCanvas);
}

export function getCanvasCards(): Card[] {
  return state.cards.filter(c => c.inCanvas);
}

export function getConnectionsForCard(id: number): Connection[] {
  return state.connections.filter(c => c.from === id || c.to === id);
}

// ── Mutation helpers ──
export function addCard(card: Card): void {
  state.cards.push(card);
  scheduleSave();
}

export function removeCard(id: number): void {
  state.cards = state.cards.filter(c => c.id !== id);
  state.connections = state.connections.filter(c => c.from !== id && c.to !== id);
  scheduleSave();
}

export function addConnection(from: number, to: number, label: string): void {
  state.connections.push({ from, to, label });
  scheduleSave();
}

export function removeConnection(conn: Connection): void {
  state.connections = state.connections.filter(c => c !== conn);
  scheduleSave();
}

export function cycleConnectionLabel(conn: Connection): string {
  const all = getAllLabels();
  const idx = all.indexOf(conn.label);
  conn.label = all[(idx + 1) % all.length];
  return conn.label;
}

/** Get all available labels from active packs + custom packs + custom labels. */
export function getAllLabels(): string[] {
  const merged: string[] = [];
  for (const packId of state.activeLabelPacks) {
    const pack = LABEL_PRESETS[packId] || state.customLabelPacks[packId];
    if (pack) {
      for (const label of pack.labels) {
        if (!merged.includes(label)) merged.push(label);
      }
    }
  }
  // Fallback to default if no packs active
  if (merged.length === 0) merged.push(...LABELS);
  // Append custom labels
  for (const label of state.customLabels) {
    if (!merged.includes(label)) merged.push(label);
  }
  return merged;
}

// ── Persistence ──

/** Serialize current canvas state (excluding transient fields) for saving. */
export function serializeState(): Record<string, unknown> {
  return {
    cards: state.cards,
    connections: state.connections,
    groups: state.groups,
    nextGroupId: state.nextGroupId,
    versions: state.versions.map(v => ({ ...v, time: v.time instanceof Date ? v.time.toISOString() : v.time })),
    currentVersion: state.currentVersion,
    branches: state.branches,
    currentBranch: state.currentBranch,
    nextBranchId: state.nextBranchId,
    nextId: state.nextId,
    customLabels: state.customLabels,
    customLabelPacks: state.customLabelPacks,
    activeLabelPacks: state.activeLabelPacks,
  };
}

/** Load serialized state into the singleton, preserving transient fields. */
export function deserializeState(data: Record<string, unknown>): void {
  if (data.cards) state.cards = data.cards as Card[];
  if (data.connections) state.connections = data.connections as Connection[];
  if (data.versions) {
    state.versions = (data.versions as Array<Record<string, unknown>>).map(v => ({
      ...v,
      time: new Date(v.time as string),
    })) as AppState['versions'];
  }
  if (typeof data.currentVersion === 'number') state.currentVersion = data.currentVersion;
  if (data.branches) state.branches = data.branches as AppState['branches'];
  if (typeof data.currentBranch === 'number') state.currentBranch = data.currentBranch;
  if (typeof data.nextBranchId === 'number') state.nextBranchId = data.nextBranchId;
  if (typeof data.nextId === 'number') state.nextId = data.nextId;
  if (data.groups) state.groups = data.groups as AppState['groups'];
  if (typeof data.nextGroupId === 'number') state.nextGroupId = data.nextGroupId;
  if (data.customLabels) state.customLabels = data.customLabels as string[];
  if (data.customLabelPacks) state.customLabelPacks = data.customLabelPacks as Record<string, { name: string; labels: string[] }>;
  if (data.activeLabelPacks) state.activeLabelPacks = data.activeLabelPacks as string[];
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null;

// ── Undo / Redo ─────────────────────────────────────────
interface UndoSnapshot {
  cards: Card[];
  connections: Connection[];
  groups: CardGroup[];
  nextId: number;
  nextGroupId: number;
}

const undoStack: UndoSnapshot[] = [];
const redoStack: UndoSnapshot[] = [];
const MAX_UNDO = 50;

function takeSnapshot(): UndoSnapshot {
  return {
    cards: JSON.parse(JSON.stringify(state.cards)),
    connections: JSON.parse(JSON.stringify(state.connections)),
    groups: JSON.parse(JSON.stringify(state.groups)),
    nextId: state.nextId,
    nextGroupId: state.nextGroupId,
  };
}

function restoreSnapshot(snap: UndoSnapshot): void {
  state.cards = snap.cards;
  state.connections = snap.connections;
  state.groups = snap.groups;
  state.nextId = snap.nextId;
  state.nextGroupId = snap.nextGroupId;
  state.selectedCards.clear();
}

/** Call before a mutating action to enable undo. */
export function pushUndo(): void {
  undoStack.push(takeSnapshot());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
}

export function undo(): boolean {
  if (undoStack.length === 0) return false;
  redoStack.push(takeSnapshot());
  restoreSnapshot(undoStack.pop()!);
  scheduleSave();
  return true;
}

export function redo(): boolean {
  if (redoStack.length === 0) return false;
  undoStack.push(takeSnapshot());
  restoreSnapshot(redoStack.pop()!);
  scheduleSave();
  return true;
}

// ── Persistence ─────────────────────────────────────────

/** Debounced auto-save: saves 1.5s after the last mutation. */
export function scheduleSave(): void {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    if (!state.currentSpaceId) return;
    try {
      await saveSpaceState(state.currentSpaceId, serializeState());
    } catch (e) {
      console.warn('Auto-save failed:', e);
    }
  }, 1500);
}

/** Load spaces list from backend. */
export async function loadSpaces(): Promise<Space[]> {
  try {
    const spaces = await fetchSpaces();
    state.spaces = spaces;
    return spaces;
  } catch (e) {
    console.warn('Failed to load spaces:', e);
    return [];
  }
}

/** Switch to a space: save current, load target. */
export async function switchSpace(spaceId: number, renderAll: () => void): Promise<void> {
  // Save current space first
  if (state.currentSpaceId) {
    try {
      await saveSpaceState(state.currentSpaceId, serializeState());
    } catch (e) {
      console.warn('Failed to save current space:', e);
    }
  }

  // Load target space
  try {
    const data = await loadSpaceState(spaceId);
    state.currentSpaceId = spaceId;
    deserializeState(data);
    state.selectedCards = new Set();
    state.isViewingHistory = false;
    renderAll();

    // Refresh session tabs for the new space
    const { renderSessionTabs } = await import('../../shared/components/session-tabs');
    await renderSessionTabs();
  } catch (e) {
    console.error('Failed to load space:', e);
  }
}

/** Initialize with sample data (used when no backend data exists). */
export function loadSampleData(): void {
  const sampleCards = [
    { text: '用户在信息过载时需要一个外部系统来组织思维碎片，而不是依赖记忆', source: '浏览器 Browser', time: '14:12', status: '' as const },
    { text: 'Roam Research 的双向链接模型虽然强大，但学习曲线陡峭，普通用户难以坚持', source: '笔记 Notes', time: '14:08', status: '' as const },
    { text: 'AI 质询可以帮助用户发现自己推理中的逻辑漏洞，这是传统笔记工具做不到的', source: '浏览器 Browser', time: '13:55', status: '' as const },
    { text: '思维导图的问题在于它只展示层级关系，不展示因果和时间关系', source: '终端 Terminal', time: '13:41', status: '' as const },
    { text: '版本回溯让用户能"回到那个想法还成立的时刻"，这比撤销操作更有意义', source: 'Slack', time: '13:30', status: '' as const },
  ];

  const sampleCanvasCards = [
    { id: 101, x: 120, y: 140, text: '核心假设：人的思维是非线性的，但传统工具要求线性记录', source: '浏览器 Browser', status: '' as const },
    { id: 102, x: 480, y: 100, text: '双区布局将"收集"与"整理"物理分离，降低认知负担', source: '笔记 Notes', status: '' as const },
    { id: 103, x: 300, y: 360, text: 'AI 质询不是替你思考，而是暴露你思维中的隐含假设', source: '浏览器 Browser', status: '' as const },
    { id: 104, x: 650, y: 320, text: '结论固化给思考一个"句号"——思维链需要输出物', source: '终端 Terminal', status: '' as const },
  ];

  const sampleConnections = [
    { from: 101, to: 102, label: '支撑 Supports' },
    { from: 101, to: 103, label: '导致 Leads to' },
    { from: 103, to: 104, label: '支撑 Supports' },
  ];

  sampleCards.forEach(c => {
    state.cards.push({
      id: state.nextId++,
      text: c.text,
      source: c.source,
      time: c.time,
      status: c.status,
      inCanvas: false,
      x: 0,
      y: 0,
    });
  });
  sampleCanvasCards.forEach(c => {
    state.cards.push({
      id: c.id,
      text: c.text,
      source: c.source,
      time: '14:30',
      status: c.status,
      inCanvas: true,
      x: c.x,
      y: c.y,
    });
    if (c.id >= state.nextId) state.nextId = c.id + 1;
  });
  sampleConnections.forEach(c => state.connections.push({ ...c }));
}
