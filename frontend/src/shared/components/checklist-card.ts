// ═══════════════════════════════════════════════════════
// Checklist Card Component
// Displays a checklist with toggleable items
// ═══════════════════════════════════════════════════════
import type { Card } from '../../core/types/types';
import { state, scheduleSave } from '../../core/types/state';
import { renderCanvas } from '../../features/canvas/renderer';

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export interface ChecklistMetadata {
  checklist: ChecklistItem[];
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function renderChecklistCard(card: Card, container: HTMLElement): void {
  if (!isChecklistCard(card) || !card.metadata) return;

  const meta = card.metadata as ChecklistMetadata;
  const items = meta.checklist || [];
  const doneCount = items.filter(i => i.done).length;

  container.innerHTML = `
    <div class="checklist-card">
      <div class="checklist-header">
        <span class="checklist-title">${escapeHtml(card.text)}</span>
        <span class="checklist-count">${doneCount}/${items.length}</span>
      </div>
      <div class="checklist-items">
        ${items.map((item, idx) => `
          <div class="checklist-item ${item.done ? 'done' : ''}" data-idx="${idx}">
            <span class="checklist-check">${item.done ? '☑' : '☐'}</span>
            <span class="checklist-text">${escapeHtml(item.text)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Toggle item on click (skip in gallery mode — read-only preview)
  if (state.galleryMode) return;
  container.querySelectorAll('.checklist-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt((el as HTMLElement).dataset.idx!, 10);
      if (isNaN(idx) || !card.metadata) return;
      const items = (card.metadata as ChecklistMetadata).checklist;
      if (!items || !items[idx]) return;
      items[idx].done = !items[idx].done;
      scheduleSave();
      renderChecklistCard(card, container);
      renderCanvas();
    });
  });
}

export function isChecklistCard(card: Card): boolean {
  return card.type === 'checklist';
}
