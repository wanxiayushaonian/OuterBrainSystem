// ═══════════════════════════════════════════════════════
// Canvas interactions: drag, connect, select, pan, zoom, keyboard
// ═══════════════════════════════════════════════════════
import { state, LABELS, scheduleSave, pushUndo, undo, redo } from '../../core/types/state';
import { connId } from '../../core/types/types';
import { t } from '../../i18n';
import { renderCanvas, renderConnections, renderTempConnection, collapsedPillPositions } from './renderer';
import { zoomCanvas, screenToCanvas, applyTransform, updateZoomDisplay } from './transform';
import { renderInbox } from '../inbox/inbox';
import { showToast } from '../../shared/components/toast';
import { openCardAiPopup } from '../chat/card-popup';
import { openCardEditModal } from '../../shared/components/context-menu';
import { alignLeft, alignRight, alignTop, alignBottom, alignCenterH, alignCenterV, distributeH, distributeV } from './align';
import { openCapture, closeCapture } from '../../features/capture/capture';
import { closeAiPanel } from '../chat/panel';
import { saveManualVersion, quickSaveVersion, createBranchManual, closeRenameModal, closeBranchModal } from '../../version/manager';
import { contextAction, showCanvasContextMenu, showInboxContextMenu, showConnContextMenu, showGroupContextMenu, closeAllContextMenus, closeGroupModal } from '../../shared/components/context-menu';
import { closeSpaceModal } from '../../shared/components/space-selector';
import type { Connection } from '../../core/types/types';

let isPanning = false;
let panStart = { x: 0, y: 0 };
let connFromPort: string | null = null;
let connToPort: string | null = null;

// Track last mouse position on canvas for paste placement
let lastCanvasMouse = { x: 300, y: 200 };

// ── Canvas card mouse down ──
export function onCanvasCardMouseDown(e: MouseEvent, id: number): void {
  if (e.button === 2) return;
  if ((e.target as HTMLElement).closest('.card-ai-btn')) return;
  e.stopPropagation();

  const card = state.cards.find(c => c.id === id);
  if (!card) return;

  if (e.shiftKey) {
    if (state.selectedCards.has(id)) state.selectedCards.delete(id);
    else state.selectedCards.add(id);
    renderCanvas();
    renderConnections();
    return;
  }

  // Set highlight root (click same card again toggles off)
  if (state.highlightRootId === id) {
    state.highlightRootId = null;
  } else {
    state.highlightRootId = id;
    state.highlightDepth = 1;
  }

  if (!state.selectedCards.has(id)) {
    state.selectedCards.clear();
    state.selectedCards.add(id);
  }

  // Also select all cards in the same group (only when group is locked)
  const group = state.groups.find(g => g.cardIds.includes(id));
  if (group && !group.collapsed && group.locked) {
    group.cardIds.forEach(cid => state.selectedCards.add(cid));
  }

  state.draggingCard = id;
  state.dragStartMouse = { x: e.clientX, y: e.clientY };
  state.dragStartPositions = {};
  state.selectedCards.forEach(sid => {
    const sc = state.cards.find(c => c.id === sid);
    if (sc) state.dragStartPositions![sid] = { x: sc.x, y: sc.y };
  });
  state.dragOffset.x = e.clientX - card.x * state.zoom - state.pan.x;
  state.dragOffset.y = e.clientY - card.y * state.zoom - state.pan.y;
  renderCanvas();
  renderConnections();
}

// ── Start connection from port ──
export function startConnect(e: MouseEvent, id: number): void {
  e.stopPropagation();
  e.preventDefault();
  state.connecting = true;
  state.connectFrom = id;
  // Detect which port the user dragged from
  const portEl = (e.target as HTMLElement).closest('.conn-port') as HTMLElement | null;
  if (portEl) {
    const dir = portEl.classList.contains('top') ? 'top'
      : portEl.classList.contains('right') ? 'right'
      : portEl.classList.contains('bottom') ? 'bottom'
      : 'left';
    const dockIdx = portEl.dataset.dock;
    connFromPort = dockIdx !== undefined ? `${dir}-${dockIdx}` : dir;
  } else {
    connFromPort = null;
  }
  connToPort = null;
  document.body.style.cursor = 'crosshair';
}

// ── Canvas card double-click (edit) ──
export function onCanvasCardDblClick(e: MouseEvent, id: number): void {
  e.stopPropagation();
  openCardEditModal(id);
}

