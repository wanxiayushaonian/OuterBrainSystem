// ═══════════════════════════════════════════════════════
// Settings panel: language, label management, shortcuts, draggable
// ═══════════════════════════════════════════════════════
import { state, LABELS, LABEL_PRESETS, scheduleSave, pushUndo } from '../../core/types/state';
import { setLang, t, escapeHtml } from '../../i18n';
import { showToast } from './toast';
import { updateTimeline } from '../../version/manager';
import { renderCanvas, renderConnections } from '../../features/canvas/renderer';
import { renderInbox } from '../../features/inbox/inbox';
import type { LangCode } from '../../core/types/types';

function renderPacks(): void {
  const container = document.getElementById('tweaksPacks');
  if (!container) return;

  // Built-in packs
  const builtIn = Object.entries(LABEL_PRESETS).map(([id, pack]) => {
    const active = state.activeLabelPacks.includes(id);
    return `<label class="tweaks-pack-item${active ? ' active' : ''}" data-pack="${id}">
      <input type="checkbox" ${active ? 'checked' : ''} data-pack="${id}"/>
      <span class="tweaks-pack-name">${escapeHtml(pack.name)}</span>
      <span class="tweaks-pack-count">${pack.labels.length}</span>
    </label>`;
  }).join('');

  // Custom packs
  const custom = Object.entries(state.customLabelPacks).map(([id, pack]) => {
    const active = state.activeLabelPacks.includes(id);
    return `<label class="tweaks-pack-item custom${active ? ' active' : ''}" data-pack="${id}">
      <input type="checkbox" ${active ? 'checked' : ''} data-pack="${id}"/>
      <span class="tweaks-pack-name">${escapeHtml(pack.name)}</span>
      <span class="tweaks-pack-count">${pack.labels.length}</span>
      <span class="pack-delete" data-delete-pack="${id}" title="${t('btn-delete') || '删除'}">&times;</span>
    </label>`;
  }).join('');

  container.innerHTML = builtIn + custom
    + `<button class="tweaks-add-pack-btn" id="addPackBtn">+ ${t('btn-new-pack') || '新建关系包'}</button>`;
}

function renderLabels(): void {
  const container = document.getElementById('tweaksLabels');
  if (!container) return;

  // Show labels from active packs (built-in + custom packs)
  const packLabels: string[] = [];
  for (const packId of state.activeLabelPacks) {
    const pack = LABEL_PRESETS[packId] || state.customLabelPacks[packId];
    if (pack) packLabels.push(...pack.labels);
  }
  const uniquePackLabels = [...new Set(packLabels)];

  const builtIn = uniquePackLabels.map(l =>
    `<span class="tweaks-label-chip builtin">${l}</span>`
  ).join('');

  const custom = state.customLabels.map((l, i) =>
    `<span class="tweaks-label-chip">${l}<span class="label-remove" data-idx="${i}">&times;</span></span>`
  ).join('');

  container.innerHTML = builtIn + custom;
}

export function toggleTweaks(): void {
  document.getElementById('tweaksPanel')!.classList.toggle('open');
}

function switchTab(tabName: string): void {
  const panel = document.getElementById('tweaksPanel');
  if (!panel) return;

  panel.querySelectorAll('.settings-tab').forEach(btn => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.tab === tabName);
  });
  panel.querySelectorAll('.settings-tab-content').forEach(content => {
    content.classList.toggle('active', (content as HTMLElement).dataset.tab === tabName);
  });
}

