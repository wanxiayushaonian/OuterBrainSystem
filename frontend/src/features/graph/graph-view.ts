// ═══════════════════════════════════════════════════════
// Knowledge Graph Visualization
// ═══════════════════════════════════════════════════════
import { state } from '../../core/types/state';
import { t, escapeHtml } from '../../i18n';
import type { GraphData, GraphEntity } from '../../core/types/types';
import { ForceGraphLayout, type ForceNode } from './force-layout';
import { fetchGraph, extractGraph, applyGraph } from './graph-api';

let overlay: HTMLElement | null = null;
let svgEl: SVGSVGElement | null = null;
let detailPanel: HTMLElement | null = null;
let layout: ForceGraphLayout | null = null;
let animFrame: number | null = null;
let currentData: GraphData | null = null;
let selectedEntity: GraphEntity | null = null;
let activeFilters: Set<string> = new Set(['concept', 'person', 'theory', 'tool', 'method', 'event']);

// Zoom and pan state
let graphZoom = 1;
let graphPan = { x: 0, y: 0 };
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const ZOOM_SENSITIVITY = 0.001;

// Interaction state
let isInteracting = false; // true during drag or pan

const ENTITY_COLORS: Record<string, string> = {
  concept: 'oklch(55% 0.16 255)',
  person: 'oklch(55% 0.16 145)',
  theory: 'oklch(55% 0.16 300)',
  tool: 'oklch(55% 0.16 35)',
  method: 'oklch(55% 0.16 170)',
  event: 'oklch(55% 0.16 25)',
};

const RELATION_COLORS: Record<string, string> = {
  is_a: 'oklch(55% 0.16 255)',
  part_of: 'oklch(55% 0.16 300)',
  causes: 'oklch(55% 0.16 35)',
  uses: 'oklch(55% 0.16 145)',
  related_to: 'oklch(54% 0.012 250)',
  contradicts: 'oklch(55% 0.16 25)',
};

function getEntityColor(entityType: string): string {
  return ENTITY_COLORS[entityType] || 'oklch(55% 0.01 250)';
}

function getRelationColor(relationType: string): string {
  return RELATION_COLORS[relationType] || 'oklch(54% 0.012 250)';
}

/** Stop animation loop. */
function stopAnimation(): void {
  if (animFrame) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }
}

/** Initialize the graph view module. */
export function initGraphView(): void {
  overlay = document.getElementById('graphOverlay');
  svgEl = document.getElementById('graphSvg') as unknown as SVGSVGElement;
  detailPanel = document.getElementById('graphDetail');

  if (!overlay || !svgEl) return;

  // Close button
  document.getElementById('graphCloseBtn')?.addEventListener('click', closeGraph);

  // Extract button
  document.getElementById('graphExtractBtn')?.addEventListener('click', handleExtract);

  // Detail close
  document.getElementById('graphDetailClose')?.addEventListener('click', () => {
    detailPanel?.classList.remove('open');
    selectedEntity = null;
  });

  // SVG interactions — use pointer events for consistency
  svgEl.addEventListener('pointerdown', handlePointerDown);
  svgEl.addEventListener('pointermove', handlePointerMove);
  svgEl.addEventListener('pointerup', handlePointerUp);
  svgEl.addEventListener('pointerleave', handlePointerUp);
  svgEl.addEventListener('wheel', handleWheel, { passive: false });

  // Prevent context menu on SVG
  svgEl.addEventListener('contextmenu', e => e.preventDefault());

  // Filter buttons
  overlay.querySelectorAll('.graph-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = (btn as HTMLElement).dataset.entityType;
      if (type) toggleFilter(type);
    });
  });
}

/** Open the graph view. */
export async function openGraph(): Promise<void> {
  if (!overlay) return;
  overlay.classList.add('open');

  // Load existing graph or extract
  if (state.currentSpaceId) {
    try {
      currentData = await fetchGraph(state.currentSpaceId);
      if (currentData.entities.length === 0) {
        await handleExtract();
      } else {
        renderGraph();
      }
    } catch (e) {
      console.warn('Failed to load graph:', e);
      await handleExtract();
    }
  }
}

/** Close the graph view. */
export function closeGraph(): void {
  if (!overlay) return;
  overlay.classList.remove('open');
  stopAnimation();
  currentData = null;
  selectedEntity = null;
  layout = null;
}

