// ═══════════════════════════════════════════════════════
// Canvas rendering: cards and connections
// ═══════════════════════════════════════════════════════
import { state, LABELS, getAllLabels } from '../../core/types/state';
import { isGroupConnId } from '../../core/types/types';
import { t, escapeHtml } from '../../i18n';
import { showToast } from '../../shared/components/toast';
import { computeHighlightMap, getDepthColor, getDepthGlow } from './highlight';
import type { Connection } from '../../core/types/types';
import { renderCardContent, getCardTypeIcon } from '../../shared/components/card-renderer';

// Track collapsed pill positions for connection routing
export const collapsedPillPositions = new Map<number, { x: number; y: number; w: number; h: number }>();

/** Get all card IDs in a group, including cards in nested child groups. */
function getAllDescendantCardIds(groupId: number): number[] {
  const group = state.groups.find(g => g.id === groupId);
  if (!group) return [];
  const ids = [...group.cardIds];
  const children = state.groups.filter(g => g.parentId === groupId);
  for (const child of children) {
    ids.push(...getAllDescendantCardIds(child.id));
  }
  return ids;
}

// ── Source-based card accent colors ──
const SOURCE_HUES = [255, 145, 85, 300, 35, 200, 170, 50, 280, 120];
const sourceColorCache = new Map<string, { accent: string; bg: string; text: string }>();

function getSourceColor(source: string): { accent: string; bg: string; text: string } {
  if (!source) return { accent: 'var(--accent)', bg: '', text: '' };
  const cached = sourceColorCache.get(source);
  if (cached) return cached;

  let hash = 0;
  for (let i = 0; i < source.length; i++) hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
  const hue = SOURCE_HUES[Math.abs(hash) % SOURCE_HUES.length];
  const color = {
    accent: `oklch(55% 0.14 ${hue})`,
    bg: `oklch(95% 0.02 ${hue} / 0.4)`,
    text: `oklch(45% 0.12 ${hue})`,
  };
  sourceColorCache.set(source, color);
  return color;
}

// ── Relationship colors ──
const LABEL_COLORS: Record<string, string> = {
  '支撑 Supports': 'oklch(55% 0.16 145)',
  '质疑 Questions': 'oklch(55% 0.18 35)',
  '相关 Related': 'oklch(54% 0.012 250)',
  '导致 Leads to': 'oklch(55% 0.15 255)',
  '反对 Opposes': 'oklch(55% 0.18 25)',
};

// Pre-defined hues for custom labels
const CUSTOM_HUES = [200, 280, 120, 50, 320, 170, 10, 90];

function getLabelColor(label: string): string {
  if (LABEL_COLORS[label]) return LABEL_COLORS[label];
  // Generate color for custom labels based on hash
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = ((hash << 5) - hash + label.charCodeAt(i)) | 0;
  const hue = CUSTOM_HUES[Math.abs(hash) % CUSTOM_HUES.length];
  return `oklch(55% 0.14 ${hue})`;
}

// ── Arrow markers (one per label used in connections) ──
function buildArrowDefs(): string {
  // Collect unique labels from current connections
  const usedLabels = new Set(state.connections.map(c => c.label));
  // Also include hardcoded colors
  for (const label of Object.keys(LABEL_COLORS)) usedLabels.add(label);

  const markers = [...usedLabels].map(label => {
    const color = getLabelColor(label);
    const id = getArrowId(label);
    return `<marker id="${id}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="${color}" opacity="0.7"/></marker>`;
  });
  return `<defs>${markers.join('')}</defs>`;
}

function getArrowId(label: string): string {
  const key = label.split(' ')[0];
  return `arrow-${key}`;
}

