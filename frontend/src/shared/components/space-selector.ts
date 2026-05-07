// ═══════════════════════════════════════════════════════
// Space selector — dropdown for switching between spaces
// ═══════════════════════════════════════════════════════
import { state, switchSpace, loadSpaces, serializeState } from '../../core/types/state';
import { createSpace, deleteSpace, saveSpaceState } from '../../core/api/spaces';
import { showToast } from './toast';
import { renderCanvas, renderConnections } from '../../features/canvas/renderer';
import { renderInbox } from '../../features/inbox/inbox';
import { updateTimeline } from '../../version/manager';
import { t } from '../../i18n';

function renderAll(): void {
  renderInbox();
  renderCanvas();
  renderConnections();
  updateTimeline();
}

export function initSpaceSelector(): void {
  const btn = document.getElementById('spaceSelectorBtn');
  const dropdown = document.getElementById('spaceDropdown');
  if (!btn || !dropdown) return;

  // Toggle dropdown
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
    if (dropdown.classList.contains('open')) {
      renderDropdown();
    }
  });

  // Close on outside click
  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
  });

  dropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Update space name display
  updateSpaceName();

  // Space creation modal
  const spaceClose = document.getElementById('spaceClose');
  const spaceCreate = document.getElementById('spaceCreate');
  const spaceNameInput = document.getElementById('spaceNameInput') as HTMLInputElement | null;
  spaceClose?.addEventListener('click', closeSpaceModal);
  spaceCreate?.addEventListener('click', () => confirmSpaceModal());
  spaceNameInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmSpaceModal(); }
    if (e.key === 'Escape') closeSpaceModal();
  });
}

function updateSpaceName(): void {
  const nameEl = document.getElementById('spaceName');
  if (!nameEl) return;
  const current = state.spaces.find(s => s.id === state.currentSpaceId);
  nameEl.textContent = current ? current.name : '--';
}

async function renderDropdown(): Promise<void> {
  const dropdown = document.getElementById('spaceDropdown');
  if (!dropdown) return;

  // Refresh spaces list
  await loadSpaces();

  dropdown.innerHTML = '';

  // Space items
  for (const space of state.spaces) {
    const item = document.createElement('div');
    item.className = `space-item${space.id === state.currentSpaceId ? ' active' : ''}`;

    const name = document.createElement('span');
    name.className = 'space-item-name';
    name.textContent = space.name;
    item.appendChild(name);

    if (state.spaces.length > 1) {
      const delBtn = document.createElement('button');
      delBtn.className = 'space-item-delete';
      delBtn.textContent = '×';
      delBtn.title = t('delete-space');
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(t('confirm-delete-space'))) {
          await deleteSpace(space.id);
          state.spaces = state.spaces.filter(s => s.id !== space.id);
          if (state.currentSpaceId === space.id) {
            const next = state.spaces[0];
            if (next) await switchSpace(next.id, renderAll);
          }
          updateSpaceName();
          renderDropdown();
          showToast(t('space-deleted'));
        }
      });
      item.appendChild(delBtn);
    }

    item.addEventListener('click', async () => {
      if (space.id !== state.currentSpaceId) {
        await switchSpace(space.id, renderAll);
        updateSpaceName();
      }
      dropdown.classList.remove('open');
    });

    dropdown.appendChild(item);
  }

  // Divider
  const divider = document.createElement('div');
  divider.className = 'space-dropdown-divider';
  dropdown.appendChild(divider);

  // New space button
  const newBtn = document.createElement('button');
  newBtn.className = 'space-new-btn';
  newBtn.innerHTML = `<span>+</span> <span>${t('new-space')}</span>`;
  newBtn.addEventListener('click', () => {
    openSpaceModal();
    dropdown.classList.remove('open');
  });
  dropdown.appendChild(newBtn);
}

// ── Space creation modal ──
let _spaceDropdownEl: HTMLElement | null = null;

export function setSpaceDropdownRef(el: HTMLElement): void {
  _spaceDropdownEl = el;
}

export function openSpaceModal(): void {
  document.getElementById('spaceModal')!.classList.add('show');
  (document.getElementById('spaceNameInput') as HTMLInputElement)?.focus();
}

export function closeSpaceModal(): void {
  document.getElementById('spaceModal')!.classList.remove('show');
  (document.getElementById('spaceNameInput') as HTMLInputElement).value = '';
}

export async function confirmSpaceModal(): Promise<void> {
  const nameInput = document.getElementById('spaceNameInput') as HTMLInputElement;
  const name = nameInput?.value.trim();
  if (!name) return;
  closeSpaceModal();

  try {
    if (state.currentSpaceId) {
      await saveSpaceState(state.currentSpaceId, serializeState());
    }

    const space = await createSpace(name);
    state.spaces.unshift(space);
    state.currentSpaceId = space.id;

    state.cards = [];
    state.connections = [];
    state.versions = [];
    state.currentVersion = -1;
    state.branches = [{ id: 0, name: 'main', color: 'oklch(58% 0.18 255)', forkFrom: -1 }];
    state.currentBranch = 0;
    state.nextBranchId = 1;
    state.nextId = 1;
    state.selectedCards = new Set();

    updateSpaceName();
    renderAll();
    showToast(t('space-created'));
  } catch (e) {
    console.error('Failed to create space:', e);
    showToast(t('space-create-failed'));
  }
}