// ── Document mousemove: drag, connect temp line, selection box, pan ──
function onDocumentMouseMove(e: MouseEvent): void {
  lastCanvasMouse = { x: e.clientX, y: e.clientY };
  // Middle mouse panning
  if (isPanning) {
    state.pan.x += e.clientX - panStart.x;
    state.pan.y += e.clientY - panStart.y;
    panStart = { x: e.clientX, y: e.clientY };
    document.body.style.cursor = 'grabbing';
    applyTransform();
    return;
  }

  // Card drag
  if (state.draggingCard && state.dragStartPositions) {
    const dx = (e.clientX - state.dragStartMouse!.x) / state.zoom;
    const dy = (e.clientY - state.dragStartMouse!.y) / state.zoom;
    state.selectedCards.forEach(sid => {
      const sc = state.cards.find(c => c.id === sid);
      const startPos = state.dragStartPositions![sid];
      if (sc && startPos) {
        sc.x = Math.round(startPos.x + dx);
        sc.y = Math.round(startPos.y + dy);
      }
    });
    state.didDrag = true;
    renderCanvas();
    renderConnections();
  }

  // Collapsed group pill drag
  if (state.draggingGroupId !== null && state.dragStartPositions) {
    const dx = (e.clientX - state.dragStartMouse!.x) / state.zoom;
    const dy = (e.clientY - state.dragStartMouse!.y) / state.zoom;
    const group = state.groups.find(g => g.id === state.draggingGroupId);
    if (group) {
      group.cardIds.forEach(cid => {
        const sc = state.cards.find(c => c.id === cid);
        const startPos = state.dragStartPositions![cid];
        if (sc && startPos) {
          sc.x = Math.round(startPos.x + dx);
          sc.y = Math.round(startPos.y + dy);
        }
      });
      state.didDrag = true;
      renderCanvas();
      renderConnections();
    }
  }

  // Connection temp line with port snapping
  if (state.connecting && state.connectFrom) {
    const pos = screenToCanvas(e.clientX, e.clientY);

    // Find the nearest port across all cards and groups
    let bestDist = Infinity;
    let bestX = pos.x;
    let bestY = pos.y;
    let bestId: number | null = null;
    let bestPort: string | null = null;

    // Check all ports on each card (including multi-dock)
    for (const card of state.cards) {
      if (!card.inCanvas || card.id === state.connectFrom) continue;
      const el = document.querySelector(`.canvas-card[data-id="${card.id}"]`) as HTMLElement | null;
      const w = el ? el.offsetWidth : 240;
      const h = el ? el.offsetHeight : 80;
      const dc = card.dockCount ?? 1;
      const ports: Array<{ dir: string; x: number; y: number }> = [
        { dir: 'top', x: card.x + w / 2, y: card.y },
        { dir: 'bottom', x: card.x + w / 2, y: card.y + h },
      ];
      for (let i = 0; i < dc; i++) {
        const yOff = h * (i + 1) / (dc + 1);
        ports.push({ dir: `left-${i}`, x: card.x, y: card.y + yOff });
        ports.push({ dir: `right-${i}`, x: card.x + w, y: card.y + yOff });
      }
      for (const p of ports) {
        const d = Math.sqrt((pos.x - p.x) ** 2 + (pos.y - p.y) ** 2);
        if (d < bestDist) {
          bestDist = d;
          bestX = p.x;
          bestY = p.y;
          bestId = card.id;
          bestPort = p.dir;
        }
      }
    }

    // Check all 4 ports on each group
    for (const group of state.groups) {
      const gId = connId(group.id, true);
      if (gId === state.connectFrom) continue;
      const pill = collapsedPillPositions.get(group.id);
      let gx: number, gy: number, gw: number, gh: number;
      if (pill) {
        gx = pill.x; gy = pill.y; gw = pill.w; gh = pill.h;
      } else {
        const el = document.querySelector(`.canvas-group[data-group-id="${group.id}"]`) as HTMLElement | null;
        if (!el) continue;
        gx = el.offsetLeft; gy = el.offsetTop; gw = el.offsetWidth; gh = el.offsetHeight;
      }
      const ports = {
        top:    { x: gx + gw / 2, y: gy },
        bottom: { x: gx + gw / 2, y: gy + gh },
        left:   { x: gx,          y: gy + gh / 2 },
        right:  { x: gx + gw,     y: gy + gh / 2 },
      };
      for (const dir of ['top', 'right', 'bottom', 'left'] as const) {
        const p = ports[dir];
        const d = Math.sqrt((pos.x - p.x) ** 2 + (pos.y - p.y) ** 2);
        if (d < bestDist) {
          bestDist = d;
          bestX = p.x;
          bestY = p.y;
          bestId = gId;
          bestPort = dir;
        }
      }
    }

    // Only snap within threshold
    const SNAP_THRESHOLD = 50;
    let snappedId: number | null = null;
    if (bestDist < SNAP_THRESHOLD && bestId !== null && bestPort !== null) {
      snappedId = bestId;
      connToPort = bestPort;
    } else {
      connToPort = null;
    }

    // Highlight snapped target
    document.querySelectorAll('.canvas-card.snap-target, .canvas-group.snap-target').forEach(el => el.classList.remove('snap-target'));
    if (snappedId !== null) {
      if (snappedId < 0) {
        document.querySelector(`.canvas-group[data-group-id="${-snappedId}"]`)?.classList.add('snap-target');
      } else {
        document.querySelector(`.canvas-card[data-id="${snappedId}"]`)?.classList.add('snap-target');
      }
    }

    renderTempConnection(state.connectFrom, bestX, bestY, connFromPort ?? undefined);
  }

  // Selection box
  if (state.selectionStart) {
    const box = document.getElementById('selectionBox') as HTMLElement | null;
    if (!box) return;
    const pos = screenToCanvas(e.clientX, e.clientY);
    const x = Math.min(state.selectionStart.x, pos.x);
    const y = Math.min(state.selectionStart.y, pos.y);
    const w = Math.abs(pos.x - state.selectionStart.x);
    const h = Math.abs(pos.y - state.selectionStart.y);
    box.style.left = x + 'px';
    box.style.top = y + 'px';
    box.style.width = w + 'px';
    box.style.height = h + 'px';
    box.style.display = 'block';
  }
}

