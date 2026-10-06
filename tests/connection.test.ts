import { describe, expect, it } from 'vitest';
import {
  canConnect,
  evaluateConnection,
  type ConnectionNode,
  type ConnectionState,
} from '../src/systems/connection';

function node(
  id: string,
  kind: ConnectionNode['kind'],
  capacity: number,
  extra: Partial<ConnectionNode> = {},
): ConnectionNode {
  return {
    id,
    kind,
    capacity,
    position: { x: 0, y: 0, z: 0 },
    ...extra,
  };
}

describe('connection system', () => {
  it('refuses to link nodes of different kinds', () => {
    const nodes = {
      a: node('a', 'energy', 10),
      b: node('b', 'information', 10),
      c: node('c', 'energy', 10),
    };
    expect(canConnect(nodes, 'a', 'b')).toBe(false);
    expect(canConnect(nodes, 'a', 'c')).toBe(true);
  });

  it('refuses to link a node to itself', () => {
    const nodes = { a: node('a', 'energy', 10) };
    expect(canConnect(nodes, 'a', 'a')).toBe(false);
  });

  it('carries flow from a source through a relay to a sink', () => {
    const state: ConnectionState = {
      nodes: [
        node('src', 'energy', 8, { source: true }),
        node('mid', 'energy', 5),
        node('dst', 'energy', 10, { sink: true }),
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'mid', active: true },
        { id: 'e2', from: 'mid', to: 'dst', active: true },
      ],
      goals: [{ nodeId: 'dst', amount: 5 }],
    };
    const report = evaluateConnection(state);
    // The relay is the bottleneck at 5, not the source at 8.
    expect(report.throughput.mid).toBe(5);
    expect(report.throughput.dst).toBe(5);
    expect(report.solved).toBe(true);
  });

  it('shows that adding capacity past a narrow node does not help', () => {
    const base: ConnectionState = {
      nodes: [
        node('src', 'energy', 8, { source: true }),
        node('mid', 'energy', 5),
        node('dst', 'energy', 20, { sink: true }),
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'mid', active: true },
        { id: 'e2', from: 'mid', to: 'dst', active: true },
      ],
      goals: [{ nodeId: 'dst', amount: 9 }],
    };
    const widened: ConnectionState = {
      ...base,
      nodes: base.nodes.map((n) =>
        n.id === 'dst' ? node('dst', 'energy', 40, { sink: true }) : n,
      ),
    };
    expect(evaluateConnection(base).solved).toBe(false);
    // Widening the sink alone changes nothing: the relay still caps at 5.
    expect(evaluateConnection(widened).throughput.dst).toBe(5);
    expect(evaluateConnection(widened).solved).toBe(false);
  });

  it('reports insufficient flow as a recoverable failure', () => {
    const state: ConnectionState = {
      nodes: [
        node('src', 'energy', 2, { source: true }),
        node('dst', 'energy', 10, { sink: true }),
      ],
      edges: [{ id: 'e1', from: 'src', to: 'dst', active: true }],
      goals: [{ nodeId: 'dst', amount: 5 }],
    };
    const report = evaluateConnection(state);
    expect(report.solved).toBe(false);
    expect(report.failures).toEqual([{ code: 'flow-insufficient', subjectId: 'dst' }]);
  });

  it('ignores inactive edges, so a puzzle resets cleanly', () => {
    const state: ConnectionState = {
      nodes: [
        node('src', 'energy', 10, { source: true }),
        node('dst', 'energy', 10, { sink: true }),
      ],
      edges: [{ id: 'e1', from: 'src', to: 'dst', active: false }],
      goals: [{ nodeId: 'dst', amount: 5 }],
    };
    expect(evaluateConnection(state).solved).toBe(false);
  });

  it('terminates on a cyclic graph', () => {
    const state: ConnectionState = {
      nodes: [
        node('a', 'energy', 10, { source: true }),
        node('b', 'energy', 10),
        node('c', 'energy', 10),
      ],
      edges: [
        { id: 'e1', from: 'a', to: 'b', active: true },
        { id: 'e2', from: 'b', to: 'c', active: true },
        { id: 'e3', from: 'c', to: 'a', active: true },
      ],
      goals: [{ nodeId: 'c', amount: 10 }],
    };
    const report = evaluateConnection(state);
    expect(report.solved).toBe(true);
  });

  it('never propagates flow across incompatible kinds even if wired', () => {
    const state: ConnectionState = {
      nodes: [
        node('src', 'energy', 10, { source: true }),
        node('dst', 'information', 10, { sink: true }),
      ],
      edges: [{ id: 'e1', from: 'src', to: 'dst', active: true }],
      goals: [{ nodeId: 'dst', amount: 1 }],
    };
    expect(evaluateConnection(state).throughput.dst).toBe(0);
    expect(evaluateConnection(state).solved).toBe(false);
  });
});