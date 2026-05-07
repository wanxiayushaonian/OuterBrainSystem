// ═══════════════════════════════════════════════════════
// Flow Analysis Card Component
// Displays flow/process analysis with stages and insights
// ═══════════════════════════════════════════════════════
import type { Card } from '../../core/types/types';

export interface FlowStage {
  name: string;
  description: string;
  insights?: string[];
  issues?: string[];
}

export interface FlowAnalysisMetadata {
  flow_type: string; // e.g., "process", "argument", "causal"
  stages: FlowStage[];
  overall_insight?: string;
  reasoning?: string;
}

/**
 * Render flow analysis card content
 */
export function renderFlowAnalysisCard(card: Card, container: HTMLElement): void {
  if (card.type !== 'flow_analysis' || !card.metadata) {
    return;
  }

  const metadata = card.metadata as FlowAnalysisMetadata;

  container.innerHTML = `
    <div class="flow-card">
      <div class="flow-title">${escapeHtml(card.text)}</div>

      <div class="flow-type">
        <span class="flow-type-label">流程类型：</span>
        <span class="flow-type-value">${escapeHtml(metadata.flow_type)}</span>
      </div>

      <div class="flow-stages">
        ${metadata.stages.map((stage, idx) => `
          <div class="flow-stage">
            <div class="stage-header">
              <span class="stage-number">${idx + 1}</span>
              <span class="stage-name">${escapeHtml(stage.name)}</span>
            </div>
            <div class="stage-description">${escapeHtml(stage.description)}</div>
            ${stage.insights && stage.insights.length > 0 ? `
              <div class="stage-insights">
                <div class="insights-label">💡 洞察：</div>
                <ul class="insights-list">
                  ${stage.insights.map(insight =>
                    `<li>${escapeHtml(insight)}</li>`
                  ).join('')}
                </ul>
              </div>
            ` : ''}
            ${stage.issues && stage.issues.length > 0 ? `
              <div class="stage-issues">
                <div class="issues-label">⚠️ 问题：</div>
                <ul class="issues-list">
                  ${stage.issues.map(issue =>
                    `<li>${escapeHtml(issue)}</li>`
                  ).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
          ${idx < metadata.stages.length - 1 ? '<div class="flow-arrow">↓</div>' : ''}
        `).join('')}
      </div>

      ${metadata.overall_insight ? `
        <div class="flow-overall">
          <div class="overall-label">整体洞察：</div>
          <div class="overall-text">${escapeHtml(metadata.overall_insight)}</div>
        </div>
      ` : ''}

      ${metadata.reasoning ? `
        <details class="flow-reasoning">
          <summary>分析理由</summary>
          <div class="reasoning-text">${escapeHtml(metadata.reasoning)}</div>
        </details>
      ` : ''}
    </div>
  `;
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
 * Check if card is a flow analysis card
 */
export function isFlowAnalysisCard(card: Card): boolean {
  return card.type === 'flow_analysis';
}
