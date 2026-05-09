// ═══════════════════════════════════════════════════════
// Auto-layout — hierarchical graph layout for AI-created cards
// ═══════════════════════════════════════════════════════
import { state, scheduleSave } from '../../core/types/state';
import type { Card } from '../../core/types/types';
import { renderCanvas, renderConnections } from './renderer';

const CARD_W = 220;
const CARD_H = 100;
const H_GAP = 60;
const V_GAP = 50;

/**
 * Auto-layout newly created cards using a hierarchical (Sugiyama-style) algorithm.
 * Only moves cards whose IDs are in `newCardIds`.
 * Preserves existing card positions.
 */
export function autoLayout(newCardIds: number[], onComplete?: () => void): void {
  if (newCardIds.length === 0) { onComplete?.(); return; }

  const newSet = new Set(newCardIds);
  const newCards = state.cards.filter(c => newSet.has(c.id));
  if (newCards.length === 0) { onComplete?.(); return; }

  // Build adjacency from connections involving new cards
  const connections = state.connections.filter(
    c => newSet.has(c.from) || newSet.has(c.to)
  );

  // Build directed graph (from → to)
  const children = new Map<number, number[]>();
  const parents = new Map<number, number[]>();

  for (const id of newCardIds) {
    children.set(id, []);
    parents.set(id, []);
  }

  for (const conn of connections) {
    if (newSet.has(conn.from) && newSet.has(conn.to)) {
      children.get(conn.from)?.push(conn.to);
      parents.get(conn.to)?.push(conn.from);
    }
  }

  // Find roots (no incoming edges within new set)
  const roots: number[] = [];
  for (const id of newCardIds) {
    if ((parents.get(id) || []).length === 0) {
      roots.push(id);
    }
  }
  // If no roots found (cycles or disconnected), use first card
  if (roots.length === 0 && newCardIds.length > 0) {
    roots.push(newCardIds[0]);
  }

  // Assign layers via BFS
  const layerMap = new Map<number, number>();
  const visited = new Set<number>();
  const queue: number[] = [...roots];
  for (const r of roots) {
    layerMap.set(r, 0);
    visited.add(r);
  }

  while (queue.length > 0) {
    const node = queue.shift()!;
    const layer = layerMap.get(node)!;
    for (const child of (children.get(node) || [])) {
      if (!visited.has(child)) {
        visited.add(child);
        layerMap.set(child, layer + 1);
        queue.push(child);
      } else {
        // Push child to deeper layer if needed
        const existing = layerMap.get(child)!;
        if (existing < layer + 1) {
          layerMap.set(child, layer + 1);
          queue.push(child); // re-process children
        }
      }
    }
  }

  // Handle disconnected nodes (not reached from roots)
  for (const id of newCardIds) {
    if (!visited.has(id)) {
      layerMap.set(id, 0);
      visited.add(id);
    }
  }

  // Group nodes by layer
  const layers = new Map<number, number[]>();
  for (const [id, layer] of layerMap) {
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer)!.push(id);
  }

  // Sort layers
  const sortedLayers = [...layers.keys()].sort((a, b) => a - b);

  // Barycenter ordering to minimize crossings
  for (let iter = 0; iter < 3; iter++) {
    // Forward pass
    for (let i = 1; i < sortedLayers.length; i++) {
      const layerIds = layers.get(sortedLayers[i])!;
      const prevLayerIds = layers.get(sortedLayers[i - 1])!;
      const prevOrder = new Map(prevLayerIds.map((id, idx) => [id, idx]));

      layerIds.sort((a, b) => {
        const aParents = (parents.get(a) || []).filter(p => prevOrder.has(p));
        const bParents = (parents.get(b) || []).filter(p => prevOrder.has(p));
        const aAvg = aParents.length > 0
          ? aParents.reduce((s, p) => s + prevOrder.get(p)!, 0) / aParents.length
          : 0;
        const bAvg = bParents.length > 0
          ? bParents.reduce((s, p) => s + prevOrder.get(p)!, 0) / bParents.length
          : 0;
        return aAvg - bAvg;
      });
      layers.set(sortedLayers[i], layerIds);
    }
    // Backward pass
    for (let i = sortedLayers.length - 2; i >= 0; i--) {
      const layerIds = layers.get(sortedLayers[i])!;
      const nextLayerIds = layers.get(sortedLayers[i + 1])!;
      const nextOrder = new Map(nextLayerIds.map((id, idx) => [id, idx]));

      layerIds.sort((a, b) => {
        const aChildren = (children.get(a) || []).filter(c => nextOrder.has(c));
        const bChildren = (children.get(b) || []).filter(c => nextOrder.has(c));
        const aAvg = aChildren.length > 0
          ? aChildren.reduce((s, c) => s + nextOrder.get(c)!, 0) / aChildren.length
          : 0;
        const bAvg = bChildren.length > 0
          ? bChildren.reduce((s, c) => s + nextOrder.get(c)!, 0) / bChildren.length
          : 0;
        return aAvg - bAvg;
      });
      layers.set(sortedLayers[i], layerIds);
    }
  }

  // Find reference point: use existing canvas cards' bounding box
  const existingCards = state.cards.filter(c => c.inCanvas && !newSet.has(c.id));
  let startX = 100;
  let startY = 100;
  if (existingCards.length > 0) {
    const maxX = Math.max(...existingCards.map(c => c.x)) + CARD_W + H_GAP * 2;
    const avgY = existingCards.reduce((s, c) => s + c.y, 0) / existingCards.length;
    startX = maxX;
    startY = Math.max(100, avgY - 200);
  }

  // Assign positions — columns left to right, vertically centered against tallest layer
  const positions = new Map<number, { x: number; y: number }>();

  // Find the tallest layer height for centering
  let maxLayerSize = 0;
  for (const layerIdx of sortedLayers) {
    maxLayerSize = Math.max(maxLayerSize, layers.get(layerIdx)!.length);
  }
  const totalHeight = maxLayerSize * (CARD_H + V_GAP) - V_GAP;

  for (const layerIdx of sortedLayers) {
    const layerIds = layers.get(layerIdx)!;
    const x = startX + layerIdx * (CARD_W + H_GAP + 80);
    const layerHeight = layerIds.length * (CARD_H + V_GAP) - V_GAP;
    const y = startY + (totalHeight - layerHeight) / 2; // center vertically

    for (let i = 0; i < layerIds.length; i++) {
      positions.set(layerIds[i], { x, y: y + i * (CARD_H + V_GAP) });
    }
  }

  // Animate cards to new positions
  animateLayout(newCards, positions, onComplete);
}

function animateLayout(
  cards: Card[],
  positions: Map<number, { x: number; y: number }>,
  onComplete?: () => void
): void {
  const duration = 400;
  const start = performance.now();
  const startPositions = cards.map(c => ({ id: c.id, x: c.x, y: c.y }));

  function step(now: number) {
    const t = Math.min(1, (now - start) / duration);
    const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

    for (const sp of startPositions) {
      const card = state.cards.find(c => c.id === sp.id);
      const target = positions.get(sp.id);
      if (card && target) {
        card.x = sp.x + (target.x - sp.x) * ease;
        card.y = sp.y + (target.y - sp.y) * ease;
      }
    }

    renderCanvas();
    renderConnections();

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      // Snap to final positions
      for (const sp of startPositions) {
        const card = state.cards.find(c => c.id === sp.id);
        const target = positions.get(sp.id);
        if (card && target) {
          card.x = target.x;
          card.y = target.y;
        }
      }
      renderCanvas();
      renderConnections();
      scheduleSave();
      onComplete?.();
    }
  }

  requestAnimationFrame(step);
}
