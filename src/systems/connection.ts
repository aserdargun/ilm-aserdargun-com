import type { LocalizedText } from '../types/catalog';
import type { Vec3, PortKind } from './types';

/**
 * CONNECT — flow propagation across a network of compatible nodes.
 *
 * Pure and deterministic: the same graph always yields the same throughput, so
 * puzzle outcomes can be asserted in tests and replayed from a save.
 */

export interface ConnectionNode {
  id: string;
  kind: PortKind;
  /**
   * For a source: how much it emits. For a relay or sink: the most it can carry.
   */
  capacity: number;
  position: Vec3;
  label?: LocalizedText;
  /** Sources have no player-wirable inbound edge at the start. */
  source?: boolean;
  sink?: boolean;
}

export interface ConnectionEdge {
  id: string;
  from: string;
  to: string;
  /** Optional link limit; defaults to unlimited. */
  capacity?: number;
  /** True once the player has created this edge. */
  active: boolean;
}

export interface ConnectionGoal {
  nodeId: string;
  /** Minimum throughput that must reach this node. */
  amount: number;
}

export interface ConnectionState {
  nodes: ConnectionNode[];
  edges: ConnectionEdge[];
  goals: ConnectionGoal[];
}

/**
 * Two nodes may only be wired when they share a kind. This is the first lesson
 * the game teaches: not every pair in the world belongs together.
 */
export function canConnect(
  nodes: Record<string, ConnectionNode>,
  fromId: string,
  toId: string,
): boolean {
  if (fromId === toId) return false;
  const a = nodes[fromId];
  const b = nodes[toId];
  if (!a || !b) return false;
  return a.kind === b.kind;
}

export interface FlowReport {
  /** Throughput arriving at each node id. */
  throughput: Record<string, number>;
  /** Throughput leaving each node id. */
  emitted: Record<string, number>;
  solved: boolean;
  failures: { code: string; subjectId?: string }[];
  satisfiedIds: string[];
}

/**
 * Propagates flow from every source along active edges.
 *
 * Sources emit up to their capacity. Each node forwards at most
 * `min(incoming, own capacity)`, so adding a wide pipe past a narrow node does
 * not help — the real lesson of the Flow Foundry.
 */
export function evaluateConnection(state: ConnectionState): FlowReport {
  const { nodes, edges, goals } = state;
  const byId: Record<string, ConnectionNode> = {};
  for (const node of nodes) byId[node.id] = node;

  const incoming: Record<string, number> = {};
  const throughput: Record<string, number> = {};
  const emitted: Record<string, number> = {};
  for (const node of nodes) {
    incoming[node.id] = 0;
    throughput[node.id] = 0;
    emitted[node.id] = 0;
  }

  const adjacency = new Map<string, ConnectionEdge[]>();
  for (const edge of edges) {
    if (!edge.active) continue;
    if (!canConnect(byId, edge.from, edge.to)) continue;
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge);
    adjacency.set(edge.from, list);
  }

  // Fixed-point relaxation with an explicit iteration cap so a cyclic graph
  // can never hang the frame.
  const maxPasses = nodes.length + edges.length + 2;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (const node of nodes) {
      if (node.source) {
        // A source always supplies its full rated output regardless of inbound
        // traffic; only relays and sinks are limited by what they receive.
        emitted[node.id] = node.capacity;
      } else {
        emitted[node.id] = Math.min(incoming[node.id], node.capacity);
      }
    }
    for (const node of nodes) incoming[node.id] = 0;
    for (const node of nodes) {
      const out = adjacency.get(node.id);
      if (!out) continue;
      for (const edge of out) {
        const limit = edge.capacity ?? Number.POSITIVE_INFINITY;
        const move = Math.min(emitted[node.id], limit);
        incoming[edge.to] += move;
      }
    }
    for (const node of nodes) {
      const next = Math.min(incoming[node.id], node.capacity);
      if (next !== throughput[node.id]) {
        throughput[node.id] = next;
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Sources deliver their own emission to themselves.
  for (const node of nodes) {
    if (node.source) throughput[node.id] = emitted[node.id];
  }

  const failures: { code: string; subjectId?: string }[] = [];
  const satisfiedIds: string[] = [];
  for (const goal of goals) {
    const reached = throughput[goal.nodeId] ?? 0;
    if (reached >= goal.amount) {
      satisfiedIds.push(goal.nodeId);
    } else {
      failures.push({ code: 'flow-insufficient', subjectId: goal.nodeId });
    }
  }

  return {
    throughput,
    emitted,
    solved: failures.length === 0,
    failures,
    satisfiedIds,
  };
}

/** Incompatible pairs are surfaced as a distinct, understandable failure. */
export function incompatibility(
  nodes: Record<string, ConnectionNode>,
  fromId: string,
  toId: string,
): boolean {
  const a = nodes[fromId];
  const b = nodes[toId];
  if (!a || !b) return true;
  return a.kind !== b.kind;
}