// ═══════════════════════════════════════════════════════
// Note Card Component
// Enhanced rendering for basic note cards
// ═══════════════════════════════════════════════════════
import type { Card } from '../../core/types/types';

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function renderNoteCard(card: Card, container: HTMLElement): void {
  const hasKeywords = card.keywords && card.keywords.length > 0;
  const hasOpenQuestion = !!card.openQuestion;
  const hasStatus = card.status === 'pending' || card.status === 'verified' || card.status === 'conclusion';

  container.innerHTML = `
    <div class="note-card">
      ${hasStatus ? `
        <div class="note-status-badge ${card.status}">
          ${card.status === 'verified' ? '✓' : card.status === 'pending' ? '◌' : '●'}
          <span>${card.status === 'verified' ? '已验证' : card.status === 'pending' ? '待验证' : '结论'}</span>
        </div>
      ` : ''}
      ${card.title ? `<div class="note-title">${escapeHtml(card.title)}</div>` : ''}
      <div class="note-text">${escapeHtml(card.text)}</div>
      ${hasKeywords ? `
        <div class="note-keywords">
          ${card.keywords!.map(kw =>
            `<span class="note-keyword">${escapeHtml(kw)}</span>`
          ).join('')}
        </div>
      ` : ''}
      ${hasOpenQuestion ? `
        <div class="note-open-question">
          <span class="note-question-icon">?</span>
          <span class="note-question-text">${escapeHtml(card.openQuestion!)}</span>
        </div>
      ` : ''}
      <div class="note-meta">
        ${card.source ? `<span class="note-source" title="${escapeHtml(card.source)}">📎</span>` : ''}
        ${card.time ? `<span class="note-time">${card.time}</span>` : ''}
      </div>
    </div>
  `;
}

export function isNoteCard(card: Card): boolean {
  return !card.type || card.type === 'note';
}
