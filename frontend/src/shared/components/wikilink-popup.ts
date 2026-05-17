// ═══════════════════════════════════════════════════════
// Wikilink [[ Search Popup
// Shows card search dropdown when user types [[ in textarea
// ═══════════════════════════════════════════════════════
import { state } from '../../core/types/state';
import { t } from '../../i18n';

let popupEl: HTMLElement | null = null;
let selectedIndex = 0;
let startOffset = 0; // position of [[ in textarea
let activeTextarea: HTMLTextAreaElement | null = null;
let matchedCards: Array<{ id: number; text: string }> = [];

const MAX_RESULTS = 8;

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function getQuery(textarea: HTMLTextAreaElement): { query: string; start: number } | null {
  const pos = textarea.selectionStart;
  const text = textarea.value.slice(0, pos);
  const idx = text.lastIndexOf('[[');
  if (idx === -1) return null;
  // Check there's no closing ]] between [[ and cursor
  const between = text.slice(idx + 2);
  if (between.includes(']]')) return null;
  return { query: between, start: idx };
}

function filterCards(query: string): Array<{ id: number; text: string }> {
  const q = query.toLowerCase().trim();
  return state.cards
    .filter(c => {
      if (!q) return true;
      return c.text.toLowerCase().includes(q) || String(c.id).includes(q);
    })
    .slice(0, MAX_RESULTS)
    .map(c => ({ id: c.id, text: c.text }));
}

function renderPopup(): void {
  if (!popupEl) return;
  const items = matchedCards.map((card, idx) => {
    const selected = idx === selectedIndex ? 'selected' : '';
    return `<div class="wikilink-popup-item ${selected}" data-idx="${idx}" data-id="${card.id}">
      <span class="wikilink-popup-id">#${card.id}</span>
      <span class="wikilink-popup-text">${escapeHtml(truncate(card.text, 40))}</span>
    </div>`;
  }).join('');

  popupEl.innerHTML = items || `<div class="wikilink-popup-empty">${t('outline-empty')}</div>`;
}

function positionPopup(textarea: HTMLTextAreaElement): void {
  if (!popupEl) return;
  // Position below the textarea cursor
  const rect = textarea.getBoundingClientRect();
  // Approximate: place popup below textarea, left-aligned
  popupEl.style.top = `${rect.bottom + 4}px`;
  popupEl.style.left = `${rect.left}px`;
  popupEl.style.minWidth = `${Math.max(rect.width, 200)}px`;
}

function showPopup(textarea: HTMLTextAreaElement, query: string): void {
  hidePopup();
  activeTextarea = textarea;
  startOffset = textarea.value.slice(0, textarea.selectionStart).lastIndexOf('[[');
  matchedCards = filterCards(query);
  selectedIndex = 0;

  popupEl = document.createElement('div');
  popupEl.className = 'wikilink-popup';
  document.body.appendChild(popupEl);
  positionPopup(textarea);
  renderPopup();

  // Click on items
  popupEl.addEventListener('mousedown', (e) => {
    e.preventDefault(); // prevent textarea blur
    const item = (e.target as HTMLElement).closest('.wikilink-popup-item') as HTMLElement | null;
    if (item) {
      const id = parseInt(item.dataset.id || '0');
      if (id) insertWikilink(id);
    }
  });
}

function hidePopup(): void {
  if (popupEl) {
    popupEl.remove();
    popupEl = null;
  }
  activeTextarea = null;
  matchedCards = [];
  selectedIndex = 0;
}

function insertWikilink(cardId: number): void {
  if (!activeTextarea) return;
  const textarea = activeTextarea;
  const pos = textarea.selectionStart;
  const before = textarea.value.slice(0, startOffset);
  const after = textarea.value.slice(pos);
  const insertion = `[[${cardId}]]`;
  textarea.value = before + insertion + after;
  const newPos = before.length + insertion.length;
  textarea.setSelectionRange(newPos, newPos);
  textarea.focus();
  hidePopup();
}

function handleKeydown(e: KeyboardEvent): void {
  if (!popupEl || !activeTextarea) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, matchedCards.length - 1);
    renderPopup();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    renderPopup();
  } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
    if (matchedCards.length > 0) {
      e.preventDefault();
      insertWikilink(matchedCards[selectedIndex].id);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hidePopup();
  }
}

function handleInput(textarea: HTMLTextAreaElement): void {
  const result = getQuery(textarea);
  if (result) {
    matchedCards = filterCards(result.query);
    if (matchedCards.length > 0) {
      if (!popupEl) {
        showPopup(textarea, result.query);
      } else {
        selectedIndex = 0;
        renderPopup();
      }
    } else {
      hidePopup();
    }
  } else {
    hidePopup();
  }
}

/**
 * Initialize wikilink popup on a textarea element.
 * Call this after initModalTextarea.
 */
export function initWikilinkPopup(textarea: HTMLTextAreaElement): void {
  textarea.addEventListener('input', () => handleInput(textarea));
  textarea.addEventListener('keydown', handleKeydown);
  textarea.addEventListener('blur', () => {
    // Delay hide to allow click on popup
    setTimeout(hidePopup, 200);
  });
}
