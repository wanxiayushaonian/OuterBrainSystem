// ═══════════════════════════════════════════════════════
// Context menus: canvas card, inbox card, connection
// ═══════════════════════════════════════════════════════
import { state, LABELS, getAllLabels, scheduleSave, pushUndo } from '../../core/types/state';
import { t, escapeHtml } from '../../i18n';
import { renderCanvas, renderConnections } from '../../features/canvas/renderer';
import { renderInbox } from '../../features/inbox/inbox';
import { showToast } from './toast';
import { quickInquiry, quickDebate } from '../../features/chat/panel';
import { solidifyConclusion } from '../../version/manager';
import { autoExpand, initModalTextarea } from '../utils/textarea';
import type { CardGroup } from '../../core/types/types';

let contextTarget: number | null = null;
let inboxContextTarget: number | null = null;
let connContextTarget: { from: number; to: number; label: string } | null = null;
let groupContextTarget: number | null = null;
let groupModalMode: 'create' | 'rename' = 'create';
let renameGroupId: number | null = null;

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

  // Show/hide group/ungroup/add-to-group/remove-from-group based on selection
  const groupItem = menu.querySelector('[data-action="ctx-group"]') as HTMLElement;
  const ungroupItem = menu.querySelector('[data-action="ctx-ungroup"]') as HTMLElement;
  const addToGroupItem = menu.querySelector('[data-action="ctx-add-to-group"]') as HTMLElement;
  const removeFromGroupItem = menu.querySelector('[data-action="ctx-remove-from-group"]') as HTMLElement;

  const selectedIds = [...state.selectedCards];
  const selectedInGroups = selectedIds.filter(sid => state.groups.some(g => g.cardIds.includes(sid)));
  const selectedNotInGroups = selectedIds.filter(sid => !state.groups.some(g => g.cardIds.includes(sid)));
  const allInGroup = selectedNotInGroups.length === 0 && selectedInGroups.length > 0;
  const noneInGroup = selectedInGroups.length === 0;

  // "Create Group" — 2+ cards selected and none already in a group
  groupItem.style.display = (state.selectedCards.size >= 2 && noneInGroup) ? '' : 'none';

  // "Remove from Group" — at least one selected card is in a group
  removeFromGroupItem.style.display = selectedInGroups.length > 0 ? '' : 'none';

  // "Ungroup" — all selected cards are in a group (dissolves their groups)
  ungroupItem.style.display = allInGroup ? '' : 'none';

  // "Add to Group" — at least one selected card is NOT in a group
  const submenu = document.getElementById('addToGroupSubmenu')!;
  // Show groups that don't contain ANY of the selected cards
  const availableGroups = state.groups.filter(g => !selectedIds.some(sid => g.cardIds.includes(sid)));
  if (selectedNotInGroups.length > 0 && availableGroups.length > 0) {
    addToGroupItem.style.display = '';
    submenu.innerHTML = availableGroups.map(g => {
      const count = g.cardIds.length;
      return `<div class="context-submenu-item" data-group-id="${g.id}">
        <span class="group-color-dot" style="background:${g.color}"></span>
        ${escapeHtml(g.name)} <span style="color:var(--muted);font-size:10px">(${count})</span>
      </div>`;
    }).join('');
  } else {
    addToGroupItem.style.display = 'none';
  }

  // Show/hide dock point items based on card's dockCount
  const card = state.cards.find(c => c.id === id);
  const dc = card?.dockCount ?? 1;
  const addDockItem = menu.querySelector('[data-action="ctx-add-dock"]') as HTMLElement;
  const removeDockItem = menu.querySelector('[data-action="ctx-remove-dock"]') as HTMLElement;
  if (addDockItem) addDockItem.style.display = dc >= 5 ? 'none' : '';
  if (removeDockItem) removeDockItem.style.display = dc <= 1 ? 'none' : '';

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

  // Dynamically build label list + delete option
  const labels = getAllLabels();
  const labelItems = labels.map(l => {
    const active = l === conn.label;
    return `<div class="context-menu-item${active ? ' active' : ''}" data-action="conn-select-label" data-label="${escapeHtml(l)}">
      ${active ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      <span>${escapeHtml(l)}</span>
    </div>`;
  }).join('');

  menu.innerHTML = labelItems
    + `<div class="context-menu-sep"></div>
       <div class="context-menu-item" data-action="conn-delete">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
         <span>${t('ctx-delete-conn')}</span>
       </div>`;

  // Position: keep menu within viewport
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.classList.add('show');

  // Adjust if overflowing bottom
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
      menu.style.top = (e.clientY - rect.height) + 'px';
    }
    if (rect.right > window.innerWidth) {
      menu.style.left = (e.clientX - rect.width) + 'px';
    }
  });
}

