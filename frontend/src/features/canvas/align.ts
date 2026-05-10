// ═══════════════════════════════════════════════════════
// Card alignment: align / distribute selected cards
// ═══════════════════════════════════════════════════════
import { state, scheduleSave, pushUndo } from '../../core/types/state';
import { renderCanvas } from './renderer';
import type { Card } from '../../core/types/types';

const FALLBACK_W = 240;
const FALLBACK_H = 80;

function getSelectedCards(): Card[] {
  return state.cards.filter(c => state.selectedCards.has(c.id) && c.inCanvas);
}

function getSize(id: number): { w: number; h: number } {
  const el = document.querySelector(`.canvas-card[data-id="${id}"]`) as HTMLElement | null;
  return { w: el ? el.offsetWidth : FALLBACK_W, h: el ? el.offsetHeight : FALLBACK_H };
}

function finish(): void {
  renderCanvas();
  scheduleSave();
}

// ── Align left edges ──
export function alignLeft(): void {
  const cards = getSelectedCards();
  if (cards.length < 2) return;
  pushUndo();
  const minX = Math.min(...cards.map(c => c.x));
  for (const c of cards) c.x = minX;
  finish();
}

// ── Align right edges ──
export function alignRight(): void {
  const cards = getSelectedCards();
  if (cards.length < 2) return;
  pushUndo();
  const maxRight = Math.max(...cards.map(c => c.x + getSize(c.id).w));
  for (const c of cards) c.x = maxRight - getSize(c.id).w;
  finish();
}

// ── Align top edges ──
export function alignTop(): void {
  const cards = getSelectedCards();
  if (cards.length < 2) return;
  pushUndo();
  const minY = Math.min(...cards.map(c => c.y));
  for (const c of cards) c.y = minY;
  finish();
}

// ── Align bottom edges ──
export function alignBottom(): void {
  const cards = getSelectedCards();
  if (cards.length < 2) return;
  pushUndo();
  const maxBottom = Math.max(...cards.map(c => c.y + getSize(c.id).h));
  for (const c of cards) c.y = maxBottom - getSize(c.id).h;
  finish();
}

// ── Center horizontally (on average center X) ──
export function alignCenterH(): void {
  const cards = getSelectedCards();
  if (cards.length < 2) return;
  pushUndo();
  const centers = cards.map(c => c.x + getSize(c.id).w / 2);
  const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
  for (const c of cards) c.x = Math.round(avg - getSize(c.id).w / 2);
  finish();
}

// ── Center vertically (on average center Y) ──
export function alignCenterV(): void {
  const cards = getSelectedCards();
  if (cards.length < 2) return;
  pushUndo();
  const centers = cards.map(c => c.y + getSize(c.id).h / 2);
  const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
  for (const c of cards) c.y = Math.round(avg - getSize(c.id).h / 2);
  finish();
}

// ── Distribute horizontally ──
export function distributeH(): void {
  const cards = getSelectedCards();
  if (cards.length < 3) return;
  pushUndo();
  const withBounds = cards.map(c => {
    const { w } = getSize(c.id);
    return { card: c, left: c.x, right: c.x + w, w };
  });
  withBounds.sort((a, b) => a.left - b.left);
  const totalSpan = withBounds[withBounds.length - 1].right - withBounds[0].left;
  const totalCardWidth = withBounds.reduce((s, b) => s + b.w, 0);
  const gap = (totalSpan - totalCardWidth) / (cards.length - 1);
  let x = withBounds[0].left;
  for (const item of withBounds) {
    item.card.x = Math.round(x);
    x += item.w + gap;
  }
  finish();
}

// ── Distribute vertically ──
export function distributeV(): void {
  const cards = getSelectedCards();
  if (cards.length < 3) return;
  pushUndo();
  const withBounds = cards.map(c => {
    const { h } = getSize(c.id);
    return { card: c, top: c.y, bottom: c.y + h, h };
  });
  withBounds.sort((a, b) => a.top - b.top);
  const totalSpan = withBounds[withBounds.length - 1].bottom - withBounds[0].top;
  const totalCardHeight = withBounds.reduce((s, b) => s + b.h, 0);
  const gap = (totalSpan - totalCardHeight) / (cards.length - 1);
  let y = withBounds[0].top;
  for (const item of withBounds) {
    item.card.y = Math.round(y);
    y += item.h + gap;
  }
  finish();
}
