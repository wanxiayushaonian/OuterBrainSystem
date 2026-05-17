// ═══════════════════════════════════════════════════════
// Vote Card Component
// Displays voting options with real-time vote counts
// ═══════════════════════════════════════════════════════
import type { Card } from '../../core/types/types';
import { state, scheduleSave } from '../../core/types/state';

export interface VoteOption {
  id: string;
  text: string;
  votes: number;
  voters?: string[]; // Optional: track who voted
}

export interface VoteMetadata {
  question: string;
  options: VoteOption[];
  allow_multiple: boolean;
  user_votes: string[]; // IDs of options user voted for
  total_voters?: number;
  reasoning?: string;
}

/**
 * Render vote card content
 */
export function renderVoteCard(card: Card, container: HTMLElement): void {
  if (card.type !== 'vote' || !card.metadata) {
    return;
  }

  const metadata = card.metadata as VoteMetadata;
  const totalVotes = (metadata.options || []).reduce((sum, opt) => sum + opt.votes, 0);

  container.innerHTML = `
    <div class="vote-card">
      <div class="vote-title">${escapeHtml(card.text)}</div>

      <div class="vote-question">
        <div class="question-icon">🗳️</div>
        <div class="question-text">${escapeHtml(metadata.question)}</div>
      </div>

      ${metadata.allow_multiple ? `
        <div class="vote-hint">💡 可以选择多个选项</div>
      ` : ''}

      <div class="vote-options">
        ${(metadata.options || []).map(option => {
          const percentage = totalVotes > 0 ? (option.votes / totalVotes * 100).toFixed(1) : '0.0';
          const isVoted = (metadata.user_votes || []).includes(option.id);

          return `
            <div class="vote-option ${isVoted ? 'voted' : ''}" data-option-id="${escapeHtml(option.id)}">
              <div class="vote-option-header">
                <input
                  type="${metadata.allow_multiple ? 'checkbox' : 'radio'}"
                  name="vote-${card.id}"
                  class="vote-input"
                  data-card-id="${card.id}"
                  data-option-id="${escapeHtml(option.id)}"
                  ${isVoted ? 'checked' : ''}
                />
                <div class="vote-option-text">${escapeHtml(option.text)}</div>
                <div class="vote-count">${option.votes}</div>
              </div>
              <div class="vote-bar-container">
                <div class="vote-bar" style="width: ${percentage}%"></div>
                <div class="vote-percentage">${percentage}%</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="vote-stats">
        <span class="stats-label">总投票数：</span>
        <span class="stats-value">${totalVotes}</span>
        ${metadata.total_voters !== undefined ? `
          <span class="stats-separator">|</span>
          <span class="stats-label">参与人数：</span>
          <span class="stats-value">${metadata.total_voters}</span>
        ` : ''}
      </div>

      ${metadata.reasoning ? `
        <details class="vote-reasoning">
          <summary>投票说明</summary>
          <div class="reasoning-text">${escapeHtml(metadata.reasoning)}</div>
        </details>
      ` : ''}
    </div>
  `;

  // Attach event listeners for voting (skip in gallery mode — read-only preview)
  if (!state.galleryMode) attachVoteListeners(card.id);
}

/**
 * Attach event listeners for vote inputs
 */
function attachVoteListeners(cardId: number): void {
  const inputs = document.querySelectorAll(
    `.vote-input[data-card-id="${cardId}"]`
  ) as NodeListOf<HTMLInputElement>;

  inputs.forEach(input => {
    input.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const optionId = target.dataset.optionId;
      if (!optionId) return;

      handleVote(cardId, optionId, target.checked);
    });
  });
}

/**
 * Handle vote action
 */
function handleVote(cardId: number, optionId: string, isVoting: boolean): void {
  const card = state.cards.find(c => c.id === cardId);
  if (!card || !card.metadata) return;

  const metadata = card.metadata as VoteMetadata;

  if (isVoting) {
    // Add vote
    if (!metadata.allow_multiple) {
      // Single choice: remove previous votes
      metadata.user_votes.forEach(prevId => {
        const prevOption = metadata.options.find(o => o.id === prevId);
        if (prevOption) {
          prevOption.votes = Math.max(0, prevOption.votes - 1);
        }
      });
      metadata.user_votes = [optionId];
    } else {
      // Multiple choice: add to list
      if (!metadata.user_votes.includes(optionId)) {
        metadata.user_votes.push(optionId);
      }
    }

    // Increment vote count
    const option = metadata.options.find(o => o.id === optionId);
    if (option) {
      option.votes += 1;
    }
  } else {
    // Remove vote
    const index = metadata.user_votes.indexOf(optionId);
    if (index > -1) {
      metadata.user_votes.splice(index, 1);
    }

    // Decrement vote count
    const option = metadata.options.find(o => o.id === optionId);
    if (option) {
      option.votes = Math.max(0, option.votes - 1);
    }
  }

  scheduleSave();

  // Re-render to update percentages
  const container = document.querySelector(`[data-card-id="${cardId}"]`)?.closest('.card-content');
  if (container) {
    renderVoteCard(card, container as HTMLElement);
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
 * Check if card is a vote card
 */
export function isVoteCard(card: Card): boolean {
  return card.type === 'vote';
}

/**
 * Get user's votes
 */
export function getUserVotes(cardId: number): string[] {
  const card = state.cards.find(c => c.id === cardId);
  if (!card || card.type !== 'vote' || !card.metadata) {
    return [];
  }

  const metadata = card.metadata as VoteMetadata;
  return metadata.user_votes || [];
}
