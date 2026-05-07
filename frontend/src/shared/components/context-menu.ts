// ═══════════════════════════════════════════════════════
// Context menus: canvas card, inbox card, connection
// ═══════════════════════════════════════════════════════
import { state, LABELS, scheduleSave, pushUndo } from '../../core/types/state';
import { t } from '../../i18n';
import { renderCanvas, renderConnections, cycleLabel } from '../../features/canvas/renderer';
import { renderInbox } from '../../features/inbox/inbox';
import { showToast } from './toast';
import { quickInquiry, quickDebate } from '../../features/chat/panel';
import { solidifyConclusion } from '../../version/manager';
import type { CardGroup } from '../../core/types/types';

let contextTarget: number | null = null;
let inboxContextTarget: number | null = null;
let connContextTarget: { from: number; to: number; label: string } | null = null;

// ── Canvas card context menu ──
export function showCanvasContextMenu(e: MouseEvent, id: number): void {
  closeAllContextMenus();
  if (!state.selectedCards.has(id)) {
    state.selectedCards.clear();
    state.selectedCards.add(id);
    renderCanvas();
  }
  contextTarget = id;
  const menu = document.getElementById('contextMenu')!;

  // Show/hide group/ungroup based on selection
  const groupItem = menu.querySelector('[data-action="ctx-group"]') as HTMLElement;
  const ungroupItem = menu.querySelector('[data-action="ctx-ungroup"]') as HTMLElement;
  const inGroup = state.groups.find(g => g.cardIds.includes(id));
  if (state.selectedCards.size >= 2 && !inGroup) {
    groupItem.style.display = '';
    ungroupItem.style.display = 'none';
  } else if (inGroup) {
    groupItem.style.display = 'none';
    ungroupItem.style.display = '';
  } else {
    groupItem.style.display = 'none';
    ungroupItem.style.display = 'none';
  }

  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.classList.add('show');
}

// ── Inbox card context menu ──
export function showInboxContextMenu(e: MouseEvent, id: number): void {
  closeAllContextMenus();
  inboxContextTarget = id;
  const menu = document.getElementById('inboxContextMenu')!;
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.classList.add('show');
}

// ── Connection context menu ──
export function showConnContextMenu(e: MouseEvent, conn: { from: number; to: number; label: string }): void {
  closeAllContextMenus();
  connContextTarget = conn;
  const menu = document.getElementById('connContextMenu')!;
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.classList.add('show');
}

// ── Close all context menus ──
export function closeAllContextMenus(): void {
  document.getElementById('contextMenu')?.classList.remove('show');
  document.getElementById('inboxContextMenu')?.classList.remove('show');
  document.getElementById('connContextMenu')?.classList.remove('show');
}

// ── Group creation modal ──
export function openGroupModal(): void {
  document.getElementById('groupModal')!.classList.add('show');
  (document.getElementById('groupNameInput') as HTMLInputElement)?.focus();
}

export function closeGroupModal(): void {
  document.getElementById('groupModal')!.classList.remove('show');
  (document.getElementById('groupNameInput') as HTMLInputElement).value = '';
}

export function confirmGroupModal(): void {
  const nameInput = document.getElementById('groupNameInput') as HTMLInputElement;
  const name = nameInput?.value.trim() || t('group-unnamed') || '未命名分组';
  closeGroupModal();
  pushUndo();
  const colors = [
    'oklch(90% 0.04 255 / 0.25)',
    'oklch(90% 0.04 145 / 0.25)',
    'oklch(90% 0.04 75 / 0.25)',
    'oklch(90% 0.04 300 / 0.25)',
    'oklch(90% 0.04 35 / 0.25)',
  ];
  const group: CardGroup = {
    id: state.nextGroupId++,
    name,
    cardIds: [...state.selectedCards],
    color: colors[state.groups.length % colors.length],
    collapsed: false,
  };
  state.groups.push(group);
  renderCanvas();
  scheduleSave();
  showToast(t('toast-group-created') || '已创建分组');
}