// ── Close all context menus ──
export function closeAllContextMenus(): void {
  document.getElementById('contextMenu')?.classList.remove('show');
  document.getElementById('inboxContextMenu')?.classList.remove('show');
  document.getElementById('connContextMenu')?.classList.remove('show');
  document.getElementById('groupContextMenu')?.classList.remove('show');
}

// ── Group creation / rename modal ──
export function openGroupModal(): void {
  groupModalMode = 'create';
  renameGroupId = null;
  const modal = document.getElementById('groupModal')!;
  modal.querySelector('h4')!.textContent = t('group-create-title') || '创建分组 Create Group';
  const input = document.getElementById('groupNameInput') as HTMLTextAreaElement;
  input.value = '';
  input.style.height = 'auto';
  input.placeholder = t('group-create-placeholder') || '如：核心论点…';
  modal.querySelector('.primary')!.textContent = t('btn-create') || '创建 Create';
  modal.classList.add('show');
  input?.focus();
}

export function openRenameGroupModal(groupId: number): void {
  const group = state.groups.find(g => g.id === groupId);
  if (!group) return;
  groupModalMode = 'rename';
  renameGroupId = groupId;
  const modal = document.getElementById('groupModal')!;
  modal.querySelector('h4')!.textContent = t('group-rename-title') || '重命名分组 Rename Group';
  const input = document.getElementById('groupNameInput') as HTMLTextAreaElement;
  input.value = group.name;
  input.style.height = 'auto';
  input.placeholder = t('group-rename-placeholder') || '输入新名称…';
  modal.querySelector('.primary')!.textContent = t('btn-rename') || '重命名 Rename';
  modal.classList.add('show');
  requestAnimationFrame(() => { autoExpand(input); });
  input?.focus();
  input?.select();
}

export function closeGroupModal(): void {
  document.getElementById('groupModal')!.classList.remove('show');
  const input = document.getElementById('groupNameInput') as HTMLTextAreaElement;
  input.value = '';
  input.style.height = 'auto';
  groupModalMode = 'create';
  renameGroupId = null;
}

export function confirmGroupModal(): void {
  const nameInput = document.getElementById('groupNameInput') as HTMLTextAreaElement;
  const name = nameInput?.value.trim() || t('group-unnamed') || '未命名分组';

  if (groupModalMode === 'rename' && renameGroupId !== null) {
    // Rename existing group
    closeGroupModal();
    pushUndo();
    const group = state.groups.find(g => g.id === renameGroupId);
    if (group) {
      group.name = name;
      renderCanvas();
      scheduleSave();
      showToast(t('toast-group-renamed') || '已重命名分组');
    }
    return;
  }

  // Create new group
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
    locked: false,
  };
  state.groups.push(group);
  renderCanvas();
  scheduleSave();
  showToast(t('toast-group-created') || '已创建分组');
}

