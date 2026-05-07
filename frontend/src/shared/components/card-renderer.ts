// ═══════════════════════════════════════════════════════
// Card Renderer - Unified card type rendering
// Routes cards to appropriate specialized renderers
// ═══════════════════════════════════════════════════════
import type { Card } from '../../core/types/types';
import { renderDistillationCard, isDistillationCard } from './distillation-card';
import { renderSocraticCard, isSocraticCard } from './socratic-card';
import { renderFlowAnalysisCard, isFlowAnalysisCard } from './flow-analysis-card';
import { renderChoiceCard, isChoiceCard } from './choice-card';
import { renderVoteCard, isVoteCard } from './vote-card';

/**
 * Render card content based on card type
 * Routes to specialized renderer or falls back to default
 */
export function renderCardContent(card: Card, container: HTMLElement): void {
  // Route to specialized renderers
  if (isDistillationCard(card)) {
    renderDistillationCard(card, container);
    return;
  }

  if (isSocraticCard(card)) {
    renderSocraticCard(card, container);
    return;
  }

  if (isFlowAnalysisCard(card)) {
    renderFlowAnalysisCard(card, container);
    return;
  }

  if (isChoiceCard(card)) {
    renderChoiceCard(card, container);
    return;
  }

  if (isVoteCard(card)) {
    renderVoteCard(card, container);
    return;
  }

  // Default rendering for note cards and conclusion cards
  renderDefaultCard(card, container);
}

/**
 * Default card renderer for note and conclusion types
 */
function renderDefaultCard(card: Card, container: HTMLElement): void {
  const escapeHtml = (text: string): string => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  // For conclusion cards, show summary and chain info
  if (card.type === 'conclusion' && card.summary) {
    container.innerHTML = `
      <div class="conclusion-card">
        <div class="conclusion-title">${escapeHtml(card.text)}</div>
        <div class="conclusion-summary">${escapeHtml(card.summary)}</div>
        ${card.chainIds && card.chainIds.length > 0 ? `
          <div class="conclusion-chain">
            <span class="chain-label">关联卡片：</span>
            <span class="chain-ids">${card.chainIds.join(', ')}</span>
          </div>
        ` : ''}
      </div>
    `;
    return;
  }

  // Default note card rendering
  container.innerHTML = `
    <div class="note-card">
      ${card.title ? `<div class="note-title">${escapeHtml(card.title)}</div>` : ''}
      <div class="note-text">${escapeHtml(card.text)}</div>
      ${card.keywords && card.keywords.length > 0 ? `
        <div class="note-keywords">
          ${card.keywords.map(kw =>
            `<span class="note-keyword">${escapeHtml(kw)}</span>`
          ).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Get card type display name
 */
export function getCardTypeDisplayName(type?: string): string {
  const typeNames: Record<string, string> = {
    note: '笔记',
    distillation: '提炼',
    socratic: '质疑',
    flow_analysis: '流程分析',
    choice: '选择',
    vote: '投票',
    conclusion: '结论',
  };

  return typeNames[type || 'note'] || '笔记';
}

/**
 * Get card type icon
 */
export function getCardTypeIcon(type?: string): string {
  const typeIcons: Record<string, string> = {
    note: '📝',
    distillation: '💎',
    socratic: '❓',
    flow_analysis: '🔄',
    choice: '🎯',
    vote: '🗳️',
    conclusion: '🎓',
  };

  return typeIcons[type || 'note'] || '📝';
}
