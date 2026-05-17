// ═══════════════════════════════════════════════════════
// Quote Card Component
// Displays a quote with attribution
// ═══════════════════════════════════════════════════════
import type { Card } from '../../core/types/types';

export interface QuoteMetadata {
  quote: {
    text: string;
    author?: string;
    source?: string;
  };
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function renderQuoteCard(card: Card, container: HTMLElement): void {
  if (!isQuoteCard(card) || !card.metadata) return;

  const meta = card.metadata as QuoteMetadata;
  const q = meta.quote;

  container.innerHTML = `
    <div class="quote-card">
      <div class="quote-mark">"</div>
      <div class="quote-text">${escapeHtml(q.text)}</div>
      ${q.author || q.source ? `
        <div class="quote-attribution">
          ${q.author ? `<span class="quote-author">— ${escapeHtml(q.author)}</span>` : ''}
          ${q.source ? `<span class="quote-source">${escapeHtml(q.source)}</span>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

export function isQuoteCard(card: Card): boolean {
  return card.type === 'quote';
}
