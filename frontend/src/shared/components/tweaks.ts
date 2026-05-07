// ═══════════════════════════════════════════════════════
// Settings panel: language, label management, shortcuts, draggable
// ═══════════════════════════════════════════════════════
import { state, LABELS, LABEL_PRESETS, scheduleSave } from '../../core/types/state';
import { setLang, t } from '../../i18n';
import { showToast } from './toast';
import { updateTimeline } from '../../version/manager';
import { renderCanvas, renderConnections } from '../../features/canvas/renderer';
import { renderInbox } from '../../features/inbox/inbox';
import type { LangCode } from '../../core/types/types';

function renderPacks(): void {
  const container = document.getElementById('tweaksPacks');
  if (!container) return;

  container.innerHTML = Object.entries(LABEL_PRESETS).map(([id, pack]) => {
    const active = state.activeLabelPacks.includes(id);
    return `<label class="tweaks-pack-item${active ? ' active' : ''}" data-pack="${id}">
      <input type="checkbox" ${active ? 'checked' : ''} data-pack="${id}"/>
      <span class="tweaks-pack-name">${pack.name}</span>
      <span class="tweaks-pack-count">${pack.labels.length}</span>
    </label>`;
  }).join('');
}

function renderLabels(): void {
  const container = document.getElementById('tweaksLabels');
  if (!container) return;

  // Show labels from active packs (not custom)
  const packLabels: string[] = [];
  for (const packId of state.activeLabelPacks) {
    const pack = LABEL_PRESETS[packId];
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
}
