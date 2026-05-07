// ═══════════════════════════════════════════════════════
// Session tabs component - Improved with independent state per tab
// ═══════════════════════════════════════════════════════
import { sessionManager } from '../../core/session';
import { SessionState } from '../../core/session/state';
import type { Session } from '../../core/session/types';
import { state } from '../../core/types/state';
import { t, escapeHtml } from '../../i18n';
import { showToast } from './toast';

// ── Per-tab state management ─────────────────────────────
const tabStates = new Map<string, SessionState>();

export function getTabState(sessionId: string): SessionState {
  if (!tabStates.has(sessionId)) {
    tabStates.set(sessionId, new SessionState());
  }
  return tabStates.get(sessionId)!;
}

export function removeTabState(sessionId: string): void {
  tabStates.delete(sessionId);
}

// ── Session list ─────────────────────────────────────────
let sessions: Session[] = [];

// Persist closed tab IDs in localStorage
const CLOSED_TABS_KEY = 'nexus-closed-tabs';
function loadClosedTabIds(): Set<string> {
  try {
    const raw = localStorage.getItem(CLOSED_TABS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}
function saveClosedTabIds(ids: Set<string>): void {
  localStorage.setItem(CLOSED_TABS_KEY, JSON.stringify([...ids]));
}
const closedTabIds = loadClosedTabIds();

export function removeClosedTabId(id: string): void {
  closedTabIds.delete(id);
  saveClosedTabIds(closedTabIds);
}

// ── Tab renaming ─────────────────────────────────────────
let renamingTabId: string | null = null;

function showRenameInput(tabEl: HTMLElement, sessionId: string): void {
  const titleEl = tabEl.querySelector('.session-title') as HTMLElement;
  if (!titleEl) return;

  const currentTitle = titleEl.textContent || '';
  renamingTabId = sessionId;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'session-rename-input';
  input.value = currentTitle;
  input.dataset.sessionId = sessionId;

  titleEl.style.display = 'none';
  tabEl.insertBefore(input, titleEl.nextSibling);
  input.focus();
  input.select();

  const commitRename = async () => {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== currentTitle) {
      try {
        await sessionManager.updateTitle(sessionId, newTitle);
        showToast(t('session-renamed') || '已重命名');
      } catch (error) {
        console.error('Failed to rename session:', error);
        showToast(t('session-rename-failed') || '重命名失败');
      }
    }
    renamingTabId = null;
    await renderSessionTabs();
  };

  input.addEventListener('blur', commitRename);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      renamingTabId = null;
      renderSessionTabs();
    }
  });
}

// ── Render ───────────────────────────────────────────────
export async function renderSessionTabs() {
  const container = document.getElementById('sessionTabs');
  if (!container) return;

  // Load sessions for current space
  try {
    sessions = await sessionManager.listSessions(state.currentSpaceId || 1);
  } catch (error) {
    console.error('Failed to load sessions:', error);
    sessions = [];
  }

  const currentSessionId = sessionManager.getCurrentSessionId();

  // Filter out closed tabs
  const visibleSessions = sessions.filter(s => !closedTabIds.has(s.id));

  const tabsHtml = visibleSessions.map(s => {
    const isActive = s.id === currentSessionId;
    return `
    <div class="session-tab ${isActive ? 'active' : ''}"
         data-session-id="${s.id}" draggable="true">
      <span class="session-title">${escapeHtml(s.title)}</span>
      <button class="session-close" data-action="close-session" data-session-id="${s.id}"
              title="${t('close-session')}">×</button>
    </div>
  `;
  }).join('');

  container.innerHTML = `
    <div class="session-tabs-container">
      ${tabsHtml}
      <button class="session-new" data-action="new-session" title="${t('new-session')}">
        + ${t('new-conversation')}
      </button>
    </div>
  `;

  attachSessionTabListeners();
}