export function initTweaks(): void {
  // Tab switching
  const tabsContainer = document.getElementById('settingsTabs');
  if (tabsContainer) {
    tabsContainer.addEventListener('click', (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('.settings-tab') as HTMLElement | null;
      if (btn && btn.dataset.tab) {
        switchTab(btn.dataset.tab);
        if (btn.dataset.tab === 'labels') { renderPacks(); renderLabels(); }
      }
    });
  }

  // Language buttons
  const langGroup = document.getElementById('tweaksLangGroup');
  if (langGroup) {
    langGroup.addEventListener('click', (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('button') as HTMLElement | null;
      if (btn && btn.dataset.lang) {
        setLang(btn.dataset.lang as LangCode);
      }
    });
  }

  // Tweaks FAB
  const fab = document.getElementById('tweaksFab');
  fab?.addEventListener('click', () => {
    toggleTweaks();
    renderPacks();
    renderLabels();
  });

  // Pack toggles
  const packsContainer = document.getElementById('tweaksPacks');
  packsContainer?.addEventListener('change', (e: Event) => {
    const cb = e.target as HTMLInputElement;
    if (!cb.dataset.pack) return;
    const packId = cb.dataset.pack;
    if (cb.checked) {
      if (!state.activeLabelPacks.includes(packId)) state.activeLabelPacks.push(packId);
    } else {
      state.activeLabelPacks = state.activeLabelPacks.filter(p => p !== packId);
      // Ensure at least one pack is active
      if (state.activeLabelPacks.length === 0) state.activeLabelPacks.push('general');
    }
    renderPacks();
    renderLabels();
    renderConnections();
    scheduleSave();
  });

  // Label management
  const labelsContainer = document.getElementById('tweaksLabels');
  labelsContainer?.addEventListener('click', (e: MouseEvent) => {
    const removeBtn = (e.target as HTMLElement).closest('.label-remove') as HTMLElement | null;
    if (removeBtn) {
      const idx = parseInt(removeBtn.dataset.idx!);
      state.customLabels.splice(idx, 1);
      renderLabels();
      scheduleSave();
      showToast(t('toast-deleted') || '已删除');
    }
  });

  const addLabelBtn = document.getElementById('addLabelBtn');
  const newLabelInput = document.getElementById('newLabelInput') as HTMLInputElement | null;
  addLabelBtn?.addEventListener('click', () => {
    const val = (newLabelInput?.value || '').trim();
    if (!val) return;
    if (state.customLabels.includes(val) || LABELS.includes(val)) return;
    state.customLabels.push(val);
    if (newLabelInput) newLabelInput.value = '';
    renderLabels();
    scheduleSave();
    showToast(t('toast-group-created') || '已添加');
  });
  newLabelInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') addLabelBtn?.click();
  });

  // Clear all versions
  const clearVersionsBtn = document.getElementById('clearVersionsBtn');
  const clearModal = document.getElementById('clearVersionsModal');
  const clearCancel = document.getElementById('clearVersionsCancel');
  const clearConfirm = document.getElementById('clearVersionsConfirm');

  function doClearVersions(): void {
    state.versions = [];
    state.currentVersion = -1;
    state.isViewingHistory = false;
    state.branches = [{ id: 0, name: 'main', color: '#6c5ce7', forkFrom: -1 }];
    state.currentBranch = 0;
    state.nextBranchId = 1;
    state.cards = [];
    state.connections = [];
    state.groups = [];
    state.selectedCards.clear();
    state.nextId = 1;
    state.nextGroupId = 1;
    updateTimeline();
    renderCanvas();
    renderConnections();
    renderInbox();
    scheduleSave();
    showToast('已清除所有版本快照和画布内容');
  }

  clearVersionsBtn?.addEventListener('click', () => {
    clearModal?.classList.add('show');
  });
  clearCancel?.addEventListener('click', () => {
    clearModal?.classList.remove('show');
  });
  clearConfirm?.addEventListener('click', () => {
    clearModal?.classList.remove('show');
    doClearVersions();
  });

  // Draggable settings panel
  const panel = document.getElementById('tweaksPanel');
  const handle = document.getElementById('tweaksDragHandle');
  if (panel && handle) {
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      const rect = panel.getBoundingClientRect();
      panel.style.top = rect.top + 'px';
      panel.style.left = rect.left + 'px';
      panel.style.bottom = 'auto';
      panel.style.right = 'auto';
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    function onMove(e: MouseEvent) {
      if (!dragging) return;
      panel!.style.left = (startLeft + e.clientX - startX) + 'px';
      panel!.style.top = (startTop + e.clientY - startY) + 'px';
    }

    function onUp() {
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
  }

  // Close settings when clicking outside
  document.addEventListener('mousedown', (e: MouseEvent) => {
    const panel = document.getElementById('tweaksPanel');
    const fab = document.getElementById('tweaksFab');
    if (panel?.classList.contains('open') && !panel.contains(e.target as Node) && !fab?.contains(e.target as Node)) {
      panel.classList.remove('open');
    }
  });

  // ── Pack creation modal ──

  // Create modal HTML dynamically
  const modalBackdrop = document.createElement('div');
  modalBackdrop.className = 'pack-modal-backdrop';
  modalBackdrop.id = 'packModalBackdrop';
  const modal = document.createElement('div');
  modal.className = 'pack-modal';
  modal.id = 'packModal';
  modal.innerHTML = `
    <div class="pack-modal-header">
      <h4>${t('pack-create-title')}</h4>
      <button class="pack-modal-close" id="packModalClose">&times;</button>
    </div>
    <div class="pack-modal-body">
      <div>
        <label>${t('pack-name-label')}</label>
        <input type="text" id="packNameInput" placeholder="${t('pack-name-placeholder')}" />
      </div>
      <div>
        <label>${t('pack-labels-label')}</label>
        <textarea id="packLabelsInput" placeholder="${t('pack-labels-placeholder')}" rows="4"></textarea>
      </div>
    </div>
    <div class="pack-modal-footer">
      <button class="pack-modal-cancel" id="packModalCancel">${t('btn-cancel')}</button>
      <button class="pack-modal-confirm" id="packModalConfirm">${t('btn-create')}</button>
    </div>
  `;
  document.body.appendChild(modalBackdrop);
  document.body.appendChild(modal);

  const packNameInput = document.getElementById('packNameInput') as HTMLInputElement;
  const packLabelsInput = document.getElementById('packLabelsInput') as HTMLTextAreaElement;

  function openPackModal(): void {
    if (packNameInput) packNameInput.value = '';
    if (packLabelsInput) packLabelsInput.value = '';
    modalBackdrop.classList.add('show');
    modal.classList.add('show');
    requestAnimationFrame(() => {
      if (packNameInput) {
        packNameInput.style.height = 'auto';
        packNameInput.focus();
      }
      if (packLabelsInput) {
        packLabelsInput.style.height = 'auto';
        packLabelsInput.style.height = packLabelsInput.scrollHeight + 'px';
      }
    });
  }

  function closePackModal(): void {
    modalBackdrop.classList.remove('show');
    modal.classList.remove('show');
  }

  function confirmPackModal(): void {
    const name = (packNameInput?.value || '').trim();
    if (!name) {
      showToast(t('toast-pack-name-required') || '请输入关系包名称');
      return;
    }
    const labelsText = (packLabelsInput?.value || '').trim();
    const labels = labelsText.split('\n').map(l => l.trim()).filter(Boolean);
    if (labels.length === 0) {
      closePackModal();
      return;
    }
    const packId = 'custom_' + Date.now();
    state.customLabelPacks[packId] = { name, labels };
    if (!state.activeLabelPacks.includes(packId)) state.activeLabelPacks.push(packId);
    closePackModal();
    renderPacks();
    renderLabels();
    renderConnections();
    scheduleSave();
    showToast(t('toast-pack-created') || '已创建关系包');
  }

  // Event delegation for pack area
  packsContainer?.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // Delete custom pack
    const deleteBtn = target.closest('.pack-delete') as HTMLElement | null;
    if (deleteBtn) {
      e.preventDefault();
      e.stopPropagation();
      const packId = deleteBtn.dataset.deletePack;
      if (!packId) return;
      delete state.customLabelPacks[packId];
      state.activeLabelPacks = state.activeLabelPacks.filter(p => p !== packId);
      if (state.activeLabelPacks.length === 0) state.activeLabelPacks.push('general');
      renderPacks();
      renderLabels();
      renderConnections();
      scheduleSave();
      showToast(t('toast-pack-deleted') || '已删除关系包');
      return;
    }

    // Add new pack
    if (target.closest('#addPackBtn')) {
      openPackModal();
    }
  });

  document.getElementById('packModalClose')?.addEventListener('click', closePackModal);
  document.getElementById('packModalCancel')?.addEventListener('click', closePackModal);
  document.getElementById('packModalConfirm')?.addEventListener('click', confirmPackModal);
  modalBackdrop?.addEventListener('click', closePackModal);

  // Auto-expand textarea in pack modal
  packLabelsInput?.addEventListener('input', () => {
    packLabelsInput.style.height = 'auto';
    packLabelsInput.style.height = packLabelsInput.scrollHeight + 'px';
  });

  // Ctrl+Enter to submit in pack modal
  packNameInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') confirmPackModal();
    if (e.key === 'Escape') closePackModal();
  });
  packLabelsInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) confirmPackModal();
    if (e.key === 'Escape') closePackModal();
  });
}