/** Render [[wikilinks]] in card text as clickable spans. */
function formatCardText(text: string): string {
  let html = escapeHtml(text);
  // Headers
  html = html.replace(/^### (.+)$/gm, '<strong style="font-size:12px">$1</strong>');
  html = html.replace(/^## (.+)$/gm, '<strong style="font-size:13px">$1</strong>');
  html = html.replace(/^# (.+)$/gm, '<strong style="font-size:14px">$1</strong>');
  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  html = html.replace(/`(.+?)`/g, '<code style="font:11px/1 var(--font-mono);background:var(--bg);padding:1px 4px;border-radius:3px">$1</code>');
  // Lists
  html = html.replace(/^[-*] (.+)$/gm, '• $1');
  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:6px 0">');
  // Newlines
  html = html.replace(/\n/g, '<br>');
  return html;
}

function renderWikilinks(text: string): string {
  return text.replace(/\[\[(.+?)\]\]/g, (_, ref) => {
    // Try to find by ID first
    const id = parseInt(ref);
    let targetCard: { id: number; text: string } | undefined;
    if (!isNaN(id)) {
      targetCard = state.cards.find(c => c.id === id);
    }
    // If not found by ID, try to find by text match
    if (!targetCard) {
      targetCard = state.cards.find(c => c.text.includes(ref));
    }
    const targetId = targetCard ? targetCard.id : -1;
    const displayText = targetCard ? (targetCard.text.length > 20 ? targetCard.text.slice(0, 20) + '…' : targetCard.text) : ref;
    return `<span class="wikilink" data-wiki-target="${targetId}" title="${escapeHtml(displayText)}">[[${escapeHtml(ref)}]]</span>`;
  });
}

/** Get the center of a card element in canvas coordinates. Routes to collapsed pill if needed. */
export function getCardCenter(cardId: number): { cx: number; cy: number } {
  // Group connection (negative ID)
  if (cardId < 0) {
    const gid = -cardId;
    const group = state.groups.find(g => g.id === gid);
    if (!group) return { cx: 0, cy: 0 };
    // Collapsed group → use pill
    const pill = collapsedPillPositions.get(gid);
    if (pill) return { cx: pill.x + pill.w / 2, cy: pill.y + pill.h / 2 };
    // Expanded group → use bounding box center from DOM
    const el = document.querySelector(`.canvas-group[data-group-id="${gid}"]`) as HTMLElement | null;
    if (el) {
      return {
        cx: group.cardIds.length > 0 ? el.offsetLeft + el.offsetWidth / 2 : 0,
        cy: group.cardIds.length > 0 ? el.offsetTop + el.offsetHeight / 2 : 0,
      };
    }
    return { cx: 0, cy: 0 };
  }

  // If card is in a collapsed group, use the pill's center
  for (const group of state.groups) {
    if (group.collapsed && group.cardIds.includes(cardId)) {
      const pill = collapsedPillPositions.get(group.id);
      if (pill) return { cx: pill.x + pill.w / 2, cy: pill.y + pill.h / 2 };
    }
  }

  const card = state.cards.find(c => c.id === cardId);
  if (!card) return { cx: 0, cy: 0 };

  const el = document.querySelector(`.canvas-card[data-id="${cardId}"]`) as HTMLElement | null;
  if (el) {
    return {
      cx: card.x + el.offsetWidth / 2,
      cy: card.y + el.offsetHeight / 2,
    };
  }
  return { cx: card.x + 120, cy: card.y + 40 };
}

/** Get the explicit position of a named port (top/right/bottom/left) on a card or group. */
export function getPortPosition(id: number, port: string): { x: number; y: number } {
  // Group (negative ID)
  if (id < 0) {
    const gid = -id;
    const pill = collapsedPillPositions.get(gid);
    if (pill) {
      const cx = pill.x + pill.w / 2;
      const cy = pill.y + pill.h / 2;
      if (port === 'top') return { x: cx, y: pill.y };
      if (port === 'bottom') return { x: cx, y: pill.y + pill.h };
      if (port === 'left') return { x: pill.x, y: cy };
      return { x: pill.x + pill.w, y: cy };
    }
    const el = document.querySelector(`.canvas-group[data-group-id="${gid}"]`) as HTMLElement | null;
    if (el) {
      const gx = el.offsetLeft;
      const gy = el.offsetTop;
      const gw = el.offsetWidth;
      const gh = el.offsetHeight;
      const cx = gx + gw / 2;
      const cy = gy + gh / 2;
      if (port === 'top') return { x: cx, y: gy };
      if (port === 'bottom') return { x: cx, y: gy + gh };
      if (port === 'left') return { x: gx, y: cy };
      return { x: gx + gw, y: cy };
    }
    return { x: 0, y: 0 };
  }

  // Card
  const card = state.cards.find(c => c.id === id);
  if (!card) return { x: 0, y: 0 };
  const el = document.querySelector(`.canvas-card[data-id="${id}"]`) as HTMLElement | null;
  const w = el ? el.offsetWidth : 240;
  const h = el ? el.offsetHeight : 80;
  const cx = card.x + w / 2;
  const cy = card.y + h / 2;
  // Indexed dock ports (e.g., 'right-0', 'left-2')
  const dm = port.match(/^(left|right)-(\d+)$/);
  if (dm) {
    const idx = parseInt(dm[2]);
    const dc = card.dockCount ?? 1;
    const yOff = h * (idx + 1) / (dc + 1);
    return dm[1] === 'left'
      ? { x: card.x, y: card.y + yOff }
      : { x: card.x + w, y: card.y + yOff };
  }
  if (port === 'top') return { x: cx, y: card.y };
  if (port === 'bottom') return { x: cx, y: card.y + h };
  if (port === 'left') return { x: card.x, y: cy };
  return { x: card.x + w, y: cy };
}

/** Get the best port position on a card/group edge facing another point. Routes to collapsed pill if needed. */
export function getCardPort(cardId: number, targetX: number, targetY: number): { x: number; y: number } {
  // Group connection (negative ID)
  if (cardId < 0) {
    const gid = -cardId;
    // Collapsed group → use pill
    const pill = collapsedPillPositions.get(gid);
    if (pill) {
      const cx = pill.x + pill.w / 2;
      const cy = pill.y + pill.h / 2;
      const dx = targetX - cx;
      const dy = targetY - cy;
      if (Math.abs(dx) / pill.w > Math.abs(dy) / pill.h) {
        return dx > 0 ? { x: pill.x + pill.w, y: cy } : { x: pill.x, y: cy };
      } else {
        return dy > 0 ? { x: cx, y: pill.y + pill.h } : { x: cx, y: pill.y };
      }
    }
    // Expanded group → use bounding box from DOM
    const el = document.querySelector(`.canvas-group[data-group-id="${gid}"]`) as HTMLElement | null;
    if (el) {
      const gx = el.offsetLeft;
      const gy = el.offsetTop;
      const gw = el.offsetWidth;
      const gh = el.offsetHeight;
      const cx = gx + gw / 2;
      const cy = gy + gh / 2;
      const dx = targetX - cx;
      const dy = targetY - cy;
      if (Math.abs(dx) / gw > Math.abs(dy) / gh) {
        return dx > 0 ? { x: gx + gw, y: cy } : { x: gx, y: cy };
      } else {
        return dy > 0 ? { x: cx, y: gy + gh } : { x: cx, y: gy };
      }
    }
    return { x: 0, y: 0 };
  }

  // If card is in a collapsed group, use the pill's edge
  for (const group of state.groups) {
    if (group.collapsed && group.cardIds.includes(cardId)) {
      const pill = collapsedPillPositions.get(group.id);
      if (pill) {
        const cx = pill.x + pill.w / 2;
        const cy = pill.y + pill.h / 2;
        const dx = targetX - cx;
        const dy = targetY - cy;
        if (Math.abs(dx) / pill.w > Math.abs(dy) / pill.h) {
          return dx > 0 ? { x: pill.x + pill.w, y: cy } : { x: pill.x, y: cy };
        } else {
          return dy > 0 ? { x: cx, y: pill.y + pill.h } : { x: cx, y: pill.y };
        }
      }
    }
  }

  const card = state.cards.find(c => c.id === cardId);
  if (!card) return { x: 0, y: 0 };

  const el = document.querySelector(`.canvas-card[data-id="${cardId}"]`) as HTMLElement | null;
  const w = el ? el.offsetWidth : 240;
  const h = el ? el.offsetHeight : 80;

  const cx = card.x + w / 2;
  const cy = card.y + h / 2;

  // Calculate which edge is closest to target
  const dx = targetX - cx;
  const dy = targetY - cy;

  // Determine dominant direction
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx / w > absDy / h) {
    // Horizontal dominant
    return dx > 0
      ? { x: card.x + w, y: cy }  // right edge
      : { x: card.x, y: cy };      // left edge
  } else {
    // Vertical dominant
    return dy > 0
      ? { x: cx, y: card.y + h }   // bottom edge
      : { x: cx, y: card.y };       // top edge
  }
}

/** Generate a cubic bezier path from (x1,y1) to (x2,y2). */
export function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Control point offset scales with distance
  const offset = Math.min(dist * 0.4, 150);

  // Determine curve direction based on dominant axis
  let cx1: number, cy1: number, cx2: number, cy2: number;

  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal dominant: curve horizontally
    cx1 = x1 + offset * Math.sign(dx);
    cy1 = y1;
    cx2 = x2 - offset * Math.sign(dx);
    cy2 = y2;
  } else {
    // Vertical dominant: curve vertically
    cx1 = x1;
    cy1 = y1 + offset * Math.sign(dy);
    cx2 = x2;
    cy2 = y2 - offset * Math.sign(dy);
  }

  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
}

