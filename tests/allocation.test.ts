import { describe, expect, it } from 'vitest';
import {
  evaporateTrails,
  evaluateAllocation,
  gatherYield,
  strongestTrail,
  unassignedIds,
  type AllocationLane,
  type WorkUnit,
} from '../src/systems/allocation';

const lanes: AllocationLane[] = [
  { id: 'lane-a', kind: 'energy', capacity: 3, latency: 1, costPerUnit: 1 },
  { id: 'lane-b', kind: 'energy', capacity: 2, latency: 2, costPerUnit: 2 },
];

const work: WorkUnit[] = [
  { id: 'w1', kind: 'energy', size: 2, tolerance: 10 },
  { id: 'w2', kind: 'energy', size: 3, tolerance: 10 },
  { id: 'w3', kind: 'energy', size: 1, tolerance: 10 },
];

describe('allocation system', () => {
  it('accepts a balanced assignment within every lane capacity', () => {
    const report = evaluateAllocation(lanes, work, { 'lane-a': ['w1', 'w2'], 'lane-b': ['w3'] });
    expect(report.solved).toBe(true);
    expect(report.overloaded).toEqual([]);
  });

  it('flags a lane holding more units than it has slots', () => {
    const four: WorkUnit[] = [
      ...work,
      { id: 'w4', kind: 'energy', size: 1, tolerance: 10 },
    ];
    const report = evaluateAllocation(lanes, four, {
      'lane-a': ['w1', 'w2', 'w3', 'w4'],
      'lane-b': [],
    });
    expect(report.overloaded).toEqual(['lane-a']);
    expect(report.failures).toContainEqual({ code: 'lane-overloaded', subjectId: 'lane-a' });
    expect(report.solved).toBe(false);
  });

  it('flags work routed to a lane of the wrong kind', () => {
    const infoLane: AllocationLane[] = [
      { id: 'info', kind: 'information', capacity: 4, latency: 1, costPerUnit: 1 },
    ];
    const report = evaluateAllocation(infoLane, work, { info: ['w1', 'w2', 'w3'] });
    expect(report.misrouted).toEqual(['w1', 'w2', 'w3']);
    expect(report.failures).toContainEqual({ code: 'kind-mismatch' });
  });

  it('reports unassigned work rather than treating it as free', () => {
    expect(unassignedIds(work, { 'lane-a': ['w1'] })).toEqual(['w2', 'w3']);
    const report = evaluateAllocation(lanes, work, { 'lane-a': ['w1'] });
    expect(report.failures).toContainEqual({ code: 'work-unassigned' });
  });

  it('charges a fixed setup cost, so scattering work across lanes is not free', () => {
    const oneLane = evaluateAllocation(lanes, work, { 'lane-a': ['w1', 'w2', 'w3'], 'lane-b': [] });
    // Over capacity, but the number shows the model is doing real work.
    expect(oneLane.perLaneLoad['lane-a']).toBe(1 + 2 + 3 + 1);
    const spread = evaluateAllocation(lanes, work, { 'lane-a': ['w1'], 'lane-b': ['w2'] });
    expect(spread.totalCost).toBeGreaterThan(0);
  });

  it('detects a unit that arrives after its tolerance', () => {
    const tight: WorkUnit[] = [{ id: 't', kind: 'energy', size: 8, tolerance: 3 }];
    const report = evaluateAllocation(lanes, tight, { 'lane-a': ['t'] });
    expect(report.late).toEqual(['t']);
    expect(report.failures).toContainEqual({ code: 'late-arrival' });
  });

  it('is not solved when there is no work at all', () => {
    const report = evaluateAllocation(lanes, [], {});
    expect(report.solved).toBe(false);
  });
});

describe('pheromone trails', () => {
  const cells = [
    { id: 'a', pheromone: 1 },
    { id: 'b', pheromone: 0.8 },
    { id: 'c', pheromone: 0.2 },
  ];

  it('keeps the strongest trail strongest under proportional decay', () => {
    const after = evaporateTrails(cells, 3, 0);
    expect(strongestTrail(after)?.id).toBe('a');
    expect(after[0].pheromone).toBeLessThan(cells[0].pheromone);
  });

  it('forces the colony onto a different route when the best one is blocked', () => {
    // This is the gameplay-relevant behaviour: an established route stops being
    // usable and the ants have to pick the next best trail.
    const blocked = [{ ...cells[0], blocked: true }, cells[1], cells[2]];
    expect(strongestTrail(evaporateTrails(blocked, 0, 0))?.id).toBe('b');
  });

  it('clears trails on blocked cells entirely', () => {
    const withBlocked = [{ ...cells[0], blocked: true }];
    expect(evaporateTrails(withBlocked, 5, 0)[0].pheromone).toBe(0);
  });

  it('never produces a negative trail', () => {
    const decayed = evaporateTrails([{ id: 'z', pheromone: 0.01 }], 100, 0.5);
    expect(decayed[0].pheromone).toBe(0);
  });
});

describe('shared information', () => {
  it('pays a communication delay on the first rounds', () => {
    const alone = gatherYield([10, 10, 10], false, 0, 4);
    const shared = gatherYield([10, 10, 10], true, 2, 4);
    expect(shared).toBeLessThan(alone);
  });

  it('beats average solo discovery once the delay is paid', () => {
    const uneven = [100, 0, 0];
    const shared = gatherYield(uneven, true, 0, 4);
    const soloAverage = gatherYield(uneven, false, 0, 4);
    expect(shared).toBeGreaterThan(soloAverage);
  });
});