// ── Document mouseup: end drag/connect/select/pan ──
function onDocumentMouseUp(e: MouseEvent): void {
  if (isPanning) {
    isPanning = false;
    document.body.style.cursor = '';
    return;
  }

  if (state.draggingCard || state.draggingGroupId !== null) {
    if (state.didDrag) pushUndo();
    state.draggingCard = null;
    state.draggingGroupId = null;
    state.dragStartPositions = null;
    state.dragStartMouse = null;
    state.didDrag = false;
  }

  if (state.connecting && state.connectFrom) {
    // Check if dropped on a card
    const cardTarget = (e.target as HTMLElement).closest('.canvas-card');
    // Check if dropped on a group
    const groupTarget = (e.target as HTMLElement).closest('.canvas-group:not(.collapsed)') as HTMLElement | null;

    let targetId: number | null = null;
    if (cardTarget) {
      targetId = parseInt(cardTarget.getAttribute('data-id')!);
    } else if (groupTarget) {
      const gid = parseInt(groupTarget.dataset.groupId!);
      targetId = connId(gid, true);
    }

    if (targetId !== null && targetId !== state.connectFrom) {
      // Prevent connecting a card to its own group
      let blocked = false;
      if (state.connectFrom > 0 && targetId < 0) {
        const gid = -targetId;
        const group = state.groups.find(g => g.id === gid);
        if (group && group.cardIds.includes(state.connectFrom)) blocked = true;
      } else if (state.connectFrom < 0 && targetId > 0) {
        const gid = -state.connectFrom;
        const group = state.groups.find(g => g.id === gid);
        if (group && group.cardIds.includes(targetId)) blocked = true;
      }
      if (!blocked) {
        pushUndo();
        state.connections.push({
          from: state.connectFrom,
          to: targetId,
          label: t('label-related'),
          fromPort: connFromPort ?? undefined,
          toPort: connToPort ?? undefined,
        });
        renderConnections();
        scheduleSave();
        showToast(t('toast-connected'));
      }
    }
    state.connecting = false;
    state.connectFrom = null;
    connFromPort = null;
    connToPort = null;
    document.body.style.cursor = '';
    document.getElementById('connectionsSvg')?.querySelector('.temp-line')?.remove();
    document.querySelectorAll('.canvas-card.snap-target, .canvas-group.snap-target').forEach(el => el.classList.remove('snap-target'));
  }

  if (state.selectionStart) {
    const box = document.getElementById('selectionBox') as HTMLElement | null;
    if (box) {
      const bx = parseFloat(box.style.left);
      const by = parseFloat(box.style.top);
      const bw = parseFloat(box.style.width);
      const bh = parseFloat(box.style.height);
      if (bw > 5 || bh > 5) {
        state.cards.filter(c => c.inCanvas).forEach(c => {
          const cw = 240, ch = 80;
          if (c.x + cw > bx && c.x < bx + bw && c.y + ch > by && c.y < by + bh) {
            state.selectedCards.add(c.id);
          }
        });
      }
      box.style.display = 'none';
    }
    renderCanvas();
    renderConnections();
    state.selectionStart = null;
  }
}

