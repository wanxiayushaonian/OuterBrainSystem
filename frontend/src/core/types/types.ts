// ═══════════════════════════════════════════════════════
// Type definitions for Nexus
// ═══════════════════════════════════════════════════════

export interface Card {
  id: number;
  text: string;
  source: string;
  time: string;
  status: '' | 'pending' | 'verified' | 'conclusion';
  inCanvas: boolean;
  x: number;
  y: number;
  // Card type system (Phase 2)
  type?: 'note' | 'distillation' | 'socratic' | 'flow_analysis' | 'choice' | 'vote' | 'conclusion';
  metadata?: Record<string, any>;
  // Extended for conclusion cards
  summary?: string;
  chainIds?: number[];
  // LLM-enhanced fields
  title?: string;
  keywords?: string[];
  // Open question
  openQuestion?: string;
}

export interface Connection {
  from: number;
  to: number;
  label: string;
}

export interface CardGroup {
  id: number;
  name: string;
  cardIds: number[];
  color: string;
  collapsed: boolean;
}

export interface Branch {
  id: number;
  name: string;
  color: string;
  forkFrom: number; // version index, -1 for root
  forkLabel?: string;
}

export interface VersionSnapshot {
  cards: Card[];
  connections: Connection[];
  label: string;
  time: Date;
  manual: boolean;
  branchId: number;
  forkPoint?: number;
}

export interface Space {
  id: number;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface AppState {
  // Multi-space
  spaces: Space[];
  currentSpaceId: number | null;
  cards: Card[];
  connections: Connection[];
  groups: CardGroup[];
  nextGroupId: number;
  versions: VersionSnapshot[];
  currentVersion: number;
  branches: Branch[];
  currentBranch: number;
  nextBranchId: number;
  branchColors: string[];
  customLabels: string[];
  activeLabelPacks: string[];
  selectedCards: Set<number>;
  zoom: number;
  pan: { x: number; y: number };
  nextId: number;
  // Drag state (transient)
  draggingCard: number | null;
  draggingGroupId: number | null;
  dragOffset: { x: number; y: number };
  dragStartMouse: { x: number; y: number } | null;
  dragStartPositions: Record<number, { x: number; y: number }> | null;
  connecting: boolean;
  connectFrom: number | null;
  selectionStart: { x: number; y: number } | null;
  isViewingHistory: boolean;
  didDrag: boolean;
  // Highlight (transient)
  highlightRootId: number | null;
  highlightDepth: number;
}

export type LangCode = 'bilingual' | 'zh' | 'en';
export type I18nDict = Record<string, string>;
export type I18nStore = Record<LangCode, I18nDict>;

// Render callback type used by modules to trigger re-renders
export type RenderFn = () => void;