// ── Event listeners ──────────────────────────────────────
function attachSessionTabListeners() {
  const container = document.getElementById('sessionTabs');
  if (!container) return;

  // Tab click - switch session
  container.querySelectorAll('.session-tab').forEach(tab => {
    const tabEl = tab as HTMLElement;

    // Single click to switch
    tabEl.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.session-close')) return;
      if (target.classList.contains('session-rename-input')) return;

      const sessionId = tabEl.dataset.sessionId;
      if (!sessionId) return;

      // Ensure this session's tab is visible
      closedTabIds.delete(sessionId);
      saveClosedTabIds(closedTabIds);

      try {
        await sessionManager.loadSession(sessionId);
        await renderSessionTabs();
        showToast(t('session-switched'));

        // Open AI panel to show the session
        const { openAiPanel } = await import('../../features/chat/panel');
        openAiPanel();
      } catch (error) {
        console.error('Failed to switch session:', error);
        showToast(t('session-switch-failed'));
      }
    });

    // Double click to rename
    tabEl.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.session-close')) return;
      if (target.classList.contains('session-rename-input')) return;

      const sessionId = tabEl.dataset.sessionId;
      if (!sessionId || sessionId === renamingTabId) return;

      showRenameInput(tabEl, sessionId);
    });

    // Drag events for reordering
    tabEl.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', tabEl.dataset.sessionId || '');
      tabEl.classList.add('dragging');
    });

    tabEl.addEventListener('dragend', () => {
      tabEl.classList.remove('dragging');
    });

    tabEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      tabEl.classList.add('drag-over');
    });

    tabEl.addEventListener('dragleave', () => {
      tabEl.classList.remove('drag-over');
    });

    tabEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      tabEl.classList.remove('drag-over');
      const draggedId = e.dataTransfer?.getData('text/plain');
      const targetId = tabEl.dataset.sessionId;
      if (draggedId && targetId && draggedId !== targetId) {
        // Swap positions in sessions array
        const dragIdx = sessions.findIndex(s => s.id === draggedId);
        const targetIdx = sessions.findIndex(s => s.id === targetId);
        if (dragIdx !== -1 && targetIdx !== -1) {
          const [dragged] = sessions.splice(dragIdx, 1);
          sessions.splice(targetIdx, 0, dragged);
          await renderSessionTabs();
        }
      }
    });
  });

  // Close button
  container.querySelectorAll('[data-action="close-session"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const sessionId = (btn as HTMLElement).dataset.sessionId;
      if (!sessionId) return;

      closedTabIds.add(sessionId);
      saveClosedTabIds(closedTabIds);

      if (sessionManager.getCurrentSessionId() === sessionId) {
        sessionManager.clearCurrentSession();
      }
      await renderSessionTabs();
      showToast(t('session-closed'));
    });
  });

  // New session button
  const newBtn = container.querySelector('[data-action="new-session"]');
  if (newBtn) {
    newBtn.addEventListener('click', async () => {
      await createNewSession();
    });
  }
}

async function createNewSession() {
  try {
    await sessionManager.createSession(
      state.currentSpaceId || 1,
      'anthropic',
      t('new-conversation')
    );
    await renderSessionTabs();
    showToast(t('session-created'));
  } catch (error) {
    console.error('Failed to create session:', error);
    showToast(t('session-create-failed'));
  }
}

// ── Initialize ───────────────────────────────────────────
export async function initSessionTabs() {
  try {
    const sessions = await sessionManager.listSessions(state.currentSpaceId || 1);

    if (sessions.length > 0) {
      sessionManager.setCurrentSession(sessions[0].id);
      await renderSessionTabs();
      return;
    }

    await renderSessionTabs();
  } catch (error) {
    console.error('Failed to initialize session tabs:', error);
    const container = document.getElementById('sessionTabs');
    if (container) {
      container.innerHTML = `
        <div class="session-tabs-container">
          <button class="session-new" data-action="new-session" title="${t('new-session')}">
            + ${t('new-conversation')}
          </button>
        </div>
      `;
      const newBtn = container.querySelector('[data-action="new-session"]');
      if (newBtn) {
        newBtn.addEventListener('click', async () => {
          await createNewSession();
        });
      }
    }
  }
}
