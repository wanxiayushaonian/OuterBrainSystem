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
import { renderDebateCard, isDebateCard } from './debate-card';
import { renderResearchPathCard, isResearchPathCard } from './research-path-card';
import { renderProgressCard, isProgressCard } from './progress-card';
import { renderChecklistCard, isChecklistCard } from './checklist-card';
import { renderQuoteCard, isQuoteCard } from './quote-card';
import { renderNoteCard, isNoteCard } from './note-card';
import { renderConclusionCard, isConclusionCard } from './conclusion-card';
import { renderImageCard, isImageCard } from './image-card';

/**
 * Render card content based on card type
 * Routes to specialized renderer or falls back to default
 */
export function renderCardContent(card: Card, container: HTMLElement): void {
  // Route to specialized renderers
  if (isNoteCard(card)) {
    renderNoteCard(card, container);
    return;
  }

  if (isConclusionCard(card)) {
    renderConclusionCard(card, container);
    return;
  }

  if (isImageCard(card)) {
    renderImageCard(card, container);
    return;
  }

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

  if (isDebateCard(card)) {
    renderDebateCard(card, container);
    return;
  }

  if (isResearchPathCard(card)) {
    renderResearchPathCard(card, container);
    return;
  }

  if (isProgressCard(card)) {
    renderProgressCard(card, container);
    return;
  }

  if (isChecklistCard(card)) {
    renderChecklistCard(card, container);
    return;
  }

  if (isQuoteCard(card)) {
    renderQuoteCard(card, container);
    return;
  }

  // Fallback for unknown types
  container.innerHTML = `<div class="note-card"><div class="note-text">${card.text}</div></div>`;
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
    debate: '辩论',
    research_path: '研究路径',
    progress: '进度',
    checklist: '清单',
    quote: '引用',
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
    debate: '⚖️',
    research_path: '🗺️',
    progress: '📊',
    checklist: '☑️',
    quote: '💬',
    image: '🖼️',
  };

  return typeIcons[type || 'note'] || '📝';
}
