// ═══════════════════════════════════════════════════════
// Debate Card Component
// Displays structured pro/con debate with positions and synthesis
// ═══════════════════════════════════════════════════════
import type { Card } from '../../core/types/types';
import { t } from '../../i18n';

export interface DebatePosition {
  title: string;
  supporting_evidence: string;
  challenges: string;
}

export interface DebateMetadata {
  debate?: {
    topic: string;
    positions: DebatePosition[];
    synthesis: string;
  };
  // Backward compat flat keys
  debate_type?: string;
  claim?: string;
  pro_arguments?: Array<{ point: string; evidence?: string; strength?: string }>;
  con_arguments?: Array<{ point: string; evidence?: string; strength?: string }>;
  assessment?: {
    overall_strength?: number;
    key_disagreement?: string;
    assumptions_to_verify?: string[];
    suggested_next_steps?: string[];
  };
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Render debate card content
 */
export function renderDebateCard(card: Card, container: HTMLElement): void {
  if (!isDebateCard(card) || !card.metadata) return;

  const meta = card.metadata as DebateMetadata;

  // Structured format (new)
  if (meta.debate) {
    renderStructured(meta.debate, container);
    return;
  }

  // Backward compat: flat keys
  renderFlat(meta, container);
}

function renderStructured(debate: NonNullable<DebateMetadata['debate']>, container: HTMLElement): void {
  const positions = debate.positions || [];
  const proPos = positions[0];
  const conPos = positions[1];

  container.innerHTML = `
    <div class="debate-card">
      <div class="debate-topic">${escapeHtml(debate.topic)}</div>

      <div class="debate-positions">
        <div class="debate-position pro">
          <div class="debate-position-header">${t('debate-pro')}</div>
          ${proPos?.supporting_evidence ? `
            <div class="debate-section">
              <div class="debate-section-label">${t('debate-evidence')}</div>
              <div class="debate-section-text">${escapeHtml(proPos.supporting_evidence)}</div>
            </div>
          ` : ''}
          ${proPos?.challenges ? `
            <div class="debate-section">
              <div class="debate-section-label">${t('debate-challenges')}</div>
              <div class="debate-section-text">${escapeHtml(proPos.challenges)}</div>
            </div>
          ` : ''}
        </div>

        <div class="debate-position con">
          <div class="debate-position-header">${t('debate-con')}</div>
          ${conPos?.supporting_evidence ? `
            <div class="debate-section">
              <div class="debate-section-label">${t('debate-evidence')}</div>
              <div class="debate-section-text">${escapeHtml(conPos.supporting_evidence)}</div>
            </div>
          ` : ''}
          ${conPos?.challenges ? `
            <div class="debate-section">
              <div class="debate-section-label">${t('debate-challenges')}</div>
              <div class="debate-section-text">${escapeHtml(conPos.challenges)}</div>
            </div>
          ` : ''}
        </div>
      </div>

      ${debate.synthesis ? `
        <div class="debate-synthesis">
          <div class="debate-synthesis-header">${t('debate-synthesis')}</div>
          <div class="debate-synthesis-text">${escapeHtml(debate.synthesis)}</div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderFlat(meta: DebateMetadata, container: HTMLElement): void {
  const proArgs = meta.pro_arguments || [];
  const conArgs = meta.con_arguments || [];
  const assessment = meta.assessment || {};

  container.innerHTML = `
    <div class="debate-card">
      <div class="debate-topic">${escapeHtml(meta.claim || '')}</div>

      <div class="debate-positions">
        <div class="debate-position pro">
          <div class="debate-position-header">${t('debate-pro')}</div>
          ${proArgs.map(arg => `
            <div class="debate-arg">
              <div class="debate-arg-point">${escapeHtml(arg.point)}</div>
              ${arg.evidence ? `<div class="debate-arg-evidence">${escapeHtml(arg.evidence)}</div>` : ''}
            </div>
          `).join('')}
        </div>

        <div class="debate-position con">
          <div class="debate-position-header">${t('debate-con')}</div>
          ${conArgs.map(arg => `
            <div class="debate-arg">
              <div class="debate-arg-point">${escapeHtml(arg.point)}</div>
              ${arg.evidence ? `<div class="debate-arg-evidence">${escapeHtml(arg.evidence)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      ${assessment.key_disagreement ? `
        <div class="debate-synthesis">
          <div class="debate-synthesis-header">${t('debate-synthesis')}</div>
          <div class="debate-synthesis-text">${escapeHtml(assessment.key_disagreement)}</div>
          ${assessment.overall_strength !== undefined ? `
            <div class="debate-strength">${t('debate-overall-strength')}: ${Math.round(assessment.overall_strength * 100)}%</div>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Check if card is a debate card
 */
export function isDebateCard(card: Card): boolean {
  return card.type === 'debate' || card.metadata?.debate_type === 'cognitive_debate';
}
