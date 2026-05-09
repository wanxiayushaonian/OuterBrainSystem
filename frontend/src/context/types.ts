// ═══════════════════════════════════════════════════════
// Context types
// ═══════════════════════════════════════════════════════

export interface MentionContext {
  type: string;
  ref: string;
  fullMatch: string;
  startIndex: number;
  endIndex: number;
}

export interface ResolvedContext {
  type: 'card' | 'file' | 'group';
  content: string;
  metadata?: Record<string, any>;
}
