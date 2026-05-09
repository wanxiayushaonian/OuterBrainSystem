// ═══════════════════════════════════════════════════════
// Inbox panel rendering and drag-to-canvas
// ═══════════════════════════════════════════════════════
import { state } from '../../core/types/state';
import { t } from '../../i18n';
import { semanticSearch } from '../chat/api';

// Semantic search state
let semanticResults: Set<number> | null = null;
let semanticMode = false;

export function setSemanticMode(on: boolean): void {
  semanticMode = on;
  if (!on) semanticResults = null;
}

export function isSemanticMode(): boolean {
  return semanticMode;
}

let _searchTimer: ReturnType<typeof setTimeout> | null = null;

export function triggerSemanticSearch(query: string): void {
  if (_searchTimer) clearTimeout(_searchTimer);
  if (!query.trim()) {
    semanticResults = null;
    renderInbox();
    return;
  }
  _searchTimer = setTimeout(async () => {
    try {
      const res = await semanticSearch(query, state.cards);
      semanticResults = new Set(res.results.map(r => r.id));
    } catch {
      semanticResults = null;
    }
    renderInbox();
  }, 800);
}

const SOURCE_ICONS: Record<string, string> = {
  '浏览器': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
  '笔记': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  'Slack': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z"/><path d="M20.5 10H19V8.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>',
};

const DEFAULT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>';

export function getSourceIcon(source: string): string {
  for (const [key, icon] of Object.entries(SOURCE_ICONS)) {
    if (source.includes(key)) return icon;
  }
  return DEFAULT_ICON;
}

export function renderInbox(): void {
  const list = document.getElementById('inboxList');
  const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
  if (!list) return;

  const search = (searchInput?.value || '').toLowerCase();
  const inboxCards = state.cards.filter(c => !c.inCanvas);
  let filtered;
  if (semanticMode && semanticResults && search) {
    // Semantic mode: filter by semantic results
    filtered = inboxCards.filter(c => semanticResults!.has(c.id));
  } else if (search) {
    // Text mode: simple text match
    filtered = inboxCards.filter(c => c.text.toLowerCase().includes(search));
  } else {
    filtered = inboxCards;
  }

  const countEl = document.getElementById('inboxCount');
  if (countEl) countEl.textContent = String(filtered.length);

  list.innerHTML = filtered.map(c => {
    const icon = getSourceIcon(c.source);
    const statusClass = c.status || '';
    return `<div class="inbox-card" draggable="true"
      data-id="${c.id}" data-action="inbox-card">
      <div class="inbox-card-source">${icon} ${c.source}</div>
      <div class="inbox-card-text">${c.text}</div>
      <div class="inbox-card-meta">${c.time}</div>
      ${statusClass ? `<div class="inbox-card-status ${statusClass}"></div>` : ''}
    </div>`;
  }).join('');
}

export function onInboxDragStart(e: DragEvent, id: number): void {
  e.dataTransfer!.setData('text/plain', String(id));
  (e.target as HTMLElement).classList.add('dragging');
}

export function onInboxDragEnd(e: DragEvent): void {
  (e.target as HTMLElement).classList.remove('dragging');
}
