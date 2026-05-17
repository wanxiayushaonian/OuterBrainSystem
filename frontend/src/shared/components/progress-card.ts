// ═══════════════════════════════════════════════════════
// Progress Card Component
// Displays a progress bar with percentage and optional label
// ═══════════════════════════════════════════════════════
import type { Card } from '../../core/types/types';

export interface ProgressMetadata {
  progress: {
    value: number;      // 0-100
    label?: string;
    color?: string;
  };
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function renderProgressCard(card: Card, container: HTMLElement): void {
  if (!isProgressCard(card) || !card.metadata) return;

  const meta = card.metadata as ProgressMetadata;
  const p = meta.progress;
  const value = Math.max(0, Math.min(100, p.value));
  const color = p.color || 'var(--accent)';
  const label = p.label || '';

  container.innerHTML = `
    <div class="progress-card">
      <div class="progress-header">
        <span class="progress-title">${escapeHtml(card.text)}</span>
        <span class="progress-value">${value}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${value}%; background: ${color}"></div>
      </div>
      ${label ? `<div class="progress-label">${escapeHtml(label)}</div>` : ''}
    </div>
  `;
}

export function isProgressCard(card: Card): boolean {
  return card.type === 'progress';
}
