// ═══════════════════════════════════════════════════════
// Outline view: tree structure of canvas cards by connections
// ═══════════════════════════════════════════════════════
import { state } from '../../core/types/state';
import { t } from '../../i18n';
import { renderCanvas, renderConnections } from '../canvas/renderer';

interface TreeNode {
  id: number;
  text: string;
  source: string;
  children: TreeNode[];
}

/** Build a tree from canvas cards and connections. */
function buildTree(): TreeNode[] {
  const canvasCards = state.cards.filter(c => c.inCanvas);
  const childIds = new Set(state.connections.map(c => c.to));

  // Root nodes: cards that are never a "to" target
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

  // Nodes that are not children of anyone = roots
  // Also include orphan nodes (no connections at all)
  const added = new Set<number>();
  for (const c of canvasCards) {
    if (!childIds.has(c.id)) {
      const node = nodeMap.get(c.id)!;
      roots.push(node);
      added.add(c.id);
    }
  }

  // Orphan nodes (no connections at all) — also add as roots
  for (const c of canvasCards) {
    if (!added.has(c.id)) {
      const hasConn = state.connections.some(conn => conn.from === c.id || conn.to === c.id);
      if (!hasConn) {
        roots.push(nodeMap.get(c.id)!);
      }
    }
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
  return `<div class="outline-item" data-id="${node.id}" style="padding-left:${12 + depth * 16}px">
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

  list.addEventListener('click', (e: MouseEvent) => {
    const item = (e.target as HTMLElement).closest('.outline-item') as HTMLElement | null;
    if (!item) return;
    const id = parseInt(item.dataset.id!);
    // Select the card and pan to it
    state.selectedCards.clear();
    state.selectedCards.add(id);
    renderCanvas();
    renderConnections();

    // Highlight the outline item
    list.querySelectorAll('.outline-item.active').forEach(el => el.classList.remove('active'));
    item.classList.add('active');
  });
}
