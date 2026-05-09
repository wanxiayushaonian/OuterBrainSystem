// ═══════════════════════════════════════════════════════
// Highlight — BFS depth-based card highlighting
// ═══════════════════════════════════════════════════════
import { state } from '../../core/types/state';
import type { Connection } from '../../core/types/types';

/**
 * Compute BFS depth map from a root card through connections.
 * Connections are treated as bidirectional for highlighting.
 * Returns Map<cardId, depth> where depth 0 = root.
 */
export function computeHighlightMap(
  rootId: number,
  maxDepth: number,
  connections: Connection[]
): Map<number, number> {
  const depthMap = new Map<number, number>();
  depthMap.set(rootId, 0);

  if (maxDepth <= 0) return depthMap;

  // Build bidirectional adjacency list
  const adj = new Map<number, number[]>();
  for (const conn of connections) {
    if (!adj.has(conn.from)) adj.set(conn.from, []);
    if (!adj.has(conn.to)) adj.set(conn.to, []);
    adj.get(conn.from)!.push(conn.to);
    adj.get(conn.to)!.push(conn.from);
  }

  // BFS
  const queue: number[] = [rootId];
  while (queue.length > 0) {
    const node = queue.shift()!;
    const currentDepth = depthMap.get(node)!;
    if (currentDepth >= maxDepth) continue;

    for (const neighbor of (adj.get(node) || [])) {
      if (!depthMap.has(neighbor)) {
        depthMap.set(neighbor, currentDepth + 1);
        queue.push(neighbor);
      }
    }
  }

  return depthMap;
}

/** Get depth color for a given depth level. */
export function getDepthColor(depth: number): string {
  switch (depth) {
    case 0: return 'var(--accent)'; // blue — root
    case 1: return 'oklch(55% 0.16 145)'; // green
    case 2: return 'oklch(55% 0.14 300)'; // purple
    default: return 'oklch(55% 0.14 35)'; // orange — 3+
  }
}

/** Get depth glow color (semi-transparent). */
export function getDepthGlow(depth: number): string {
  switch (depth) {
    case 0: return 'oklch(60% 0.2 255 / 0.4)';
    case 1: return 'oklch(55% 0.16 145 / 0.3)';
    case 2: return 'oklch(55% 0.14 300 / 0.3)';
    default: return 'oklch(55% 0.14 35 / 0.3)';
  }
}

/** Get CSS class for a highlight depth. */
export function getHighlightClass(cardId: number): string {
  if (state.highlightRootId === null) return '';

  const depthMap = computeHighlightMap(state.highlightRootId, state.highlightDepth, state.connections);
  const depth = depthMap.get(cardId);

  if (depth === undefined) return 'highlight-dim';
  return `highlight-depth-${Math.min(depth, 3)}`;
}
