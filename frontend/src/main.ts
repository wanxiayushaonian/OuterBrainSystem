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

import { state, loadSpaces, switchSpace, loadSampleData, deserializeState, serializeState, scheduleSave, pushUndo } from './core/types/state';
import { initLang, setLang, getCurrentLang } from './i18n';
import { renderCanvas, renderConnections } from './features/canvas/renderer';
import { renderInbox, setSemanticMode, isSemanticMode, triggerSemanticSearch } from './features/inbox/inbox';
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
import { RuntimeFactory, AnthropicRuntime } from './core/runtime';
import { t } from './i18n';
import { discoverRelationships, type DiscoverSuggestion } from './features/chat/api';
import { openAiPanel } from './features/chat/panel';
import { showToast } from './shared/components/toast';
import './shared/components/gravity-wall';
import { createSpace, loadSpaceState } from './core/api/spaces';

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
    if (isSemanticMode()) {
      triggerSemanticSearch(searchInput?.value || '');
    } else {
      renderInbox();
    }
  });

  // Semantic search toggle
  const searchModeBtn = document.getElementById('searchModeBtn');
  searchModeBtn?.addEventListener('click', () => {
    const on = !isSemanticMode();
    setSemanticMode(on);
    searchModeBtn.classList.toggle('active', on);
    if (on && searchInput?.value) {
      triggerSemanticSearch(searchInput.value);
    } else {
      renderInbox();
    }
  });

  // Zoom controls
  document.getElementById('zoomOutBtn')?.addEventListener('click', () => zoomCanvas(-0.1));
  document.getElementById('zoomInBtn')?.addEventListener('click', () => zoomCanvas(0.1));
  document.getElementById('zoomFitBtn')?.addEventListener('click', () => fitCanvas());

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
}

document.addEventListener('DOMContentLoaded', () => { init(); });