/** Handle extract button click. */
async function handleExtract(): Promise<void> {
  const canvasCards = state.cards.filter(c => c.inCanvas);
  if (canvasCards.length < 2) return;

  const extractBtn = document.getElementById('graphExtractBtn');
  if (extractBtn) extractBtn.textContent = t('graph-extracting');

  try {
    currentData = await extractGraph(canvasCards, state.connections);
    if (currentData.entities.length > 0 && state.currentSpaceId) {
      await applyGraph(state.currentSpaceId, currentData);
    }
    renderGraph();
  } catch (e) {
    console.error('Graph extraction failed:', e);
  } finally {
    if (extractBtn) extractBtn.textContent = t('graph-extract');
  }
}

/** Render the graph visualization. */
function renderGraph(): void {
  if (!svgEl || !currentData) return;

  // Reset zoom and pan
  graphZoom = 1;
  graphPan = { x: 0, y: 0 };
  isInteracting = false;

  // Filter entities
  const filteredEntities = currentData.entities.filter(e => activeFilters.has(e.entity_type));
  const filteredEntityIds = new Set(filteredEntities.map(e => e.id));
  const filteredRelations = currentData.relations.filter(
    r => filteredEntityIds.has(r.source_id) && filteredEntityIds.has(r.target_id)
  );

  // Get canvas card positions for initial layout
  const cardPositions = new Map<number, { x: number; y: number }>();
  for (const card of state.cards) {
    if (card.inCanvas) {
      cardPositions.set(card.id, { x: card.x, y: card.y });
    }
  }

  // Initialize layout
  const rect = svgEl.getBoundingClientRect();
  layout = new ForceGraphLayout(rect.width, rect.height);
  layout.init(filteredEntities, filteredRelations, cardPositions);

  // Start animation loop
  stopAnimation();
  animate();
}

/** Animation loop for force simulation. */
function animate(): void {
  if (!layout || !svgEl || isInteracting) return;

  layout.tick();
  renderSvg();

  if (!layout.converge()) {
    animFrame = requestAnimationFrame(animate);
  }
}

/** Full SVG re-render (used during animation and after filter changes). */
function renderSvg(): void {
  if (!layout || !svgEl) return;

  let svg = '';

  // Transform group for zoom/pan
  svg += `<g class="kg-transform" transform="translate(${graphPan.x},${graphPan.y}) scale(${graphZoom})">`;

  // Arrow markers
  svg += `<defs>`;
  for (const [type, color] of Object.entries(RELATION_COLORS)) {
    svg += `<marker id="arrow-${type}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="${color}" opacity="0.7"/>
    </marker>`;
  }
  svg += `</defs>`;

  // Edges
  for (let i = 0; i < layout.edges.length; i++) {
    const edge = layout.edges[i];
    const source = layout.nodes[edge.source];
    const target = layout.nodes[edge.target];
    if (!source || !target) continue;

    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    const color = getRelationColor(edge.relation.relation_type);

    svg += `<path class="graph-edge" data-edge-idx="${i}" d="M${source.x},${source.y} L${target.x},${target.y}"
      stroke="${color}" stroke-width="1.5" fill="none" opacity="0.5" marker-end="url(#arrow-${edge.relation.relation_type})"/>`;

    svg += `<text class="graph-edge-label" data-edge-idx="${i}" x="${midX}" y="${midY - 6}"
      font="600 10px/1 var(--font-body)" fill="var(--muted)" text-anchor="middle" pointer-events="none">${escapeHtml(edge.relation.relation_type)}</text>`;
  }

  // Nodes
  for (const node of layout.nodes) {
    const color = getEntityColor(node.entity.entity_type);
    const isSelected = selectedEntity?.id === node.entity.id;

    svg += `<g class="graph-node" data-entity-id="${node.entity.id}" transform="translate(${node.x},${node.y})" style="cursor:pointer">
      <circle class="graph-node-circle" r="${node.radius}" fill="${color}"
        stroke="${isSelected ? 'var(--accent)' : 'var(--surface)'}"
        stroke-width="${isSelected ? 3 : 2}"
        filter="drop-shadow(0 2px 4px oklch(0% 0 0 / 0.15))"/>
      <text class="graph-node-label" y="-6" font="600 11px/1 var(--font-body)" fill="var(--fg)" text-anchor="middle" pointer-events="none">${escapeHtml(node.entity.name)}</text>
      <text class="graph-node-type" y="8" font="9px/1 var(--font-mono)" fill="var(--muted)" text-anchor="middle" pointer-events="none">${node.entity.entity_type}</text>
    </g>`;
  }

  svg += `</g>`;

  svgEl.innerHTML = svg;

  // Add click handlers to nodes for detail panel
  svgEl.querySelectorAll('.graph-node').forEach(nodeEl => {
    nodeEl.addEventListener('click', (e) => {
      if (isInteracting) return; // ignore click after drag
      e.stopPropagation();
      const entityId = parseInt((nodeEl as HTMLElement).dataset.entityId!);
      selectEntity(entityId);
    });
  });
}