/** Get the midpoint of a cubic bezier curve (approximate). */
function bezierMidpoint(x1: number, y1: number, x2: number, y2: number): { mx: number; my: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offset = Math.min(dist * 0.4, 150);

  let cx1: number, cy1: number, cx2: number, cy2: number;

  if (Math.abs(dx) > Math.abs(dy)) {
    cx1 = x1 + offset * Math.sign(dx);
    cy1 = y1;
    cx2 = x2 - offset * Math.sign(dx);
    cy2 = y2;
  } else {
    cx1 = x1;
    cy1 = y1 + offset * Math.sign(dy);
    cx2 = x2;
    cy2 = y2 - offset * Math.sign(dy);
  }

  // Bezier at t=0.5
  const t = 0.5;
  const mt = 1 - t;
  const mx = mt * mt * mt * x1 + 3 * mt * mt * t * cx1 + 3 * mt * t * t * cx2 + t * t * t * x2;
  const my = mt * mt * mt * y1 + 3 * mt * mt * t * cy1 + 3 * mt * t * t * cy2 + t * t * t * y2;
  return { mx, my };
}

/** Check if two cards are in the same collapsed group (internal connection). */
function isInSameCollapsedGroup(fromId: number, toId: number): boolean {
  // Group connections (negative IDs) are never "internal" to a collapsed group
  if (fromId < 0 || toId < 0) return false;
  return state.groups.some(g => g.collapsed && g.cardIds.includes(fromId) && g.cardIds.includes(toId));
}

