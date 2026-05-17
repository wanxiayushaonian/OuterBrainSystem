// ═══════════════════════════════════════════════════════
// Outline view: tree structure of canvas cards by connections
// Supports drag-to-reorder and viewport panning on click
// ═══════════════════════════════════════════════════════
import { state } from '../../core/types/state';
import { t } from '../../i18n';
import { renderCanvas, renderConnections } from '../canvas/renderer';
import { applyTransform } from '../canvas/transform';

interface TreeNode {
  id: number;
  text: string;
  source: string;
  children: TreeNode[];
}

const ORDER_KEY = 'nexus-outline-order';

function loadOrder(): number[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveOrder(ids: number[]): void {
  localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
}

/** Build a tree from canvas cards and connections. */
function buildTree(): TreeNode[] {
  const canvasCards = state.cards.filter(c => c.inCanvas);
  const childIds = new Set(state.connections.map(c => c.to));

  const roots: TreeNode[] = [];
  const nodeMap = new Map<number, TreeNode>();

  for (const c of canvasCards) {
    nodeMap.set(c.id, { id: c.id, text: c.text, source: c.source, children: [] });
  }

  for (const conn of state.connections) {
    const parent = nodeMap.get(conn.from);
    const child = nodeMap.get(conn.to);
    if (parent && child && !parent.children.some(c => c.id === child.id)) {
      parent.children.push(child);
    }
  }

  const added = new Set<number>();
  for (const c of canvasCards) {
    if (!childIds.has(c.id)) {
      const node = nodeMap.get(c.id)!;
      roots.push(node);
      added.add(c.id);
    }
  }

  for (const c of canvasCards) {
    if (!added.has(c.id)) {
      const hasConn = state.connections.some(conn => conn.from === c.id || conn.to === c.id);
      if (!hasConn) {
        roots.push(nodeMap.get(c.id)!);
      }
    }
  }

  // Sort roots by persisted order
  const order = loadOrder();
  if (order.length > 0) {
    const orderMap = new Map(order.map((id, idx) => [id, idx]));
    roots.sort((a, b) => {
      const ai = orderMap.has(a.id) ? orderMap.get(a.id)! : Infinity;
      const bi = orderMap.has(b.id) ? orderMap.get(b.id)! : Infinity;
      return ai - bi;
    });
  }

  return roots;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function renderTreeNode(node: TreeNode, depth: number, visited = new Set<number>()): string {
  if (visited.has(node.id)) return '';
  visited.add(node.id);
  const connCount = state.connections.filter(c => c.from === node.id || c.to === node.id).length;
  const childHtml = node.children.map(c => renderTreeNode(c, depth + 1, visited)).join('');
  return `<div class="outline-item" data-id="${node.id}" draggable="true" style="padding-left:${12 + depth * 16}px">
    <span class="outline-bullet">${node.children.length > 0 ? '◆' : '◇'}</span>
    <span class="outline-text">${truncate(node.text, 60)}</span>
    ${connCount > 0 ? `<span class="outline-conn-count">${connCount}</span>` : ''}
  </div>${childHtml}`;
}

export function renderOutline(): void {
  const list = document.getElementById('inboxList');
  const countEl = document.getElementById('inboxCount');
  if (!list) return;

  const canvasCards = state.cards.filter(c => c.inCanvas);
  if (countEl) countEl.textContent = String(canvasCards.length);

  if (canvasCards.length === 0) {
    list.innerHTML = `<div class="outline-empty">${t('outline-empty')}</div>`;
    return;
  }

  const tree = buildTree();
  list.innerHTML = tree.map(n => renderTreeNode(n, 0)).join('');
}

export function initOutline(): void {
  const list = document.getElementById('inboxList');
  if (!list) return;

  // Click: select card and pan viewport to it
  list.addEventListener('click', (e: MouseEvent) => {
    const item = (e.target as HTMLElement).closest('.outline-item') as HTMLElement | null;
    if (!item) return;
    const id = parseInt(item.dataset.id!);

    state.selectedCards.clear();
    state.selectedCards.add(id);

    // Pan viewport to center on the selected card
    const card = state.cards.find(c => c.id === id);
    if (card) {
      const canvasArea = document.getElementById('canvasArea');
      if (canvasArea) {
        const rect = canvasArea.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const cardCenterX = card.x + 120;
        const cardCenterY = card.y + 40;
        state.pan.x = centerX - cardCenterX * state.zoom;
        state.pan.y = centerY - cardCenterY * state.zoom;
        applyTransform();
      }
    }

    renderCanvas();
    renderConnections();

    list.querySelectorAll('.outline-item.active').forEach(el => el.classList.remove('active'));
    item.classList.add('active');
  });

  // Drag-and-drop event delegation for reordering
  let draggedId: string | null = null;

  list.addEventListener('dragstart', (e: DragEvent) => {
    const item = (e.target as HTMLElement).closest('.outline-item') as HTMLElement | null;
    if (!item) return;
    draggedId = item.dataset.id || null;
    if (draggedId) {
      e.dataTransfer!.setData('text/plain', draggedId);
      item.classList.add('dragging');
    }
  });

  list.addEventListener('dragend', (e: DragEvent) => {
    const item = (e.target as HTMLElement).closest('.outline-item') as HTMLElement | null;
    if (item) item.classList.remove('dragging');
    draggedId = null;
  });

  list.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault();
    const item = (e.target as HTMLElement).closest('.outline-item') as HTMLElement | null;
    if (item && item.dataset.id !== draggedId) {
      item.classList.add('drag-over');
    }
  });

  list.addEventListener('dragleave', (e: DragEvent) => {
    const item = (e.target as HTMLElement).closest('.outline-item') as HTMLElement | null;
    if (item) item.classList.remove('drag-over');
  });

  list.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    const item = (e.target as HTMLElement).closest('.outline-item') as HTMLElement | null;
    if (!item) return;
    item.classList.remove('drag-over');

    const targetId = item.dataset.id;
    if (!draggedId || !targetId || draggedId === targetId) return;

    // Get current root order
    const tree = buildTree();
    const rootIds = tree.map(n => n.id);

    const dragIdx = rootIds.indexOf(parseInt(draggedId));
    const targetIdx = rootIds.indexOf(parseInt(targetId));
    if (dragIdx === -1 || targetIdx === -1) return;

    // Reorder
    const [moved] = rootIds.splice(dragIdx, 1);
    rootIds.splice(targetIdx, 0, moved);
    saveOrder(rootIds);

    renderOutline();
  });
}
