// ═══════════════════════════════════════════════════════
// Main entry point — wires all modules together
// ═══════════════════════════════════════════════════════
import './styles/base.css';
import './styles/layout.css';
import './styles/sidebar.css';
import './styles/canvas.css';
import './styles/panels.css';
import './styles/components.css';
import './styles/session-tabs.css';

// Card component styles
import './shared/components/card-renderer.css';
import './shared/components/distillation-card.css';
import './shared/components/socratic-card.css';
import './shared/components/flow-analysis-card.css';
import './shared/components/choice-card.css';
import './shared/components/vote-card.css';
import './shared/components/debate-card.css';
import './shared/components/research-path-card.css';
import './shared/components/progress-card.css';
import './shared/components/checklist-card.css';
import './shared/components/quote-card.css';
import './shared/components/note-card.css';
import './shared/components/conclusion-card.css';
import './shared/components/image-card.css';
import './features/card-gallery/card-gallery.css';
import './features/notifications/notifications.css';
import './shared/components/wikilink-popup.css';
import './features/graph/graph-view.css';
import './features/templates/template-picker.css';

import { state, loadSpaces, loadSampleData, deserializeState, serializeState, scheduleSave, pushUndo, undo, redo } from './core/types/state';
import { initLang, setLang, getCurrentLang } from './i18n';
import { renderCanvas, renderConnections } from './features/canvas/renderer';
import { renderInbox } from './features/inbox/inbox';
import { renderOutline, initOutline } from './features/inbox/outline';
import { applyTransform, zoomCanvas, fitCanvas } from './features/canvas/transform';
import { initInteractions } from './features/canvas/interactions';
import { initCapture, openCapture } from './features/capture/capture';
import { initAiPanel } from './features/chat/panel';
import { initCardAiPopup } from './features/chat/card-popup';
import { initVersion, updateTimeline, saveVersion } from './version/manager';
import { initTweaks } from './shared/components/tweaks';
import { initContextMenu } from './shared/components/context-menu';
import { initSpaceSelector } from './shared/components/space-selector';
import { initSessionTabs } from './shared/components/session-tabs';
import { initNotifications } from './features/notifications/notifications';
import { initGraphView, openGraph } from './features/graph/graph-view';
import { openTemplatePicker } from './features/templates/template-picker';
import { enterGallery, exitGallery, isGalleryMode } from './features/card-gallery/card-gallery';
import { RuntimeFactory, AnthropicRuntime } from './core/runtime';
import { t } from './i18n';
import { discoverRelationships, type DiscoverSuggestion } from './features/chat/api';
import { openAiPanel } from './features/chat/panel';
import { showToast } from './shared/components/toast';
import './shared/components/gravity-wall';
import { createSpace, loadSpaceState } from './core/api/spaces';
import { isAuthenticated } from './shared/utils/auth';

function renderAll(): void {
  // Re-render whichever sidebar view is active
  const activeTab = document.querySelector('.sidebar-tab.active') as HTMLElement | null;
  const view = activeTab?.dataset.view || 'inbox';
  if (view === 'outline') renderOutline();
  else renderInbox();
  renderCanvas();
  renderConnections();
  updateTimeline();
}