// ── Canvas area mousedown: middle-mouse pan, selection box start ──
function onCanvasAreaMouseDown(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (target.closest('.canvas-card') || target.closest('.conn-label')) return;

  // Middle mouse button → panning
  if (e.button === 1) {
    e.preventDefault();
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    document.body.style.cursor = 'grab';
    return;
  }

  // Left mouse on empty canvas → selection box
  if (e.button === 0 && (target.id === 'canvasArea' || target.id === 'canvas' || target.id === 'canvasInner')) {
    if (!e.shiftKey) {
      state.selectedCards.clear();
      state.highlightRootId = null;
    }
    renderCanvas();
    renderConnections();
    const pos = screenToCanvas(e.clientX, e.clientY);
    state.selectionStart = { x: pos.x, y: pos.y };
  }
}

// ── Canvas area wheel: zoom at cursor position ──
function onCanvasAreaWheel(e: WheelEvent): void {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.08 : 0.08;
  zoomCanvas(delta, e.clientX, e.clientY);
}

// ── Check if a text input is focused ──
function isTextInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}

// ── Keyboard shortcuts ──
function onKeyDown(e: KeyboardEvent): void {
  const inInput = isTextInputFocused();

  // Ctrl+Shift+C → Capture
  if (e.ctrlKey && e.shiftKey && e.key === 'C') {
    e.preventDefault();
    openCapture();
    return;
  }
  // Ctrl+S → Save version (with naming modal)
  if (e.ctrlKey && !e.shiftKey && e.key === 's') {
    e.preventDefault();
    saveManualVersion();
    return;
  }
  // Ctrl+Shift+S → Quick save version snapshot
  if (e.ctrlKey && e.shiftKey && e.key === 'S') {
    e.preventDefault();
    quickSaveVersion();
    return;
  }
  // Ctrl+B → Create branch
  if (e.ctrlKey && e.key === 'b' && !inInput) {
    e.preventDefault();
    createBranchManual();
    return;
  }
  // Ctrl+Z → Undo (only when not in text input)
  if (e.ctrlKey && !e.shiftKey && e.key === 'z' && !inInput) {
    e.preventDefault();
    if (undo()) {
      renderCanvas();
      renderConnections();
      renderInbox();
      showToast('已撤销 Undo');
    }
    return;
  }
  // Ctrl+Shift+Z or Ctrl+Y → Redo (only when not in text input)
  if (e.ctrlKey && e.key === 'Z' && !inInput) {
    e.preventDefault();
    if (redo()) {
      renderCanvas();
      renderConnections();
      renderInbox();
      showToast('已重做 Redo');
    }
    return;
  }
  if (e.ctrlKey && e.key === 'y' && !inInput) {
    e.preventDefault();
    if (redo()) {
      renderCanvas();
      renderConnections();
      renderInbox();
      showToast('已重做 Redo');
    }
    return;
  }
  // Ctrl+[ → Decrease highlight depth
  if (e.ctrlKey && e.key === '[' && !inInput) {
    e.preventDefault();
    if (state.highlightRootId !== null) {
      state.highlightDepth = Math.max(1, state.highlightDepth - 1);
      renderCanvas();
      renderConnections();
      showToast(t('highlight-depth', { depth: state.highlightDepth }));
    }
    return;
  }
  // Ctrl+] → Increase highlight depth
  if (e.ctrlKey && e.key === ']' && !inInput) {
    e.preventDefault();
    if (state.highlightRootId !== null) {
      state.highlightDepth = Math.min(10, state.highlightDepth + 1);
      renderCanvas();
      renderConnections();
      showToast(t('highlight-depth', { depth: state.highlightDepth }));
    }
    return;
  }
  // Alt+Alignment → Align / distribute selected cards
  if (e.altKey && !inInput) {
    if (e.code === 'KeyL') { alignLeft(); return; }
    if (e.code === 'KeyR') { alignRight(); return; }
    if (e.code === 'KeyT') { alignTop(); return; }
    if (e.code === 'KeyB') { alignBottom(); return; }
    if (e.code === 'KeyH' && !e.shiftKey) { alignCenterH(); return; }
    if (e.code === 'KeyV' && !e.shiftKey) { alignCenterV(); return; }
    if (e.code === 'KeyH' && e.shiftKey) { distributeH(); return; }
    if (e.code === 'KeyV' && e.shiftKey) { distributeV(); return; }
  }
  // Escape → Close panels
  if (e.key === 'Escape') {
    closeCapture();
    closeAiPanel();
    closeRenameModal();
    closeBranchModal();
    closeGroupModal();
    closeSpaceModal();
    state.selectedCards.clear();
    if (state.highlightRootId !== null) {
      state.highlightRootId = null;
      showToast(t('highlight-off'));
    }
    renderCanvas();
    renderConnections();
    return;
  }
  // Delete → Delete selected (only when not in text input)
  if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput) {
    if (state.selectedCards.size > 0) {
      e.preventDefault();
      contextAction('delete');
    }
  }
  // Ctrl+A → Select all canvas cards (allow native in text inputs)
  if (e.ctrlKey && e.key === 'a') {
    if (inInput) return; // let native select-all work
    e.preventDefault();
    state.cards.filter(c => c.inCanvas).forEach(c => state.selectedCards.add(c.id));
    renderCanvas();
    renderConnections();
  }
  // Ctrl+D → Duplicate selected cards
  if (e.ctrlKey && e.key === 'd' && !inInput) {
    if (state.selectedCards.size > 0) {
      e.preventDefault();
      pushUndo();
      const newIds = new Map<number, number>();
      const selected = state.cards.filter(c => state.selectedCards.has(c.id));
      selected.forEach(c => {
        const newId = state.nextId++;
        newIds.set(c.id, newId);
        state.cards.push({
          ...c,
          id: newId,
          x: c.x + 30,
          y: c.y + 30,
          time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        });
      });
      // Duplicate connections between selected cards
      state.connections.forEach(conn => {
        if (newIds.has(conn.from) && newIds.has(conn.to)) {
          state.connections.push({ from: newIds.get(conn.from)!, to: newIds.get(conn.to)!, label: conn.label });
        }
      });
      state.selectedCards.clear();
      newIds.forEach(newId => state.selectedCards.add(newId));
      renderCanvas();
      renderConnections();
      scheduleSave();
      showToast(`已复制 ${selected.length} 张卡片`);
    }
  }
}