// ── Canvas card context action ──
export function contextAction(action: string): void {
  closeAllContextMenus();
  if (action === 'question') {
    quickInquiry();
  } else if (action === 'set-question') {
    if (contextTarget === null) return;
    const card = state.cards.find(c => c.id === contextTarget);
    if (!card) return;
    const q = prompt(t('enter-open-question') || '输入开放问题 Enter open question:', card.openQuestion || '');
    if (q !== null) {
      pushUndo();
      card.openQuestion = q.trim() || undefined;
      renderCanvas();
      scheduleSave();
    }
  } else if (action === 'conclude') {
    solidifyConclusion();
  } else if (action === 'debate') {
    quickDebate();
  } else if (action === 'group') {
    if (state.selectedCards.size < 2) return;
    openGroupModal();
  } else if (action === 'ungroup') {
    if (contextTarget === null) return;
    pushUndo();
    const gi = state.groups.findIndex(g => g.cardIds.includes(contextTarget!));
    if (gi !== -1) {
      state.groups.splice(gi, 1);
      renderCanvas();
      scheduleSave();
      showToast(t('toast-group-dissolved') || '已解散分组');
    }
  } else if (action === 'to-inbox') {
    pushUndo();
    state.selectedCards.forEach(id => {
      const card = state.cards.find(c => c.id === id);
      if (card) {
        card.inCanvas = false;
        card.x = 0;
        card.y = 0;
        state.connections = state.connections.filter(c => c.from !== id && c.to !== id);
        state.groups.forEach(g => { g.cardIds = g.cardIds.filter(cid => cid !== id); });
        state.groups = state.groups.filter(g => g.cardIds.length > 0);
      }
    });
    state.selectedCards.clear();
    renderCanvas();
    renderConnections();
    renderInbox();
    scheduleSave();
    showToast(t('toast-to-inbox') || '已回收到收件箱');
  } else if (action === 'delete') {
    pushUndo();
    state.selectedCards.forEach(id => {
      state.cards = state.cards.filter(c => c.id !== id);
      state.connections = state.connections.filter(c => c.from !== id && c.to !== id);
    });
    state.selectedCards.clear();
    renderCanvas();
    renderConnections();
    renderInbox();
    scheduleSave();
    showToast(t('toast-deleted'));
  }
}

// ── Inbox card context action ──
export function inboxContextAction(action: string): void {
  closeAllContextMenus();
  if (inboxContextTarget === null) return;
  if (action === 'toCanvas') {
    pushUndo();
    const card = state.cards.find(c => c.id === inboxContextTarget);
    if (card) {
      card.inCanvas = true;
      card.x = 200 + Math.random() * 400;
      card.y = 150 + Math.random() * 300;
      renderInbox();
      renderCanvas();
      showToast(t('toast-moved'));
    }
  } else if (action === 'delete') {
    pushUndo();
    state.cards = state.cards.filter(c => c.id !== inboxContextTarget);
    renderInbox();
    showToast(t('toast-deleted'));
  }
  inboxContextTarget = null;
}

// ── Connection context action ──
export function connContextAction(action: string): void {
  closeAllContextMenus();
  if (!connContextTarget) return;
  if (action === 'cycle') {
    pushUndo();
    const conn = state.connections.find(c => c === connContextTarget);
    if (conn) cycleLabel(conn);
  } else if (action === 'delete') {
    pushUndo();
    state.connections = state.connections.filter(c => c !== connContextTarget);
    renderConnections();
    scheduleSave();
    showToast(t('toast-conn-deleted'));
  }
  connContextTarget = null;
}

// ── Close capture panel (re-export) ──
export { closeCapture as closeCapturePanel } from '../../features/capture/capture';

// ── Init context menu delegated events ──
export function initContextMenu(): void {
  // Canvas context menu actions
  const contextMenu = document.getElementById('contextMenu');
  if (contextMenu) {
    contextMenu.addEventListener('click', (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'ctx-question') contextAction('question');
      else if (action === 'ctx-set-question') contextAction('set-question');
      else if (action === 'ctx-conclude') contextAction('conclude');
      else if (action === 'ctx-delete') contextAction('delete');
      else if (action === 'ctx-group') contextAction('group');
      else if (action === 'ctx-ungroup') contextAction('ungroup');
      else if (action === 'ctx-debate') contextAction('debate');
      else if (action === 'ctx-to-inbox') contextAction('to-inbox');
    });
  }

  // Inbox context menu actions
  const inboxMenu = document.getElementById('inboxContextMenu');
  if (inboxMenu) {
    inboxMenu.addEventListener('click', (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'inbox-to-canvas') inboxContextAction('toCanvas');
      else if (action === 'inbox-delete') inboxContextAction('delete');
    });
  }

  // Connection context menu actions
  const connMenu = document.getElementById('connContextMenu');
  if (connMenu) {
    connMenu.addEventListener('click', (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'conn-cycle') connContextAction('cycle');
      else if (action === 'conn-delete') connContextAction('delete');
    });
  }

  // Group creation modal
  const groupClose = document.getElementById('groupClose');
  const groupCreate = document.getElementById('groupCreate');
  const groupNameInput = document.getElementById('groupNameInput') as HTMLInputElement | null;
  groupClose?.addEventListener('click', closeGroupModal);
  groupCreate?.addEventListener('click', confirmGroupModal);
  groupNameInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmGroupModal(); }
    if (e.key === 'Escape') closeGroupModal();
  });
}
