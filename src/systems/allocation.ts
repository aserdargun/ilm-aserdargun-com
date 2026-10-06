import type { PortKind } from './types';

/**
 * ALLOCATION — placing work onto constrained lanes.
 *
 * Powers GPU (distributing work across loom arms), GEX (synchronised routes
 * where divergence costs time), TFL (scheduling token caravans), BEE (shared
 * information changing gathering), ADP (adaptation modules with distinct cost
 * and flexibility tradeoffs), CLD / LCL / DCL (local vs remote vs mixed) and
 * ANT (establishing a route, then adapting when it is blocked).
 *
 * All units are the game's fictional units. Nothing here reads real pricing,
 * hardware benchmarks or model training.
 */

export interface AllocationLane {
  id: string;
  kind: PortKind;
  /** Parallel slots available on this lane. */
  capacity: number;
  /** Fixed travel/setup cost in abstract units. */
  latency: number;
  /** Fictional resource cost per unit of work. */
  costPerUnit: number;
}

export interface WorkUnit {
  id: string;
  kind: PortKind;
  /** Work size in abstract units. */
  size: number;
  /** How much latency this particular unit tolerates. */
  tolerance: number;
}

export type Assignment = Record<string, string[]>;

export interface AllocationReport {
  /** Highest total time across all lanes; the bottleneck. */
  makespan: number;
  perLaneLoad: Record<string, number>;
  /** Lanes holding more than their capacity allows. */
  overloaded: string[];
  /** Units that arrived later than their tolerance allowed. */
  late: string[];
  /** Units placed on a lane of an incompatible kind. */
  misrouted: string[];
  totalCost: number;
  solved: boolean;
  failures: { code: string; subjectId?: string }[];
  satisfiedIds: string[];
}

/**
 * Lane load is serial work plus a fixed latency for lanes that are used at all.
 * Spreading work thin across many lanes is not free — each one costs its setup.
 */
export function evaluateAllocation(
  lanes: AllocationLane[],
  work: WorkUnit[],
  assignment: Assignment,
): AllocationReport {
  const laneById: Record<string, AllocationLane> = {};
  const workById: Record<string, WorkUnit> = {};
  for (const lane of lanes) laneById[lane.id] = lane;
  for (const unit of work) workById[unit.id] = unit;

  const perLaneLoad: Record<string, number> = {};
  const overloaded: string[] = [];
  const late: string[] = [];
  const misrouted: string[] = [];
  let totalCost = 0;

  for (const lane of lanes) perLaneLoad[lane.id] = 0;

  for (const [laneId, unitIds] of Object.entries(assignment)) {
    const lane = laneById[laneId];
    if (!lane) {
      for (const id of unitIds) misrouted.push(id);
      continue;
    }
    if (unitIds.length === 0) continue;

    let load = lane.latency;
    for (const unitId of unitIds) {
      const unit = workById[unitId];
      if (!unit) {
        misrouted.push(unitId);
        continue;
      }
      if (unit.kind !== lane.kind) {
        // Wrong kind still consumes room, so the mistake is always costly.
        misrouted.push(unitId);
      }
      load += unit.size;
      totalCost += unit.size * lane.costPerUnit;
    }
    perLaneLoad[laneId] = load;

    if (unitIds.length > lane.capacity) overloaded.push(laneId);
    if (load > unitTolerance(lane, unitIds, workById)) {
      late.push(...unitIds);
    }
  }

  const makespan = Object.values(perLaneLoad).reduce((a, b) => Math.max(a, b), 0);

  const failures: { code: string; subjectId?: string }[] = [];
  if (misrouted.length > 0) failures.push({ code: 'kind-mismatch' });
  if (overloaded.length > 0) {
    for (const laneId of overloaded) failures.push({ code: 'lane-overloaded', subjectId: laneId });
  }
  if (late.length > 0) failures.push({ code: 'late-arrival' });
  if (unassignedIds(work, assignment).length > 0) failures.push({ code: 'work-unassigned' });

  const solved = failures.length === 0 && work.length > 0;

  return {
    makespan,
    perLaneLoad,
    overloaded,
    late,
    misrouted,
    totalCost,
    solved,
    failures,
    satisfiedIds: solved ? work.map((u) => u.id) : [],
  };
}

function unitTolerance(
  lane: AllocationLane,
  unitIds: string[],
  workById: Record<string, WorkUnit>,
): number {
  let tightest = Number.POSITIVE_INFINITY;
  for (const id of unitIds) {
    const unit = workById[id];
    if (unit) tightest = Math.min(tightest, unit.tolerance);
  }
  return tightest === Number.POSITIVE_INFINITY ? lane.latency : tightest;
}

export function unassignedIds(work: WorkUnit[], assignment: Assignment): string[] {
  const placed = new Set<string>();
  for (const unitIds of Object.values(assignment)) {
    for (const id of unitIds) placed.add(id);
  }
  return work.filter((u) => !placed.has(u.id)).map((u) => u.id);
}

/**
 * ANT — trails that evaporate, so a route that was optimal stops being
 * optimal once the world changes. Evaporation is deterministic and seeded so a
 * replay reproduces the same collapse.
 */
export interface TrailCell {
  id: string;
  pheromone: number;
  blocked?: boolean;
}

export function evaporateTrails(
  cells: TrailCell[],
  turns: number,
  rate: number,
  decay = 0.85,
): TrailCell[] {
  return cells.map((cell) => ({
    ...cell,
    pheromone: cell.blocked ? 0 : Math.max(0, cell.pheromone * Math.pow(decay, turns) - rate),
  }));
}

export function strongestTrail(cells: TrailCell[]): TrailCell | undefined {
  let best: TrailCell | undefined;
  for (const cell of cells) {
    if (!best || cell.pheromone > best.pheromone) best = cell;
  }
  return best;
}

/**
 * BEE — a colony that can either explore alone or share what it found.
 * Shared information reduces rediscovery but adds a communication delay.
 */
export function gatherYield(
  resourceTotals: number[],
  danceOn: boolean,
  communicationLatency: number,
  rounds: number,
): number {
  let yieldValue = 0;
  for (let round = 0; round < rounds; round += 1) {
    if (danceOn && round < communicationLatency) continue;
    const discovered = danceOn
      ? Math.max(...resourceTotals)
      : resourceTotals.reduce((a, b) => a + b, 0) / resourceTotals.length;
    yieldValue += discovered;
  }
  return yieldValue;
}