/** Generate connection port HTML for a card, with multi-dock support on left/right edges. */
function renderCardPorts(c: { id: number; dockCount?: number }): string {
  const dc = c.dockCount ?? 1;
  let html = `<div class="conn-port top" data-action="connect" data-card-id="${c.id}"></div>`;
  for (let i = 0; i < dc; i++) {
    const pct = ((i + 1) / (dc + 1) * 100).toFixed(1);
    html += `<div class="conn-port right" data-action="connect" data-card-id="${c.id}" data-dock="${i}" style="top:${pct}%;right:-5px;transform:translateY(-50%)"></div>`;
  }
  html += `<div class="conn-port bottom" data-action="connect" data-card-id="${c.id}"></div>`;
  for (let i = dc - 1; i >= 0; i--) {
    const pct = ((i + 1) / (dc + 1) * 100).toFixed(1);
    html += `<div class="conn-port left" data-action="connect" data-card-id="${c.id}" data-dock="${i}" style="top:${pct}%;left:-5px;transform:translateY(-50%)"></div>`;
  }
  return html;
}

export function renderCanvas(): void {
  const inner = document.getElementById('canvasInner');
  if (!inner) return;
  const canvasCards = state.cards.filter(c => c.inCanvas);

  // Render group backgrounds first (below cards)
  collapsedPillPositions.clear();
  let groupsHtml = '';
  // Sort: top-level first, then nested (so children render inside parents)
  const sortedGroups = [...state.groups].sort((a, b) => {
    const aDepth = a.parentId ? 1 : 0;
    const bDepth = b.parentId ? 1 : 0;
    return aDepth - bDepth;
  });
  // Helper: check if any ancestor group is collapsed
  const hasCollapsedAncestor = (gid: number): boolean => {
    const g = state.groups.find(x => x.id === gid);
    if (!g || !g.parentId) return false;
    const parent = state.groups.find(x => x.id === g.parentId);
    if (!parent) return false;
    if (parent.collapsed) return true;
    return hasCollapsedAncestor(parent.id);
  };
  for (const group of sortedGroups) {
    // Skip child groups when their parent is collapsed (parent handles them)
    if (group.parentId && hasCollapsedAncestor(group.id)) continue;
    // For bounding box: include all descendant cards (nested children)
    const allCardIds = getAllDescendantCardIds(group.id);
    const groupCards = allCardIds.map(id => canvasCards.find(c => c.id === id)).filter(Boolean);
    if (groupCards.length === 0) continue;

    if (group.collapsed) {
      // Collapsed: show compact pill at the average position of the group cards
      const avgX = groupCards.reduce((s, c) => s + c!.x, 0) / groupCards.length;
      const avgY = groupCards.reduce((s, c) => s + c!.y, 0) / groupCards.length;
      const pillW = 160;
      const pillH = 36;
      collapsedPillPositions.set(group.id, { x: avgX, y: avgY, w: pillW, h: pillH });
      groupsHtml += `<div class="canvas-group collapsed" data-group-id="${group.id}"
        style="left:${avgX}px;top:${avgY}px;background:${group.color}">
        <div class="group-title" data-group-id="${group.id}">
          <span class="group-toggle" data-group-id="${group.id}">▸</span>
          <span class="group-name">${escapeHtml(group.name)}</span>
          <span class="group-count">${groupCards.length}</span>
          <span class="group-lock${group.locked ? ' locked' : ''}" data-group-id="${group.id}" title="${group.locked ? '解锁：允许卡片独立移动' : '锁定：卡片作为整体移动'}">${group.locked ? '🔗' : '🔓'}</span>
        </div>
      </div>`;
      // Remove cards from rendering
      for (const c of groupCards) {
        const idx = canvasCards.indexOf(c!);
        if (idx !== -1) canvasCards.splice(idx, 1);
      }
    } else {
      // Expanded: full bounding box
      const PAD = 24;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const c of groupCards) {
        const el = document.querySelector(`.canvas-card[data-id="${c!.id}"]`) as HTMLElement | null;
        const w = el ? el.offsetWidth : 240;
        const h = el ? el.offsetHeight : 80;
        minX = Math.min(minX, c!.x);
        minY = Math.min(minY, c!.y);
        maxX = Math.max(maxX, c!.x + w);
        maxY = Math.max(maxY, c!.y + h);
      }
      const gx = minX - PAD;
      const gy = minY - PAD - 34;
      const gw = maxX - minX + PAD * 2;
      const gh = maxY - minY + PAD * 2 + 34;

      groupsHtml += `<div class="canvas-group${group.locked ? ' group-locked' : ''}" data-group-id="${group.id}"
        style="left:${gx}px;top:${gy}px;width:${gw}px;height:${gh}px;background:${group.color}">
        <div class="group-bg" data-group-id="${group.id}"></div>
        <div class="group-title" data-group-id="${group.id}">
          <span class="group-toggle" data-group-id="${group.id}">▾</span>
          <span class="group-name">${escapeHtml(group.name)}</span>
          <span class="group-count">${groupCards.length}</span>
          <span class="group-lock${group.locked ? ' locked' : ''}" data-group-id="${group.id}" title="${group.locked ? '解锁：允许卡片独立移动' : '锁定：卡片作为整体移动'}">${group.locked ? '🔗' : '🔓'}</span>
        </div>
        <div class="conn-port top" data-action="connect" data-group-id="${group.id}"></div>
        <div class="conn-port right" data-action="connect" data-group-id="${group.id}"></div>
        <div class="conn-port bottom" data-action="connect" data-group-id="${group.id}"></div>
        <div class="conn-port left" data-action="connect" data-group-id="${group.id}"></div>
      </div>`;
    }
  }

  // Compute highlight map if active
  const highlightMap = state.highlightRootId !== null
    ? computeHighlightMap(state.highlightRootId, state.highlightDepth, state.connections)
    : null;

  // First pass: render HTML structure
  inner.innerHTML = groupsHtml + canvasCards.map(c => {
    const selected = state.selectedCards.has(c.id) ? 'selected' : '';
    const hlClass = highlightMap
      ? (highlightMap.has(c.id) ? `highlight-depth-${Math.min(highlightMap.get(c.id)!, 3)}` : 'highlight-dim')
      : '';
    const isConclusion = c.status === 'conclusion';
    const statusTag = c.status === 'pending'
      ? `<span class="card-status-tag pending">${t('status-pending')}</span>`
      : c.status === 'verified'
        ? `<span class="card-status-tag verified">${t('status-verified')}</span>`
        : isConclusion
          ? `<span class="card-status-tag conclusion">${t('status-conclusion')}</span>`
          : '';

    // Check if card has a specialized type
    const hasSpecializedType = c.type && ['distillation', 'socratic', 'flow_analysis', 'choice', 'vote'].includes(c.type);
    const cardTypeIcon = hasSpecializedType ? getCardTypeIcon(c.type) : '';

    if (isConclusion) {
      return `<div class="canvas-card conclusion-card ${selected} ${hlClass}" data-id="${c.id}"
        style="left:${c.x}px;top:${c.y}px">
        <div class="card-head">
          <span class="card-source">${t('status-conclusion')}</span>
        </div>
        <button class="card-ai-btn" data-action="card-ai" data-card-id="${c.id}" title="${t('card-ai-title')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        </button>
        <div class="card-body card-content" data-card-id="${c.id}"></div>
        <span class="card-expand" data-action="toggle-expand" data-card-id="${c.id}">${t('expand-chain')}</span>
        ${statusTag}
      </div>`;
    }

    const sc = getSourceColor(c.source);
    return `<div class="canvas-card ${selected} ${hlClass}" data-id="${c.id}"
      style="left:${c.x}px;top:${c.y}px;border-left:3px solid ${sc.accent}">
      ${c.openQuestion ? `<div class="card-question-badge" title="${escapeHtml(c.openQuestion)}">?</div>` : ''}
      <div class="card-head">
        ${cardTypeIcon ? `<span class="card-type-icon" title="${c.type}">${cardTypeIcon}</span>` : ''}
        <span class="card-source" style="color:${sc.text};background:${sc.bg};padding:1px 6px;border-radius:3px">${escapeHtml(c.source)}</span>
      </div>
      <button class="card-ai-btn" data-action="card-ai" data-card-id="${c.id}" title="${t('card-ai-title')}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      </button>
      <div class="card-body card-content" data-card-id="${c.id}"></div>
      ${statusTag}
      ${renderCardPorts(c)}
    </div>`;
  }).join('');

  // Second pass: render specialized card content
  canvasCards.forEach(c => {
    const container = inner.querySelector(`.card-content[data-card-id="${c.id}"]`) as HTMLElement;
    if (!container) return;

    // Image cards
    if (c.type === 'image' && c.metadata?.imageData) {
      const nameHtml = c.metadata?.imageName ? `<div class="card-image-name">${escapeHtml(c.metadata.imageName)}</div>` : '';
      container.innerHTML = `${nameHtml}<img src="${c.metadata.imageData}" alt="pasted image" />`;
    } else if (c.type && ['distillation', 'socratic', 'flow_analysis', 'choice', 'vote', 'conclusion'].includes(c.type)) {
      // Use specialized renderer if card has a type
      renderCardContent(c, container);
    } else {
      // Fallback to default text rendering
      container.innerHTML = renderWikilinks(formatCardText(c.text));
    }
  });
  renderConnections();
}