/** Select an entity and show detail panel. */
function selectEntity(entityId: number): void {
  if (!currentData) return;

  selectedEntity = currentData.entities.find(e => e.id === entityId) || null;
  if (!selectedEntity || !detailPanel) return;

  const titleEl = detailPanel.querySelector('.graph-detail-title');
  const typeEl = detailPanel.querySelector('.graph-detail-type');
  const descEl = detailPanel.querySelector('.graph-detail-desc');
  const cardsList = detailPanel.querySelector('.graph-detail-cards');

  if (titleEl) titleEl.textContent = selectedEntity.name;
  if (typeEl) typeEl.textContent = selectedEntity.entity_type;
  if (descEl) descEl.textContent = selectedEntity.description || '';

  if (cardsList) {
    const cards = state.cards.filter(c => selectedEntity!.card_ids.includes(c.id));
    cardsList.innerHTML = cards.map(c => {
      const preview = c.text.length > 50 ? c.text.slice(0, 50) + '…' : c.text;
      return `<div class="graph-detail-card" data-card-id="${c.id}">${escapeHtml(preview)}</div>`;
    }).join('');

    cardsList.querySelectorAll('.graph-detail-card').forEach(cardEl => {
      cardEl.addEventListener('click', () => {
        const cardId = parseInt((cardEl as HTMLElement).dataset.cardId!);
        navigateToCard(cardId);
      });
    });
  }

  detailPanel.classList.add('open');
  renderSvg();
}

/** Navigate to a card on the main canvas. */
function navigateToCard(cardId: number): void {
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;

  closeGraph();

  const area = document.getElementById('canvasArea');
  if (area) {
    const rect = area.getBoundingClientRect();
    state.pan.x = rect.width / 2 - (card.x + 120) * state.zoom;
    state.pan.y = rect.height / 2 - (card.y + 40) * state.zoom;

    import('../canvas/transform').then(({ applyTransform }) => {
      applyTransform();
    });
  }

  state.selectedCards.clear();
  state.selectedCards.add(cardId);

  import('../canvas/renderer').then(({ renderCanvas, renderConnections }) => {
    renderCanvas();
    renderConnections();
  });
}

/** Toggle entity type filter. */
function toggleFilter(entityType: string): void {
  if (activeFilters.has(entityType)) {
    activeFilters.delete(entityType);
  } else {
    activeFilters.add(entityType);
  }

  overlay?.querySelectorAll('.graph-filter-btn').forEach(btn => {
    const type = (btn as HTMLElement).dataset.entityType;
    btn.classList.toggle('active', activeFilters.has(type!));
  });

  renderGraph();
}

// ── Pointer interaction ──

let dragTarget: 'node' | 'pan' | null = null;
let dragNode: ForceNode | null = null;
let dragOffset = { x: 0, y: 0 };
let lastPointer = { x: 0, y: 0 };
let pointerDownPos = { x: 0, y: 0 };

function handlePointerDown(e: PointerEvent): void {
  if (!layout || !svgEl) return;
  e.preventDefault();
  svgEl.setPointerCapture(e.pointerId);

  const rect = svgEl.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const gx = (sx - graphPan.x) / graphZoom;
  const gy = (sy - graphPan.y) / graphZoom;

  pointerDownPos = { x: e.clientX, y: e.clientY };
  lastPointer = { x: e.clientX, y: e.clientY };

  const node = layout.findNodeAt(gx, gy);
  if (node) {
    dragTarget = 'node';
    dragNode = node;
    dragOffset.x = gx - node.x;
    dragOffset.y = gy - node.y;
    isInteracting = true;
    stopAnimation();
    layout.pinNode(node.id, node.x, node.y);
    svgEl.style.cursor = 'grabbing';
  } else {
    dragTarget = 'pan';
    isInteracting = true;
    stopAnimation();
    svgEl.style.cursor = 'grabbing';
  }
}

