// ═══════════════════════════════════════════════════════
// Choice Card Component
// Displays decision options with pros/cons analysis
// ═══════════════════════════════════════════════════════
import type { Card } from '../../core/types/types';
import { state, scheduleSave } from '../../core/types/state';

export interface ChoiceOption {
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  score?: number; // 0-10 rating
}

export interface ChoiceMetadata {
  context: string;
  options: ChoiceOption[];
  recommendation?: string;
  user_choice?: string;
  reasoning?: string;
}

/**
 * Render choice card content
 */
export function renderChoiceCard(card: Card, container: HTMLElement): void {
  if (card.type !== 'choice' || !card.metadata) {
    return;
  }

  const metadata = card.metadata as ChoiceMetadata;

  container.innerHTML = `
    <div class="choice-card">
      <div class="choice-title">${escapeHtml(card.text)}</div>

      <div class="choice-context">
        <div class="context-label">决策背景：</div>
        <div class="context-text">${escapeHtml(metadata.context)}</div>
      </div>

      <div class="choice-options">
        ${(metadata.options || []).map((option, idx) => `
          <div class="choice-option ${metadata.user_choice === option.name ? 'selected' : ''}"
               data-option-name="${escapeHtml(option.name)}">
            <div class="option-header">
              <input
                type="radio"
                name="choice-${card.id}"
                class="option-radio"
                data-card-id="${card.id}"
                data-option-name="${escapeHtml(option.name)}"
                ${metadata.user_choice === option.name ? 'checked' : ''}
              />
              <div class="option-name">${escapeHtml(option.name)}</div>
              ${option.score !== undefined ? `
                <div class="option-score">${option.score}/10</div>
              ` : ''}
            </div>
            <div class="option-description">${escapeHtml(option.description)}</div>

            ${option.pros.length > 0 ? `
              <div class="option-pros">
                <div class="pros-label">✅ 优势：</div>
                <ul class="pros-list">
                  ${option.pros.map(pro => `<li>${escapeHtml(pro)}</li>`).join('')}
                </ul>
              </div>
            ` : ''}

            ${option.cons.length > 0 ? `
              <div class="option-cons">
                <div class="cons-label">❌ 劣势：</div>
                <ul class="cons-list">
                  ${option.cons.map(con => `<li>${escapeHtml(con)}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>

      ${metadata.recommendation ? `
        <div class="choice-recommendation">
          <div class="recommendation-label">💡 推荐：</div>
          <div class="recommendation-text">${escapeHtml(metadata.recommendation)}</div>
        </div>
      ` : ''}

      ${metadata.reasoning ? `
        <details class="choice-reasoning">
          <summary>分析理由</summary>
          <div class="reasoning-text">${escapeHtml(metadata.reasoning)}</div>
        </details>
      ` : ''}
    </div>
  `;

  // Attach event listeners for option selection (skip in gallery mode — read-only preview)
  if (!state.galleryMode) attachChoiceListeners(card.id);
}

/**
 * Attach event listeners for option radio buttons
 */
function attachChoiceListeners(cardId: number): void {
  const radios = document.querySelectorAll(
    `.option-radio[data-card-id="${cardId}"]`
  ) as NodeListOf<HTMLInputElement>;

  radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const optionName = target.dataset.optionName;
      if (!optionName) return;

      selectOption(cardId, optionName);
    });
  });
}

/**
 * Select an option
 */
function selectOption(cardId: number, optionName: string): void {
  const card = state.cards.find(c => c.id === cardId);
  if (!card || !card.metadata) return;

  const metadata = card.metadata as ChoiceMetadata;
  metadata.user_choice = optionName;

  // Update visual state
  const optionElements = document.querySelectorAll(`.choice-option[data-option-name]`);
  optionElements.forEach(el => {
    if (el.getAttribute('data-option-name') === optionName) {
      el.classList.add('selected');
    } else {
      el.classList.remove('selected');
    }
  });

  scheduleSave();
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
 * Check if card is a choice card
 */
export function isChoiceCard(card: Card): boolean {
  return card.type === 'choice';
}

/**
 * Get user's selected choice
 */
export function getUserChoice(cardId: number): string | undefined {
  const card = state.cards.find(c => c.id === cardId);
  if (!card || card.type !== 'choice' || !card.metadata) {
    return undefined;
  }

  const metadata = card.metadata as ChoiceMetadata;
  return metadata.user_choice;
}
