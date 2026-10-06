import type { StageDefinition, StageRuntimeState } from '../../src/game/stages';
import { cellTruths, evaluateStage } from '../../src/game/puzzleRuntime';

/**
 * Solvers shared by the stage tests and the full-playthrough test.
 *
 * Each returns a legitimate winning configuration for one stage, so the same
 * inputs drive both "is this stage solvable" and "can the whole game be
 * finished".
 */

function solveConnectionLinks(stage: StageDefinition): StageRuntimeState {
  const links = (stage.data as { links?: [string, string][] }).links ?? [];
  const assignments: Record<string, string[]> = {};
  for (const [from, to] of links) assignments[from] = [to];
  return { assignments, held: null };
}

function solveConnectionMatch(stage: StageDefinition): StageRuntimeState {
  const data = stage.data as {
    scouts?: { id: string; kind: string }[];
    seals?: { id: string; kind: string }[];
    routes?: { id: string; accepts: string }[];
    targets?: { id: string; accepts: string }[];
    trials?: number;
  };
  const sources = data.scouts ?? data.seals ?? [];
  const targets = data.routes ?? data.targets ?? [];
  const assignments: Record<string, string[]> = {};
  for (const target of targets) {
    // Anything that accepts nothing must be deliberately left unwired.
    if (target.accepts === 'none') continue;
    const match = sources.find((s) => s.kind === target.accepts);
    if (match) assignments[target.id] = [match.id];
  }
  if ((data.trials ?? 1) > 1) {
    assignments.__trials = Array.from({ length: data.trials! }, (_, i) => `trial-${i}`);
  }
  return { assignments, held: null };
}

/** Topological order honouring each step's declared requirements. */
function solvePlacement(stage: StageDefinition): StageRuntimeState {
  const steps =
    (stage.data as { steps?: { id: string; effect: string; requires: string[] }[] }).steps ?? [];
  const order: string[] = [];
  const done = new Set<string>();
  const remaining = steps.slice();
  while (remaining.length > 0) {
    const next = remaining.findIndex((step) =>
      step.requires.every((req) => done.has(req) || remaining.some((s) => s.effect === req && false)),
    );
    // Steps whose requirements are unmet still get placed; the evaluator is the
    // judge, and a linear chain resolves in one pass.
    const chosen = next >= 0 ? next : 0;
    const step = remaining.splice(chosen, 1)[0];
    order.push(step.id);
    done.add(step.effect);
  }
  return { assignments: { order }, held: null };
}

/** Brute force over lane assignments; the stages are deliberately small. */
function solveAllocation(stage: StageDefinition): StageRuntimeState {
  const data = stage.data as {
    lanes?: { id: string }[];
    work?: { id: string }[];
    requireEveryLaneUsed?: boolean;
    prefersShared?: boolean;
  };
  const lanes = (data.lanes ?? []).map((l) => l.id);
  const work = (data.work ?? []).map((w) => w.id);
  if (lanes.length === 0 || work.length === 0) return { assignments: {}, held: null };

  let best: Record<string, string[]> | null = null;
  const total = Math.pow(lanes.length, work.length);
  for (let n = 0; n < total; n += 1) {
    let code = n;
    const assignments: Record<string, string[]> = {};
    for (const lane of lanes) assignments[lane] = [];
    for (const unit of work) {
      assignments[lanes[code % lanes.length]].push(unit);
      code = Math.floor(code / lanes.length);
    }
    if (evaluateStage(stage, { assignments, held: null }).solved) {
      best = assignments;
      break;
    }
  }
  return { assignments: best ?? {}, held: null };
}

function solvePerception(stage: StageDefinition): StageRuntimeState {
  const marked = cellTruths(stage).map((c) => `${c.index}:${c.truth}`);
  return { assignments: { __marked: marked }, held: null, lens: 'edge', observations: 3 };
}

function solveEvidence(stage: StageDefinition): StageRuntimeState {
  const data = stage.data as {
    seats?: unknown[];
    contradicted?: string[];
    requiredStates?: string[];
    capacity?: number;
    records?: { id: string; fresh: boolean; correct: boolean; tags: string[] }[];
    correctable?: string[];
  };
  if (data.seats) {
    return { assignments: { __flagged: data.contradicted ?? [] }, held: null };
  }
  if (data.requiredStates) {
    return { assignments: { __states: data.requiredStates }, held: null };
  }
  const records = data.records ?? [];
  const correctable = new Set(data.correctable ?? []);
  const packed: string[] = [];
  let used = 0;
  for (const record of records) {
    const cost = 1 + Math.max(0, record.tags.length - 1);
    const usable = correctable.has(record.id) ? true : record.fresh && record.correct;
    if (usable && used + cost <= (data.capacity ?? 3)) {
      packed.push(record.id);
      used += cost;
    }
  }
  return {
    assignments: {},
    held: null,
    packed,
    corrected: [...correctable],
  };
}

function solvePrediction(stage: StageDefinition): StageRuntimeState {
  const pdt = stage.data as { sensors?: number; trueFault?: string } | undefined;
  if (pdt?.trueFault && pdt.sensors) {
    // Find the smallest sensor set that isolates the true fault.
    const all = Array.from({ length: 6 }, (_, i) => `sensor-${i}`);
    for (let size = 1; size <= all.length; size += 1) {
      const combos = combinations(all, size);
      for (const combo of combos) {
        const attempt: StageRuntimeState = {
          assignments: { __sensors: combo },
          held: null,
        };
        if (evaluateStage(stage, attempt).solved) return attempt;
      }
    }
    return { assignments: { __sensors: all }, held: null };
  }
  const model = stage.data as { markAssumed?: boolean } | undefined;
  if (model?.markAssumed) {
    const marked = cellTruths(stage).map((c) => `${c.index}:${c.truth}`);
    return { assignments: { __marked: marked }, held: null, observations: 2 };
  }
  const data = stage.data as {
    options?: { id: string }[];
    correct?: string;
    branches?: { id: string }[];
    verifyTarget?: string;
    decoyTarget?: string;
  };
  const chosen = data.correct ?? data.options?.[0]?.id ?? data.branches?.[0]?.id ?? null;
  const assignments: Record<string, string[]> = {};
  if (data.verifyTarget) assignments.__observed = [data.verifyTarget];
  return { assignments, held: null, chosen, approved: true };
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    for (const rest of combinations(items.slice(i + 1), size - 1)) out.push([items[i], ...rest]);
  }
  return out;
}

export function solveStage(stage: StageDefinition): StageRuntimeState {
  switch (stage.system) {
    case 'connection':
      return (stage.data as { links?: unknown }).links
        ? solveConnectionLinks(stage)
        : solveConnectionMatch(stage);
    case 'placement':
      return solvePlacement(stage);
    case 'allocation':
      return solveAllocation(stage);
    case 'perception':
      return solvePerception(stage);
    case 'evidence':
      return solveEvidence(stage);
    case 'prediction':
      return solvePrediction(stage);
  }
}