function handlePointerMove(e: PointerEvent): void {
  if (!svgEl || !dragTarget) return;

  const dx = e.clientX - lastPointer.x;
  const dy = e.clientY - lastPointer.y;
  lastPointer = { x: e.clientX, y: e.clientY };

  if (dragTarget === 'node' && dragNode && layout) {
    const rect = svgEl.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const gx = (sx - graphPan.x) / graphZoom;
    const gy = (sy - graphPan.y) / graphZoom;

    const newX = gx - dragOffset.x;
    const newY = gy - dragOffset.y;
    layout.pinNode(dragNode.id, newX, newY);

    // Update node transform
    const nodeEl = svgEl.querySelector<SVGElement>(`[data-entity-id="${dragNode.id}"]`);
    if (nodeEl) nodeEl.setAttribute('transform', `translate(${newX},${newY})`);

    // Update connected edges
    updateEdgesForNode(dragNode);
  } else if (dragTarget === 'pan') {
    graphPan.x += dx;
    graphPan.y += dy;

    // Update transform group
    const tg = svgEl.querySelector<SVGElement>('.kg-transform');
    if (tg) tg.setAttribute('transform', `translate(${graphPan.x},${graphPan.y}) scale(${graphZoom})`);
  }
}

function handlePointerUp(e: PointerEvent): void {
  if (!svgEl) return;

  svgEl.style.cursor = 'default';

  let wasDrag = false;

  if (dragTarget === 'node' && dragNode && layout) {
    wasDrag = Math.abs(e.clientX - pointerDownPos.x) + Math.abs(e.clientY - pointerDownPos.y) >= 5;

    layout.unpinNode(dragNode.id);

    if (!wasDrag) {
      // Minimal movement = click, select the entity
      selectEntity(dragNode.id);
    }

    dragNode = null;
  }

  dragTarget = null;
  isInteracting = false;

  // After dragging a node, force simulation must re-run to reach new equilibrium.
  // The unpinned node has zero velocity so converge() would return true immediately —
  // we must restart unconditionally.
  if (layout && wasDrag) {
    stopAnimation();
    animate();
  }
}

function handleWheel(e: WheelEvent): void {
  e.preventDefault();
  if (!svgEl) return;

  const rect = svgEl.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const delta = -e.deltaY * ZOOM_SENSITIVITY;
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, graphZoom * (1 + delta)));

  // Zoom toward mouse position
  const ratio = newZoom / graphZoom;
  graphPan.x = mx - (mx - graphPan.x) * ratio;
  graphPan.y = my - (my - graphPan.y) * ratio;
  graphZoom = newZoom;

  const tg = svgEl.querySelector<SVGElement>('.kg-transform');
  if (tg) tg.setAttribute('transform', `translate(${graphPan.x},${graphPan.y}) scale(${graphZoom})`);
}

/** Update edges connected to a dragged node via direct DOM manipulation. */
function updateEdgesForNode(node: ForceNode): void {
  if (!layout || !svgEl) return;

  for (let i = 0; i < layout.edges.length; i++) {
    const edge = layout.edges[i];
    const src = layout.nodes[edge.source];
    const tgt = layout.nodes[edge.target];
    if (src.id !== node.id && tgt.id !== node.id) continue;

    const path = svgEl.querySelector<SVGPathElement>(`path.graph-edge[data-edge-idx="${i}"]`);
    if (path) path.setAttribute('d', `M${src.x},${src.y} L${tgt.x},${tgt.y}`);

    const label = svgEl.querySelector<SVGTextElement>(`text.graph-edge-label[data-edge-idx="${i}"]`);
    if (label) {
      label.setAttribute('x', String((src.x + tgt.x) / 2));
      label.setAttribute('y', String((src.y + tgt.y) / 2 - 6));
    }
  }
}