export function renderConnections(): void {
  const svg = document.getElementById('connectionsSvg');
  const canvasInner = document.getElementById('canvasInner');
  if (!svg || !canvasInner) return;

  canvasInner.querySelectorAll('.conn-label').forEach(el => el.remove());

  // Compute highlight map if active
  const highlightMap = state.highlightRootId !== null
    ? computeHighlightMap(state.highlightRootId, state.highlightDepth, state.connections)
    : null;

  svg.innerHTML = buildArrowDefs() + state.connections
    .filter(conn => !isInSameCollapsedGroup(conn.from, conn.to))
    .map(conn => {
    const from = conn.fromPort
      ? getPortPosition(conn.from, conn.fromPort)
      : getCardPort(conn.from, getCardCenter(conn.to).cx, getCardCenter(conn.to).cy);
    const to = conn.toPort
      ? getPortPosition(conn.to, conn.toPort)
      : getCardPort(conn.to, from.x, from.y);

    const color = getLabelColor(conn.label);
    const pathD = bezierPath(from.x, from.y, to.x, to.y);
    const mid = bezierMidpoint(from.x, from.y, to.x, to.y);
    const arrowId = getArrowId(conn.label);

    // Determine highlight state for this connection
    const fromHighlighted = isGroupConnId(conn.from) ? true : (highlightMap?.has(conn.from) ?? true);
    const toHighlighted = isGroupConnId(conn.to) ? true : (highlightMap?.has(conn.to) ?? true);
    const bothHighlighted = fromHighlighted && toHighlighted;
    const connDim = highlightMap && !bothHighlighted;

    // Group connections get dashed style
    const isGroupConn = isGroupConnId(conn.from) || isGroupConnId(conn.to);
    const dashArray = isGroupConn ? ' stroke-dasharray="6 4"' : '';

    // Create label element
    const label = document.createElement('div');
    label.className = `conn-label${connDim ? ' conn-dim' : (bothHighlighted && highlightMap ? ' conn-highlight' : '')}${isGroupConn ? ' conn-group' : ''}`;
    label.textContent = conn.label;
    label.style.left = mid.mx + 'px';
    label.style.top = mid.my + 'px';
    label.style.color = color;
    label.style.borderColor = color.replace(')', ' / 0.5)').replace('oklch(', 'oklch(');
    label.dataset.connFrom = String(conn.from);
    label.dataset.connTo = String(conn.to);
    canvasInner.appendChild(label);

    const strokeWidth = bothHighlighted && highlightMap ? '2.5' : '1.5';
    const opacity = connDim ? '0.12' : '1';

    return `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" opacity="${opacity}"${dashArray} marker-end="url(#${arrowId})"/>`;
  }).join('');
}

/** Render a temporary bezier curve while dragging a connection. */
export function renderTempConnection(fromId: number, toX: number, toY: number, fromPort?: string): void {
  const svg = document.getElementById('connectionsSvg');
  if (!svg) return;

  svg.querySelector('.temp-line')?.remove();

  const start = fromPort
    ? getPortPosition(fromId, fromPort)
    : getCardPort(fromId, toX, toY);
  const pathD = bezierPath(start.x, start.y, toX, toY);

  svg.innerHTML += `<path class="temp-line" d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.5"/>`;
}

export function cycleLabel(conn: Connection): string {
  const idx = LABELS.indexOf(conn.label);
  conn.label = LABELS[(idx + 1) % LABELS.length];
  renderConnections();
  showToast(conn.label);
  return conn.label;
}