// ── Document click: close context menus ──
function onDocumentClick(e: MouseEvent): void {
  closeAllContextMenus();
}

// ── Image processing: blob → compressed base64 → card ──
const IMAGE_MAX_SIZE = 500 * 1024; // 500KB threshold for compression

function processImageFile(file: File, screenX: number, screenY: number, toastKey: string): void {
  const imageName = file.name || '';
  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result as string;
    // Compress if base64 is large
    if (result.length > IMAGE_MAX_SIZE) {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 1200;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.7);
        createImageCard(compressed, screenX, screenY, toastKey, imageName);
      };
      img.src = result;
    } else {
      createImageCard(result, screenX, screenY, toastKey, imageName);
    }
  };
  reader.readAsDataURL(file);
}

function createImageCard(dataUrl: string, screenX: number, screenY: number, toastKey: string, imageName?: string): void {
  const pos = screenToCanvas(screenX, screenY);
  pushUndo();
  const now = new Date();
  const card = {
    id: state.nextId++,
    text: imageName || '',
    source: t('source-nexus'),
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    status: '' as const,
    inCanvas: true,
    x: Math.round(pos.x - 120),
    y: Math.round(pos.y - 60),
    type: 'image' as const,
    metadata: { imageData: dataUrl, imageName: imageName || '' },
  };
  state.cards.push(card);
  renderCanvas();
  renderConnections();
  scheduleSave();
  showToast(t(toastKey));
}

