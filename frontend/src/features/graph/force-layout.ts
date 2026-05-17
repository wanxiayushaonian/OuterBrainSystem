// ═══════════════════════════════════════════════════════
// Force-Directed Graph Layout Engine
// ═══════════════════════════════════════════════════════
import type { GraphEntity, GraphRelation } from '../../core/types/types';

export interface ForceNode {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null; // fixed position (when dragging)
  fy: number | null;
  entity: GraphEntity;
  radius: number;
}

export interface ForceEdge {
  source: number; // node index
  target: number; // node index
  relation: GraphRelation;
}

// Physics constants
const REPULSION_K = 5000;
const SPRING_K = 0.005;
const IDEAL_LENGTH = 150;
const DAMPING = 0.92;
const CENTER_K = 0.01;
const MIN_DIST = 40;
const CONVERGE_THRESHOLD = 0.5;

export class ForceGraphLayout {
  nodes: ForceNode[] = [];
  edges: ForceEdge[] = [];
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  /** Initialize nodes and edges from graph data. */
  init(entities: GraphEntity[], relations: GraphRelation[], cardPositions?: Map<number, { x: number; y: number }>): void {
    this.nodes = [];
    this.edges = [];

    // Create nodes
    const entityIndexMap = new Map<number, number>();
    for (let i = 0; i < entities.length; i++) {
      const ent = entities[i];
      entityIndexMap.set(ent.id, i);

      // Calculate initial position
      let x = this.width / 2;
      let y = this.height / 2;

      // Try to use card positions
      if (cardPositions && ent.card_ids.length > 0) {
        let sumX = 0, sumY = 0, count = 0;
        for (const cardId of ent.card_ids) {
          const pos = cardPositions.get(cardId);
          if (pos) {
            sumX += pos.x;
            sumY += pos.y;
            count++;
          }
        }
        if (count > 0) {
          x = sumX / count;
          y = sumY / count;
        }
      }

      // Add some randomness to prevent overlap
      x += (Math.random() - 0.5) * 100;
      y += (Math.random() - 0.5) * 100;

      // Calculate radius based on connection count
      const connCount = relations.filter(r => r.source_id === ent.id || r.target_id === ent.id).length;
      const radius = Math.max(20, Math.min(40, 20 + connCount * 3));

      this.nodes.push({
        id: ent.id,
        x, y,
        vx: 0, vy: 0,
        fx: null, fy: null,
        entity: ent,
        radius,
      });
    }

    // Create edges
    for (const rel of relations) {
      const sourceIdx = entityIndexMap.get(rel.source_id);
      const targetIdx = entityIndexMap.get(rel.target_id);
      if (sourceIdx !== undefined && targetIdx !== undefined) {
        this.edges.push({
          source: sourceIdx,
          target: targetIdx,
          relation: rel,
        });
      }
    }
  }

  /** Run one simulation step. */
  tick(dt: number = 1): void {
    const n = this.nodes.length;
    if (n === 0) return;

    // Reset forces
    for (const node of this.nodes) {
      if (node.fx !== null && node.fy !== null) continue;
      let fx = 0, fy = 0;

      // Repulsion from all other nodes
      for (let j = 0; j < n; j++) {
        if (j === this.nodes.indexOf(node)) continue;
        const other = this.nodes[j];
        let dx = node.x - other.x;
        let dy = node.y - other.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MIN_DIST) dist = MIN_DIST;

        const force = REPULSION_K / (dist * dist);
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }

      // Attraction from connected nodes
      for (const edge of this.edges) {
        let other: ForceNode | null = null;
        if (this.nodes[edge.source] === node) {
          other = this.nodes[edge.target];
        } else if (this.nodes[edge.target] === node) {
          other = this.nodes[edge.source];
        }
        if (!other) continue;

        const dx = other.x - node.x;
        const dy = other.y - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const displacement = dist - IDEAL_LENGTH;
        const force = SPRING_K * displacement;

        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }

      // Centering force
      fx += (this.width / 2 - node.x) * CENTER_K;
      fy += (this.height / 2 - node.y) * CENTER_K;

      // Apply forces (Velocity Verlet)
      node.vx = (node.vx + fx * dt) * DAMPING;
      node.vy = (node.vy + fy * dt) * DAMPING;
    }

    // Update positions
    for (const node of this.nodes) {
      if (node.fx !== null && node.fy !== null) {
        node.x = node.fx;
        node.y = node.fy;
        node.vx = 0;
        node.vy = 0;
      } else {
        node.x += node.vx * dt;
        node.y += node.vy * dt;

        // Boundary constraints
        const margin = node.radius + 10;
        node.x = Math.max(margin, Math.min(this.width - margin, node.x));
        node.y = Math.max(margin, Math.min(this.height - margin, node.y));
      }
    }
  }

  /** Check if simulation has converged. */
  converge(): boolean {
    let totalEnergy = 0;
    for (const node of this.nodes) {
      totalEnergy += node.vx * node.vx + node.vy * node.vy;
    }
    return totalEnergy < CONVERGE_THRESHOLD;
  }

  /** Run simulation until convergence or max steps. */
  simulate(maxSteps: number = 200): void {
    for (let i = 0; i < maxSteps; i++) {
      this.tick();
      if (this.converge()) break;
    }
  }

  /** Pin a node at a position (for dragging). */
  pinNode(nodeId: number, x: number, y: number): void {
    const node = this.nodes.find(n => n.id === nodeId);
    if (node) {
      node.x = x;
      node.y = y;
      node.fx = x;
      node.fy = y;
    }
  }

  /** Unpin a node. */
  unpinNode(nodeId: number): void {
    const node = this.nodes.find(n => n.id === nodeId);
    if (node) {
      node.fx = null;
      node.fy = null;
    }
  }

  /** Find node at screen position. */
  findNodeAt(x: number, y: number): ForceNode | null {
    for (const node of this.nodes) {
      const dx = x - node.x;
      const dy = y - node.y;
      if (dx * dx + dy * dy <= node.radius * node.radius) {
        return node;
      }
    }
    return null;
  }

  /** Get connected nodes for a given node. */
  getConnectedNodes(nodeId: number): ForceNode[] {
    const result: ForceNode[] = [];
    for (const edge of this.edges) {
      if (this.nodes[edge.source].id === nodeId) {
        result.push(this.nodes[edge.target]);
      } else if (this.nodes[edge.target].id === nodeId) {
        result.push(this.nodes[edge.source]);
      }
    }
    return result;
  }
}