async function init(): Promise<void> {
  // Auth check — redirect to login if not authenticated
  if (!isAuthenticated()) {
    window.location.href = '/login';
    return;
  }

  // Initialize i18n with render callback
  initLang(renderAll);

  // Load spaces from backend
  const spaces = await loadSpaces();

  if (spaces.length > 0) {
    // Load the most recently updated space
    const space = spaces[0];
    state.currentSpaceId = space.id;
    try {
      const data = await loadSpaceState(space.id);
      deserializeState(data);
    } catch (e) {
      console.warn('Failed to load space state, using empty:', e);
      loadSampleData();
    }
  } else {
    // First time: create a default space with sample data
    loadSampleData();
    try {
      const space = await createSpace(t('default-space') || 'Default Space');
      state.spaces = [space];
      state.currentSpaceId = space.id;
      // Save initial state
      const { saveSpaceState } = await import('./core/api/spaces');
      await saveSpaceState(space.id, serializeState());
    } catch (e) {
      console.warn('Failed to create default space:', e);
    }
  }

  // Initial render
  renderInbox();
  renderCanvas();
  renderConnections();
  if (state.versions.length === 0) {
    saveVersion(t('initial-state'));
  }
  updateTimeline();

  // Apply saved language
  setLang(getCurrentLang());

  // Register runtime providers
  RuntimeFactory.register('anthropic', () => new AnthropicRuntime());

  // Initialize all modules
  initInteractions();
  initCapture();
  initAiPanel();
  initCardAiPopup();
  initVersion();
  initTweaks();
  initContextMenu();
  initSpaceSelector();

  // Initialize session tabs (non-blocking)
  initSessionTabs().catch(err => {
    console.error('Session tabs initialization failed:', err);
  });
  initOutline();
  initNotifications();
  initGraphView();

  // Sidebar view toggle
  let currentView: 'inbox' | 'outline' = 'inbox';
  const sidebarTabs = document.querySelectorAll('.sidebar-tab');
  sidebarTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const view = (tab as HTMLElement).dataset.view as 'inbox' | 'outline';
      if (view === currentView) return;
      currentView = view;
      sidebarTabs.forEach(t => t.classList.toggle('active', (t as HTMLElement).dataset.view === view));
      if (view === 'outline') {
        renderOutline();
      } else {
        renderInbox();
      }
    });
  });

  // Apply initial canvas transform
  applyTransform();

  // Search input
  const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
  searchInput?.addEventListener('input', () => {
    renderInbox();
  });

  // Zoom controls
  document.getElementById('zoomOutBtn')?.addEventListener('click', () => zoomCanvas(-0.1));
  document.getElementById('zoomInBtn')?.addEventListener('click', () => zoomCanvas(0.1));
  document.getElementById('zoomFitBtn')?.addEventListener('click', () => fitCanvas());

  // Topbar dropdown menus
  function closeAllDropdowns(): void {
    document.querySelectorAll('.topbar-dropdown.open').forEach(el => el.classList.remove('open'));
  }

  document.querySelectorAll('.topbar-dropdown-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const parent = (trigger as HTMLElement).closest('.topbar-dropdown')!;
      const wasOpen = parent.classList.contains('open');
      closeAllDropdowns();
      if (!wasOpen) parent.classList.add('open');
    });
  });

  document.addEventListener('click', closeAllDropdowns);

  // Edit menu actions
  document.getElementById('editDropdown')?.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest('[data-action]') as HTMLElement;
    if (!item) return;
    const action = item.dataset.action;
    closeAllDropdowns();
    if (isGalleryMode()) return;
    if (action === 'undo') { undo(); renderAll(); }
    else if (action === 'redo') { redo(); renderAll(); }
    else if (action === 'select-all') {
      const canvasCards = state.cards.filter(c => c.inCanvas);
      state.selectedCards.clear();
      canvasCards.forEach(c => state.selectedCards.add(c.id));
      renderCanvas();
      renderConnections();
    }
    else if (action === 'delete-selected' && state.selectedCards.size > 0) {
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
  });

  // Tools menu actions
  document.getElementById('toolsDropdown')?.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest('[data-action]') as HTMLElement;
    if (!item) return;
    const action = item.dataset.action;
    closeAllDropdowns();
    if (action === 'card-gallery') {
      if (isGalleryMode()) exitGallery();
      else enterGallery();
    }
    // Block other tools actions during gallery mode
    else if (isGalleryMode()) return;
    else if (action === 'template') openTemplatePicker();
    else if (action === 'graph') openGraph();
    else if (action === 'export') {
      const data = serializeState();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexus-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(t('toast-exported') || '已导出');
    }
    else if (action === 'import') {
      document.getElementById('importFile')?.click();
    }
  });

  // Import file handler
  const importFile = document.getElementById('importFile') as HTMLInputElement;
  importFile?.addEventListener('change', () => {
    const file = importFile.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        pushUndo();
        deserializeState(data);
        renderAll();
        scheduleSave();
        showToast(t('toast-imported') || '已导入');
      } catch {
        showToast(t('toast-import-error') || '导入失败：文件格式错误');
      }
    };
    reader.readAsText(file);
    importFile.value = '';
  });

  // Logout button
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('nexus-token');
    window.location.href = '/login';
  });

  // Sidebar toggle
  const sidebarToggle = document.getElementById('sidebarToggle');
  const appShell = document.querySelector('.app');
  if (sidebarToggle && appShell) {
    // Restore saved state
    if (localStorage.getItem('sidebar-hidden') === 'true') {
      appShell.classList.add('sidebar-hidden');
    }
    sidebarToggle.addEventListener('click', () => {
      appShell.classList.toggle('sidebar-hidden');
      localStorage.setItem('sidebar-hidden', appShell.classList.contains('sidebar-hidden') ? 'true' : 'false');
    });
  }

  // Topbar capture button
  document.getElementById('topbarCaptureBtn')?.addEventListener('click', openCapture);

  // Topbar AI button
  document.getElementById('topbarAiBtn')?.addEventListener('click', openAiPanel);

  // Discover relationships
  const discoverBtn = document.getElementById('discoverBtn');
  const discoverPopup = document.getElementById('discoverPopup');
  const discoverBody = document.getElementById('discoverBody');
  const discoverClose = document.getElementById('discoverClose');
  const discoverClose2 = document.getElementById('discoverClose2');
  const discoverAcceptAll = document.getElementById('discoverAcceptAll');
  let pendingSuggestions: DiscoverSuggestion[] = [];

  function closeDiscover(): void {
    discoverPopup?.classList.remove('open');
    pendingSuggestions = [];
  }

  discoverClose?.addEventListener('click', closeDiscover);
  discoverClose2?.addEventListener('click', closeDiscover);

  discoverBtn?.addEventListener('click', async () => {
    if (isGalleryMode()) return;
    const canvasCards = state.cards.filter(c => c.inCanvas);
    if (canvasCards.length < 2) {
      showToast(t('toast-min-cards'));
      return;
    }

    discoverPopup?.classList.add('open');
    if (discoverBody) discoverBody.innerHTML = `<div class="discover-loading">${t('discover-loading')}</div>`;

    try {
      const res = await discoverRelationships(canvasCards, state.connections);
      pendingSuggestions = res.suggestions;

      if (!discoverBody) return;
      if (res.suggestions.length === 0) {
        discoverBody.innerHTML = `<div class="discover-loading">${t('discover-empty')}</div>`;
        return;
      }

      discoverBody.innerHTML = res.suggestions.map((s, i) => {
        const fromCard = state.cards.find(c => c.id === s.from_id);
        const toCard = state.cards.find(c => c.id === s.to_id);
        const fromText = fromCard ? (fromCard.text.length > 20 ? fromCard.text.slice(0, 20) + '…' : fromCard.text) : `#${s.from_id}`;
        const toText = toCard ? (toCard.text.length > 20 ? toCard.text.slice(0, 20) + '…' : toCard.text) : `#${s.to_id}`;
        return `<div class="discover-suggestion" data-idx="${i}">
          <div class="suggestion-conn">
            ${fromText} <span class="suggestion-arrow">→</span> ${toText}
          </div>
          <span class="suggestion-label">${s.label}</span>
          <div class="suggestion-reason">${s.reason}</div>
        </div>`;
      }).join('');

      // Click to toggle accept
      discoverBody.querySelectorAll('.discover-suggestion').forEach(el => {
        el.addEventListener('click', () => {
          el.classList.toggle('accepted');
        });
      });
    } catch (e) {
      if (discoverBody) discoverBody.innerHTML = `<div class="discover-loading">Error: ${e}</div>`;
    }
  });

  discoverAcceptAll?.addEventListener('click', () => {
    pushUndo();
    let count = 0;
    for (const s of pendingSuggestions) {
      const exists = state.connections.some(c =>
        (c.from === s.from_id && c.to === s.to_id) || (c.from === s.to_id && c.to === s.from_id)
      );
      if (!exists) {
        state.connections.push({ from: s.from_id, to: s.to_id, label: s.label });
        count++;
      }
    }
    if (count > 0) {
      renderConnections();
      scheduleSave();
    }
    showToast(t('discover-accepted', { n: count }) || `已接受 ${count} 条关系`);
    closeDiscover();
  });

  // Knowledge graph button (sidebar)
  document.getElementById('graphBtn')?.addEventListener('click', openGraph);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    // Skip if user is typing in an input/textarea
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

    const ctrl = e.ctrlKey || e.metaKey;

    // Escape: Exit gallery or deselect all
    if (e.key === 'Escape') {
      if (isGalleryMode()) { exitGallery(); return; }
      state.selectedCards.clear();
      renderCanvas();
      renderConnections();
      return;
    }

    // In gallery mode, block all other shortcuts
    if (isGalleryMode()) return;

    // Ctrl+Z: Undo
    if (ctrl && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      if (undo()) renderAll();
      return;
    }
    // Ctrl+Shift+Z or Ctrl+Y: Redo
    if (ctrl && e.shiftKey && e.key === 'z' || ctrl && e.key === 'y') {
      e.preventDefault();
      if (redo()) renderAll();
      return;
    }
    // Ctrl+S: Force save
    if (ctrl && e.key === 's') {
      e.preventDefault();
      scheduleSave();
      showToast(t('toast-saved') || '已保存');
      return;
    }
    // Ctrl+A: Select all canvas cards
    if (ctrl && e.key === 'a') {
      e.preventDefault();
      const canvasCards = state.cards.filter(c => c.inCanvas);
      if (canvasCards.length > 0) {
        state.selectedCards.clear();
        canvasCards.forEach(c => state.selectedCards.add(c.id));
        renderCanvas();
        renderConnections();
      }
      return;
    }
    // Delete/Backspace: Delete selected cards
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.selectedCards.size === 0) return;
      e.preventDefault();
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
      return;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => { init(); });