// ── Canvas paste (image from clipboard) ──
function onCanvasPaste(e: ClipboardEvent): void {
  if (isTextInputFocused()) return;
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) processImageFile(file, lastCanvasMouse.x, lastCanvasMouse.y, 'toast-image-pasted');
      return;
    }
  }
}

// ── Canvas drop (inbox → canvas, or image file → canvas) ──
function onCanvasDrop(e: DragEvent): void {
  e.preventDefault();

  // Check for dropped image files first
  if (e.dataTransfer?.files?.length) {
    for (const file of Array.from(e.dataTransfer.files)) {
      if (file.type.startsWith('image/')) {
        processImageFile(file, e.clientX, e.clientY, 'toast-image-dropped');
      }
    }
    return;
  }

  // Fallback: card ID drop (inbox → canvas)
  const id = parseInt(e.dataTransfer!.getData('text/plain'));
  const card = state.cards.find(c => c.id === id);
  if (!card) return;

  const pos = screenToCanvas(e.clientX, e.clientY);
  card.inCanvas = true;
  card.x = Math.round(pos.x - 120);
  card.y = Math.round(pos.y - 30);

  renderInbox();
  renderCanvas();
  renderConnections();
  scheduleSave();
  showToast(t('toast-card-added'));
}

function onCanvasDragOver(e: DragEvent): void {
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'copy';
}

// ── Inbox card events ──
export function onInboxDragStart(e: DragEvent, id: number): void {
  e.dataTransfer!.setData('text/plain', String(id));
  (e.target as HTMLElement).classList.add('dragging');
}

export function onInboxDragEnd(e: DragEvent): void {
  (e.target as HTMLElement).classList.remove('dragging');
}

