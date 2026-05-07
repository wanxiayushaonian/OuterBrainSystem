// ═══════════════════════════════════════════════════════
// Distillation Card Component
// Displays distilled content with keyword selection
// ═══════════════════════════════════════════════════════
import type { Card } from '../../core/types/types';
import { state, scheduleSave } from '../../core/types/state';

export interface DistillationMetadata {
  original_text: string;
  extracted_keywords: string[];
  recommended_keywords: string[];
  user_selected_keywords: string[];
  reasoning?: string;
}

/**
 * Render distillation card content
 */
export function renderDistillationCard(card: Card, container: HTMLElement): void {
  if (card.type !== 'distillation' || !card.metadata) {
    return;
  }

  const metadata = card.metadata as DistillationMetadata;

  container.innerHTML = `
    <div class="distillation-card">
      <div class="distillation-title">${escapeHtml(card.text)}</div>

      <div class="distillation-keywords">
        <div class="keywords-label">提取的关键词：</div>
        <div class="keywords-list" id="keywords-${card.id}">
          ${renderKeywords(card.id, metadata.extracted_keywords, metadata.user_selected_keywords)}
        </div>
      </div>

      ${metadata.recommended_keywords && metadata.recommended_keywords.length > 0 ? `
        <div class="distillation-recommended">
          <div class="recommended-label">推荐关键词：</div>
          <div class="recommended-list">
            ${metadata.recommended_keywords.map(kw =>
              `<span class="recommended-keyword">${escapeHtml(kw)}</span>`
            ).join('')}
          </div>
        </div>
      ` : ''}

      <details class="distillation-original">
        <summary>原始内容</summary>
        <div class="original-text">${escapeHtml(metadata.original_text)}</div>
      </details>

      ${metadata.reasoning ? `
        <details class="distillation-reasoning">
          <summary>提炼理由</summary>
          <div class="reasoning-text">${escapeHtml(metadata.reasoning)}</div>
        </details>
      ` : ''}
    </div>
  `;

  // Attach event listeners for keyword selection
  attachKeywordListeners(card.id);
}

/**
 * Render keyword checkboxes
 */
function renderKeywords(cardId: number, keywords: string[], selected: string[]): string {
  return keywords.map(kw => `
    <label class="keyword-item">
      <input
        type="checkbox"
        class="keyword-checkbox"
        data-card-id="${cardId}"
        data-keyword="${escapeHtml(kw)}"
        ${selected.includes(kw) ? 'checked' : ''}
      />
      <span class="keyword-text">${escapeHtml(kw)}</span>
    </label>
  `).join('');
}

/**
 * Attach event listeners for keyword checkboxes
 */
function attachKeywordListeners(cardId: number): void {
  const checkboxes = document.querySelectorAll(
    `.keyword-checkbox[data-card-id="${cardId}"]`
  ) as NodeListOf<HTMLInputElement>;

  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const keyword = target.dataset.keyword;
      if (!keyword) return;

      toggleKeyword(cardId, keyword, target.checked);
    });
  });
}

/**
 * Toggle keyword selection
 */
function toggleKeyword(cardId: number, keyword: string, selected: boolean): void {
  const card = state.cards.find(c => c.id === cardId);
  if (!card || !card.metadata) return;

  const metadata = card.metadata as DistillationMetadata;

  if (selected) {
    // Add keyword if not already selected
    if (!metadata.user_selected_keywords.includes(keyword)) {
      metadata.user_selected_keywords.push(keyword);
    }
  } else {
    // Remove keyword
    const index = metadata.user_selected_keywords.indexOf(keyword);
    if (index > -1) {
      metadata.user_selected_keywords.splice(index, 1);
    }
  }

  // Save state
  scheduleSave();

  // Optional: Re-render canvas to show updated card
  // renderCanvas();
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Get selected keywords for a distillation card
 */
export function getSelectedKeywords(cardId: number): string[] {
  const card = state.cards.find(c => c.id === cardId);
  if (!card || card.type !== 'distillation' || !card.metadata) {
    return [];
  }

  const metadata = card.metadata as DistillationMetadata;
  return metadata.user_selected_keywords || [];
}

/**
 * Check if card is a distillation card
 */
export function isDistillationCard(card: Card): boolean {
  return card.type === 'distillation';
}
