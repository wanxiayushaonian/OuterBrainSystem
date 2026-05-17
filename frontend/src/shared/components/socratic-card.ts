// ═══════════════════════════════════════════════════════
// Socratic Card Component
// Displays Socratic questioning with challenge-response pairs
// ═══════════════════════════════════════════════════════
import type { Card } from '../../core/types/types';
import { state, scheduleSave } from '../../core/types/state';

export interface SocraticMetadata {
  original_claim: string;
  challenges: Array<{
    question: string;
    response?: string;
    user_reflection?: string;
  }>;
  reasoning?: string;
}

/**
 * Render Socratic card content
 */
export function renderSocraticCard(card: Card, container: HTMLElement): void {
  if (card.type !== 'socratic' || !card.metadata) {
    return;
  }

  const metadata = card.metadata as SocraticMetadata;

  container.innerHTML = `
    <div class="socratic-card">
      <div class="socratic-title">${escapeHtml(card.text)}</div>

      <div class="socratic-claim">
        <div class="claim-label">原始观点：</div>
        <div class="claim-text">${escapeHtml(metadata.original_claim || '')}</div>
      </div>

      <div class="socratic-challenges">
        <div class="challenges-label">苏格拉底式质疑：</div>
        ${(metadata.challenges || []).map((challenge, idx) => `
          <div class="challenge-item" data-challenge-idx="${idx}">
            <div class="challenge-question">
              <span class="challenge-icon">❓</span>
              <span class="challenge-text">${escapeHtml(challenge.question)}</span>
            </div>
            ${challenge.response ? `
              <div class="challenge-response">
                <span class="response-icon">💡</span>
                <span class="response-text">${escapeHtml(challenge.response)}</span>
              </div>
            ` : ''}
            <div class="challenge-reflection">
              <textarea
                class="reflection-input"
                data-card-id="${card.id}"
                data-challenge-idx="${idx}"
                placeholder="你的反思..."
                rows="2"
              >${escapeHtml(challenge.user_reflection || '')}</textarea>
            </div>
          </div>
        `).join('')}
      </div>

      ${metadata.reasoning ? `
        <details class="socratic-reasoning">
          <summary>质疑理由</summary>
          <div class="reasoning-text">${escapeHtml(metadata.reasoning)}</div>
        </details>
      ` : ''}
    </div>
  `;

  // Attach event listeners for reflection inputs (skip in gallery mode — read-only preview)
  if (!state.galleryMode) attachReflectionListeners(card.id);
}

/**
 * Attach event listeners for reflection inputs
 */
function attachReflectionListeners(cardId: number): void {
  const inputs = document.querySelectorAll(
    `.reflection-input[data-card-id="${cardId}"]`
  ) as NodeListOf<HTMLTextAreaElement>;

  inputs.forEach(input => {
    input.addEventListener('blur', (e) => {
      const target = e.target as HTMLTextAreaElement;
      const challengeIdx = parseInt(target.dataset.challengeIdx || '0', 10);
      updateReflection(cardId, challengeIdx, target.value);
    });
  });
}

/**
 * Update user reflection for a challenge
 */
function updateReflection(cardId: number, challengeIdx: number, reflection: string): void {
  const card = state.cards.find(c => c.id === cardId);
  if (!card || !card.metadata) return;

  const metadata = card.metadata as SocraticMetadata;
  if (metadata.challenges && metadata.challenges[challengeIdx]) {
    metadata.challenges[challengeIdx].user_reflection = reflection;
    scheduleSave();
  }
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
 * Check if card is a Socratic card
 */
export function isSocraticCard(card: Card): boolean {
  return card.type === 'socratic';
}