// ── Wire up delegated event listeners ──
export function initInteractions(): void {
  document.addEventListener('mousemove', onDocumentMouseMove);
  document.addEventListener('mouseup', onDocumentMouseUp);
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('paste', onCanvasPaste);

  // Prevent text selection during panning
  document.addEventListener('selectstart', (e) => {
    if (isPanning) e.preventDefault();
  });

  const canvasArea = document.getElementById('canvasArea');
  if (canvasArea) {
    canvasArea.addEventListener('mousedown', onCanvasAreaMouseDown);
    canvasArea.addEventListener('wheel', onCanvasAreaWheel, { passive: false });
    canvasArea.addEventListener('dragover', onCanvasDragOver);
    canvasArea.addEventListener('drop', onCanvasDrop);

    // Delegated event listeners for canvas cards
    canvasArea.addEventListener('mousedown', (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Group connection port (must check before card, since group ports are in .canvas-group)
      const groupPort = target.closest('.canvas-group [data-action="connect"]') as HTMLElement | null;
      if (groupPort) {
        const gid = parseInt((groupPort.closest('[data-group-id]') as HTMLElement).dataset.groupId!);
        startConnect(e, connId(gid, true));
        return;
      }

      const card = target.closest('.canvas-card') as HTMLElement | null;
      if (!card) return;
      const id = parseInt(card.getAttribute('data-id')!);

      // Card connection port
      if (target.closest('[data-action="connect"]')) {
        startConnect(e, id);
        return;
      }
      // Wikilink click
      const wikilink = target.closest('.wikilink') as HTMLElement | null;
      if (wikilink) {
        e.stopPropagation();
        const targetId = parseInt(wikilink.dataset.wikiTarget!);
        if (targetId >= 0) {
          state.selectedCards.clear();
          state.selectedCards.add(targetId);
          renderCanvas();
          renderConnections();
        }
        return;
      }
      // AI button
      if (target.closest('[data-action="card-ai"]')) {
        e.stopPropagation();
        openCardAiPopup(id);
        return;
      }
      // Normal card drag
      onCanvasCardMouseDown(e, id);
    });

    canvasArea.addEventListener('dblclick', (e: MouseEvent) => {
      const card = (e.target as HTMLElement).closest('.canvas-card') as HTMLElement | null;
      if (card) {
        onCanvasCardDblClick(e, parseInt(card.getAttribute('data-id')!));
      }
    });

    canvasArea.addEventListener('contextmenu', (e: MouseEvent) => {
      const card = (e.target as HTMLElement).closest('.canvas-card') as HTMLElement | null;
      if (card) {
        e.preventDefault();
        const id = parseInt(card.getAttribute('data-id')!);
        if (!state.selectedCards.has(id)) {
          state.selectedCards.clear();
          state.selectedCards.add(id);
          renderCanvas();
        }
        showCanvasContextMenu(e, id);
      }
    });
  }

  // Inbox delegated events
  const inboxList = document.getElementById('inboxList');
  if (inboxList) {
    inboxList.addEventListener('dragstart', (e: DragEvent) => {
      const card = (e.target as HTMLElement).closest('.inbox-card') as HTMLElement | null;
      if (card) onInboxDragStart(e, parseInt(card.getAttribute('data-id')!));
    });
    inboxList.addEventListener('dragend', (e: DragEvent) => {
      onInboxDragEnd(e);
    });
    inboxList.addEventListener('contextmenu', (e: MouseEvent) => {
      const card = (e.target as HTMLElement).closest('.inbox-card') as HTMLElement | null;
      if (card) {
        e.preventDefault();
        showInboxContextMenu(e, parseInt(card.getAttribute('data-id')!));
      }
    });
  }

  // Connection label delegated events (on canvasInner)
  const canvasInner = document.getElementById('canvasInner');
  if (canvasInner) {
    canvasInner.addEventListener('click', (e: MouseEvent) => {
      // Group lock toggle
      const lockEl = (e.target as HTMLElement).closest('.group-lock') as HTMLElement | null;
      if (lockEl && !state.didDrag) {
        e.stopPropagation();
        const gid = parseInt(lockEl.dataset.groupId!);
        const group = state.groups.find(g => g.id === gid);
        if (group) {
          group.locked = !group.locked;
          renderCanvas();
          scheduleSave();
          showToast(group.locked ? '🔗 已锁定：卡片作为整体移动' : '🔓 已解锁：卡片可独立移动');
        }
        return;
      }

      // Group toggle (click toggle icon or collapsed pill — only if not dragged)
      const toggle = (e.target as HTMLElement).closest('.group-toggle') as HTMLElement | null;
      const collapsedPill = (e.target as HTMLElement).closest('.canvas-group.collapsed') as HTMLElement | null;
      const toggleEl = toggle || collapsedPill;
      if (toggleEl && !state.didDrag) {
        const gid = parseInt(toggleEl.dataset.groupId!);
        const group = state.groups.find(g => g.id === gid);
        if (group) {
          group.collapsed = !group.collapsed;
          // Also collapse/expand nested child groups
          const setChildCollapsed = (parentId: number, collapsed: boolean) => {
            state.groups.filter(g => g.parentId === parentId).forEach(g => {
              g.collapsed = collapsed;
              setChildCollapsed(g.id, collapsed);
            });
          };
          setChildCollapsed(group.id, group.collapsed);
          renderCanvas();
          renderConnections();
          scheduleSave();
        }
      }
    });
    canvasInner.addEventListener('contextmenu', (e: MouseEvent) => {
      const label = (e.target as HTMLElement).closest('.conn-label') as HTMLElement | null;
      if (label) {
        e.preventDefault();
        const from = parseInt(label.dataset.connFrom!);
        const to = parseInt(label.dataset.connTo!);
        const conn = state.connections.find(c => c.from === from && c.to === to);
        if (conn) showConnContextMenu(e, conn);
        return;
      }
      // Right-click on group bounding box (empty area)
      const groupBg = (e.target as HTMLElement).closest('.group-bg') as HTMLElement | null;
      if (groupBg) {
        e.preventDefault();
        const gid = parseInt(groupBg.dataset.groupId!);
        showGroupContextMenu(e, gid);
      }
    });

    // Collapsed pill drag start
    canvasInner.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      const pill = (e.target as HTMLElement).closest('.canvas-group.collapsed') as HTMLElement | null;
      if (!pill) return;
      e.preventDefault();
      const gid = parseInt(pill.dataset.groupId!);
      const group = state.groups.find(g => g.id === gid);
      if (!group) return;

      state.draggingGroupId = gid;
      state.dragStartMouse = { x: e.clientX, y: e.clientY };
      state.dragStartPositions = {};
      state.didDrag = false;
      group.cardIds.forEach(cid => {
        const sc = state.cards.find(c => c.id === cid);
        if (sc) state.dragStartPositions![cid] = { x: sc.x, y: sc.y };
      });
    });
  }
}
