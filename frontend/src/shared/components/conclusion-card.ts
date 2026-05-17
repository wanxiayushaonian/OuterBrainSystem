// ═══════════════════════════════════════════════════════
// Conclusion Card Component
// Displays solidified conclusions with chain references
// ═══════════════════════════════════════════════════════
import type { Card } from '../../core/types/types';
import { state } from '../../core/types/state';

function escapeHtml(str: string | null | undefined): string {
  return (str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatCardText(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/^### (.+)$/gm, '<strong style="font-size:12px">$1</strong>');
  html = html.replace(/^## (.+)$/gm, '<strong style="font-size:13px">$1</strong>');
  html = html.replace(/^# (.+)$/gm, '<strong style="font-size:14px">$1</strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.+?)`/g, '<code style="font:11px/1 var(--font-mono);background:var(--bg);padding:1px 4px;border-radius:3px">$1</code>');
  html = html.replace(/^[-*] (.+)$/gm, '• $1');
  html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:6px 0">');
  // Markdown tables
  html = html.replace(/((?:^\|.+\|$\n?)+)/gm, (tableBlock) => {
    const rows = tableBlock.trim().split('\n').filter(r => r.trim());
    if (rows.length < 2) return tableBlock;
    const sepIdx = rows.findIndex(r => /^\|(?:[\s\-:]*-[\s\-:]*\|)+$/.test(r.trim()));
    if (sepIdx < 0) return tableBlock;
    const parseCells = (row: string): string[] => row.split('|').slice(1, -1).map(c => c.trim());
    const headers = parseCells(rows[0]);
    const bodyRows = rows.slice(sepIdx + 1).map(parseCells);
    const thead = `<thead><tr>${headers.map(h => `<th style="font-size:11px;padding:3px 6px;border:1px solid var(--border);background:var(--bg)">${h}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${bodyRows.map(r => `<tr>${r.map(c => `<td style="font-size:11px;padding:3px 6px;border:1px solid var(--border)">${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
    return `<table style="border-collapse:collapse;margin:4px 0;font-size:11px">${thead}${tbody}</table>`;
  });
  // Card references (#53)
  html = html.replace(/(?<!\w)#(\d+)/g, (_match, id) => {
    const card = state.cards.find(c => c.id === parseInt(id));
    const label = card ? escapeHtml(card.text.slice(0, 30)) : `卡片 #${id}`;
    return `<span class="card-ref" data-ref-id="${id}" title="${label}">#${id}</span>`;
  });
  html = html.replace(/\n/g, '<br>');
  return html;
}

export function renderConclusionCard(card: Card, container: HTMLElement): void {
  const hasChain = card.chainIds && card.chainIds.length > 0;

  container.innerHTML = `
    <div class="conclusion-card">
      <div class="conclusion-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <span>结论</span>
      </div>
      <div class="conclusion-title">${formatCardText(card.text)}</div>
      ${card.summary ? `<div class="conclusion-summary">${formatCardText(card.summary)}</div>` : ''}
      ${hasChain ? `
        <div class="conclusion-chain">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          <span class="chain-count">${card.chainIds!.length} 条关联</span>
        </div>
      ` : ''}
      ${card.keywords && card.keywords.length > 0 ? `
        <div class="conclusion-keywords">
          ${card.keywords.map(kw =>
            `<span class="conclusion-keyword">${escapeHtml(kw)}</span>`
          ).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

export function isConclusionCard(card: Card): boolean {
  return card.type === 'conclusion';
}