// ── Canvas card context action ──
export function contextAction(action: string, param?: number): void {
  closeAllContextMenus();
  if (action === 'edit') {
    if (contextTarget === null) return;
    const card = state.cards.find(c => c.id === contextTarget);
    if (!card) return;
    const newText = prompt(t('edit-card'), card.text);
    if (newText !== null && newText.trim()) {
      pushUndo();
      card.text = newText.trim();
      renderCanvas();
      renderConnections();
      scheduleSave();
    }
  } else if (action === 'question') {
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
    pushUndo();
    const selectedIds = [...state.selectedCards];
    // Dissolve all groups that contain any selected card
    const affectedGroupIds = new Set(
      state.groups.filter(g => selectedIds.some(sid => g.cardIds.includes(sid))).map(g => g.id)
    );
    // Remove connections to/from dissolved groups
    const affectedNegIds = new Set([...affectedGroupIds].map(id => -id));
    state.connections = state.connections.filter(c => !affectedNegIds.has(c.from) && !affectedNegIds.has(c.to));
    state.groups = state.groups.filter(g => !affectedGroupIds.has(g.id));
    renderCanvas();
    scheduleSave();
    showToast(t('toast-group-dissolved') || '已解散分组');
  } else if (action === 'remove-from-group') {
    pushUndo();
    const selectedIds = [...state.selectedCards];
    for (const sid of selectedIds) {
      for (const g of state.groups) {
        g.cardIds = g.cardIds.filter(cid => cid !== sid);
      }
    }
    state.groups = state.groups.filter(g => g.cardIds.length > 0);
    renderCanvas();
    scheduleSave();
    showToast(t('toast-removed-from-group') || '已从分组中移除');
  } else if (action === 'add-to-group') {
    if (param === undefined) return;
    pushUndo();
    const group = state.groups.find(g => g.id === param);
    if (group) {
      for (const sid of state.selectedCards) {
        if (!group.cardIds.includes(sid)) {
          group.cardIds.push(sid);
        }
      }
      renderCanvas();
      scheduleSave();
      showToast(t('toast-added-to-group') || '已添加到分组');
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
  } else if (action === 'add-dock') {
    if (contextTarget === null) return;
    const card = state.cards.find(c => c.id === contextTarget);
    if (card) {
      pushUndo();
      card.dockCount = Math.min((card.dockCount ?? 1) + 1, 5);
      renderCanvas(); renderConnections(); scheduleSave();
    }
  } else if (action === 'remove-dock') {
    if (contextTarget === null) return;
    const card = state.cards.find(c => c.id === contextTarget);
    if (card) {
      pushUndo();
      card.dockCount = Math.max((card.dockCount ?? 1) - 1, 1);
      // Clear connections referencing removed dock indices
      const maxIdx = card.dockCount - 1;
      state.connections.forEach(conn => {
        if (conn.from === card.id) {
          const m = conn.fromPort?.match(/^(left|right)-(\d+)$/);
          if (m && parseInt(m[2]) > maxIdx) conn.fromPort = undefined;
        }
        if (conn.to === card.id) {
          const m = conn.toPort?.match(/^(left|right)-(\d+)$/);
          if (m && parseInt(m[2]) > maxIdx) conn.toPort = undefined;
        }
      });
      renderCanvas(); renderConnections(); scheduleSave();
    }
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
export function connContextAction(action: string, label?: string): void {
  closeAllContextMenus();
  if (!connContextTarget) return;
  if (action === 'select' && label) {
    pushUndo();
    const conn = state.connections.find(c => c === connContextTarget);
    if (conn) {
      conn.label = label;
      renderConnections();
      scheduleSave();
      showToast(label);
    }
  } else if (action === 'delete') {
    pushUndo();
    state.connections = state.connections.filter(c => c !== connContextTarget);
    renderConnections();
    scheduleSave();
    showToast(t('toast-conn-deleted'));
  }
  connContextTarget = null;
}

// ── Group context menu (right-click on group bounding box) ──
export function showGroupContextMenu(e: MouseEvent, groupId: number): void {
  closeAllContextMenus();
  groupContextTarget = groupId;
  const group = state.groups.find(g => g.id === groupId);
  if (!group) return;
  const menu = document.getElementById('groupContextMenu')!;

  // Show/hide nest/unnest based on group state
  const nestItem = menu.querySelector('[data-action="grp-nest"]') as HTMLElement;
  const unnestItem = menu.querySelector('[data-action="grp-unnest"]') as HTMLElement;

  // Populate "Nest into…" submenu with other groups (excluding self and descendants)
  const getDescendantIds = (gid: number): number[] => {
    const children = state.groups.filter(g => g.parentId === gid);
    let ids = children.map(g => g.id);
    for (const child of children) ids.push(...getDescendantIds(child.id));
    return ids;
  };
  const excludeIds = new Set([groupId, ...getDescendantIds(groupId)]);
  const otherGroups = state.groups.filter(g => !excludeIds.has(g.id));
  if (otherGroups.length > 0) {
    nestItem.style.display = '';
    const submenu = document.getElementById('nestGroupSubmenu')!;
    submenu.innerHTML = otherGroups.map(g => {
      const count = g.cardIds.length;
      return `<div class="context-submenu-item" data-nest-target="${g.id}">
        <span class="group-color-dot" style="background:${g.color}"></span>
        ${escapeHtml(g.name)} <span style="color:var(--muted);font-size:10px">(${count})</span>
      </div>`;
    }).join('');
  } else {
    nestItem.style.display = 'none';
  }

  unnestItem.style.display = group.parentId ? '' : 'none';

  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.classList.add('show');
}

export function groupContextAction(action: string, param?: number): void {
  closeAllContextMenus();
  if (groupContextTarget === null) return;
  const group = state.groups.find(g => g.id === groupContextTarget);
  if (!group) return;

  if (action === 'rename') {
    openRenameGroupModal(group.id);
  } else if (action === 'nest') {
    if (param === undefined) return;
    pushUndo();
    group.parentId = param;
    renderCanvas();
    renderConnections();
    scheduleSave();
    showToast(t('toast-group-nested') || '已嵌套分组');
  } else if (action === 'unnest') {
    pushUndo();
    delete group.parentId;
    renderCanvas();
    renderConnections();
    scheduleSave();
    showToast(t('toast-group-unnested') || '已取消嵌套');
  } else if (action === 'dissolve') {
    pushUndo();
    // Also unnest any children of this group
    state.groups.filter(g => g.parentId === group.id).forEach(g => { delete g.parentId; });
    // Remove connections to/from this group
    const negId = -group.id;
    state.connections = state.connections.filter(c => c.from !== negId && c.to !== negId);
    state.groups = state.groups.filter(g => g.id !== group.id);
    renderCanvas();
    renderConnections();
    scheduleSave();
    showToast(t('toast-group-dissolved') || '已解散分组');
  }
  groupContextTarget = null;
}

// ── Close capture panel (re-export) ──
export { closeCapture as closeCapturePanel } from '../../features/capture/capture';

// ── Init context menu delegated events ──
export function initContextMenu(): void {
  // Canvas context menu actions
  const contextMenu = document.getElementById('contextMenu');
  if (contextMenu) {
    contextMenu.addEventListener('click', (e: MouseEvent) => {
      // Submenu "Add to Group" click — must be checked first
      const subItem = (e.target as HTMLElement).closest('.context-submenu-item[data-group-id]') as HTMLElement | null;
      if (subItem) {
        const groupId = parseInt(subItem.dataset.groupId!, 10);
        if (!isNaN(groupId)) contextAction('add-to-group', groupId);
        return;
      }
      const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'ctx-edit') contextAction('edit');
      else if (action === 'ctx-question') contextAction('question');
      else if (action === 'ctx-set-question') contextAction('set-question');
      else if (action === 'ctx-conclude') contextAction('conclude');
      else if (action === 'ctx-delete') contextAction('delete');
      else if (action === 'ctx-group') contextAction('group');
      else if (action === 'ctx-ungroup') contextAction('ungroup');
      else if (action === 'ctx-remove-from-group') contextAction('remove-from-group');
      else if (action === 'ctx-debate') contextAction('debate');
      else if (action === 'ctx-to-inbox') contextAction('to-inbox');
      else if (action === 'ctx-add-dock') contextAction('add-dock');
      else if (action === 'ctx-remove-dock') contextAction('remove-dock');
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
      if (action === 'conn-select-label') {
        const label = target.dataset.label;
        if (label) connContextAction('select', label);
      } else if (action === 'conn-delete') {
        connContextAction('delete');
      }
    });
  }

  // Group context menu actions (right-click on group bounding box)
  const groupMenu = document.getElementById('groupContextMenu');
  if (groupMenu) {
    groupMenu.addEventListener('click', (e: MouseEvent) => {
      // Nest submenu click
      const nestItem = (e.target as HTMLElement).closest('.context-submenu-item[data-nest-target]') as HTMLElement | null;
      if (nestItem) {
        const targetId = parseInt(nestItem.dataset.nestTarget!, 10);
        if (!isNaN(targetId)) groupContextAction('nest', targetId);
        return;
      }
      const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'grp-rename') groupContextAction('rename');
      else if (action === 'grp-unnest') groupContextAction('unnest');
      else if (action === 'grp-dissolve') groupContextAction('dissolve');
    });
  }

  // Group creation modal
  const groupClose = document.getElementById('groupClose');
  const groupCreate = document.getElementById('groupCreate');
  groupClose?.addEventListener('click', closeGroupModal);
  groupCreate?.addEventListener('click', confirmGroupModal);
  initModalTextarea('groupNameInput', confirmGroupModal, closeGroupModal);
}
