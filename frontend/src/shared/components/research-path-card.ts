// ═══════════════════════════════════════════════════════
// Research Path Card Component
// Displays vertical stepper with steps, blind spots, and references
// ═══════════════════════════════════════════════════════
import type { Card } from '../../core/types/types';
import { state } from '../../core/types/state';
import { t } from '../../i18n';

export interface ResearchStep {
  title: string;
  description: string;
  status: 'completed' | 'in_progress' | 'pending';
}

export interface ResearchPathStructured {
  title: string;
  steps: ResearchStep[];
  current_step: number;
  current_state?: { summary?: string; key_findings?: string[]; confidence_level?: number };
  blind_spots?: Array<{ area: string; importance: string; suggestion: string }>;
  references?: Array<{ topic: string; reason: string }>;
}

export interface ResearchPathFlat {
  step?: number;
  action: string;
  priority: string;
  estimated_effort?: string;
}

export interface ResearchPathMetadata {
  research_path?: ResearchPathStructured | ResearchPathFlat[];
  // Backward compat flat keys
  research_path_type?: string;
  topic?: string;
  current_state?: { summary?: string; key_findings?: string[]; confidence_level?: number };
  blind_spots?: Array<{ area: string; importance: string; suggestion: string }>;
  references?: Array<{ topic: string; reason: string }>;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Render research path card content
 */
export function renderResearchPathCard(card: Card, container: HTMLElement): void {
  if (!isResearchPathCard(card) || !card.metadata) return;

  const meta = card.metadata as ResearchPathMetadata;

  // Structured format (new)
  if (meta.research_path && !Array.isArray(meta.research_path) && 'steps' in meta.research_path) {
    renderStructured(meta.research_path as ResearchPathStructured, container, card.id);
    return;
  }

  // Backward compat: flat keys
  renderFlat(meta, container, card.id);
}

function renderStructured(rp: ResearchPathStructured, container: HTMLElement, cardId: number): void {
  const steps = rp.steps || [];
  const blindSpots = rp.blind_spots || [];
  const references = rp.references || [];
  const currentState = rp.current_state || {};

  container.innerHTML = `
    <div class="research-card">
      <div class="research-title">${escapeHtml(rp.title)}</div>

      ${currentState.summary ? `
        <div class="research-current-state">
          <div class="research-state-label">${escapeHtml(currentState.summary)}</div>
          ${currentState.confidence_level !== undefined ? `
            <div class="research-confidence">
              <div class="research-confidence-bar">
                <div class="research-confidence-fill" style="width: ${currentState.confidence_level * 100}%"></div>
              </div>
              <span class="research-confidence-text">${Math.round(currentState.confidence_level * 100)}%</span>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <div class="research-stepper">
        ${steps.map((step, idx) => `
          <div class="research-step ${idx === rp.current_step ? 'current' : ''}">
            <div class="research-step-indicator ${step.status}">
              ${step.status === 'completed' ? '✓' : idx === rp.current_step ? '●' : '○'}
            </div>
            ${idx < steps.length - 1 ? '<div class="research-step-line"></div>' : ''}
            <div class="research-step-content">
              <div class="research-step-title">${escapeHtml(step.title)}</div>
              <div class="research-step-desc">${escapeHtml(step.description)}</div>
              <div class="research-step-status">${t(`research-step-${step.status}`)}</div>
            </div>
          </div>
        `).join('')}
      </div>

      ${blindSpots.length > 0 ? `
        <div class="research-blind-spots">
          <div class="research-section-header">${t('research-blind-spots')}</div>
          ${blindSpots.map(bs => `
            <div class="research-bs-item">
              <span class="research-bs-badge ${bs.importance}">${bs.importance}</span>
              <div class="research-bs-area">${escapeHtml(bs.area)}</div>
              <div class="research-bs-suggestion">${escapeHtml(bs.suggestion)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${references.length > 0 ? `
        <div class="research-references">
          <div class="research-section-header">${t('research-references')}</div>
          ${references.map(ref => `
            <div class="research-ref-item">
              <span class="research-ref-topic">${escapeHtml(ref.topic)}</span>
              <span class="research-ref-reason">${escapeHtml(ref.reason)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <button class="research-export-btn" data-card-id="${cardId}">${t('research-export-md')}</button>
    </div>
  `;

  if (!state.galleryMode) attachExportListener(cardId, rp);
}

function renderFlat(meta: ResearchPathMetadata, container: HTMLElement, cardId: number): void {
  const steps: ResearchPathFlat[] = Array.isArray(meta.research_path) ? meta.research_path : [];
  const blindSpots = meta.blind_spots || [];
  const references = meta.references || [];
  const currentState = meta.current_state || {};

  container.innerHTML = `
    <div class="research-card">
      <div class="research-title">${escapeHtml(meta.topic || '')}</div>

      ${currentState.summary ? `
        <div class="research-current-state">
          <div class="research-state-label">${escapeHtml(currentState.summary)}</div>
          ${currentState.confidence_level !== undefined ? `
            <div class="research-confidence">
              <div class="research-confidence-bar">
                <div class="research-confidence-fill" style="width: ${currentState.confidence_level * 100}%"></div>
              </div>
              <span class="research-confidence-text">${Math.round(currentState.confidence_level * 100)}%</span>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <div class="research-stepper">
        ${steps.map((step, idx) => `
          <div class="research-step">
            <div class="research-step-indicator pending">○</div>
            ${idx < steps.length - 1 ? '<div class="research-step-line"></div>' : ''}
            <div class="research-step-content">
              <div class="research-step-title">${escapeHtml(step.action)}</div>
              <div class="research-step-desc">${escapeHtml(step.priority)}${step.estimated_effort ? ` · ${step.estimated_effort}` : ''}</div>
            </div>
          </div>
        `).join('')}
      </div>

      ${blindSpots.length > 0 ? `
        <div class="research-blind-spots">
          <div class="research-section-header">${t('research-blind-spots')}</div>
          ${blindSpots.map(bs => `
            <div class="research-bs-item">
              <span class="research-bs-badge ${bs.importance}">${bs.importance}</span>
              <div class="research-bs-area">${escapeHtml(bs.area)}</div>
              <div class="research-bs-suggestion">${escapeHtml(bs.suggestion)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${references.length > 0 ? `
        <div class="research-references">
          <div class="research-section-header">${t('research-references')}</div>
          ${references.map(ref => `
            <div class="research-ref-item">
              <span class="research-ref-topic">${escapeHtml(ref.topic)}</span>
              <span class="research-ref-reason">${escapeHtml(ref.reason)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <button class="research-export-btn" data-card-id="${cardId}">${t('research-export-md')}</button>
    </div>
  `;

  if (!state.galleryMode) attachExportListener(cardId, { title: meta.topic || '', steps: [], blind_spots: blindSpots, references });
}

function attachExportListener(cardId: number, data: { title: string; steps?: ResearchStep[]; blind_spots?: Array<{ area: string; importance: string; suggestion: string }>; references?: Array<{ topic: string; reason: string }> }): void {
  const btn = document.querySelector(`.research-export-btn[data-card-id="${cardId}"]`);
  if (!btn) return;

  btn.addEventListener('click', () => {
    let md = `# ${data.title}\n\n`;

    if (data.steps && data.steps.length > 0) {
      md += `## Steps\n\n`;
      data.steps.forEach((step, i) => {
        const status = step.status === 'completed' ? '[x]' : step.status === 'in_progress' ? '[>]' : '[ ]';
        md += `${i + 1}. ${status} **${step.title}**\n   ${step.description}\n\n`;
      });
    }

    if (data.blind_spots && data.blind_spots.length > 0) {
      md += `## Blind Spots\n\n`;
      data.blind_spots.forEach(bs => {
        md += `- **[${bs.importance}]** ${bs.area}\n  - ${bs.suggestion}\n`;
      });
      md += '\n';
    }

    if (data.references && data.references.length > 0) {
      md += `## References\n\n`;
      data.references.forEach(ref => {
        md += `- **${ref.topic}**: ${ref.reason}\n`;
      });
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `research-path-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

/**
 * Check if card is a research path card
 */
export function isResearchPathCard(card: Card): boolean {
  return card.type === 'research_path' || card.metadata?.research_path_type === 'research_brief';
}
