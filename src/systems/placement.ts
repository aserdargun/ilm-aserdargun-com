import type { LocalizedText } from '../types/catalog';

/**
 * PLACEMENT — ordering and arrangement of steps to produce a behaviour.
 *
 * Powers POL (two symbol arrangements expressing one behaviour), HNS (a task
 * sequence), ARL (finding the step that failed) and HEX (joint configuration
 * plus movement order). The evaluator reports the *first* failing step, which
 * is what makes "follow the execution trail and repair the failed step"
 * a real, learnable mechanic rather than trial and error.
 */

export interface PlacementStep {
  id: string;
  /** Machine-readable effect key applied when this step runs. */
  effect: string;
  /** Signal keys that must already be true for this step to succeed. */
  requires: string[];
  label?: LocalizedText;
}

export interface PlacementState {
  steps: PlacementStep[];
  /** The player's current order of step ids. */
  order: string[];
  /** Every step must be present exactly once. */
  goalSignature: string;
}

export interface PlacementReport {
  solved: boolean;
  /** The step that first broke the sequence, if any. */
  failedStepId?: string;
  failures: { code: string; subjectId?: string }[];
  /** Final signature produced by the player's order. */
  signature: string;
  satisfiedIds: string[];
  /** Steps that executed successfully, in order. */
  executed: string[];
}

export function evaluatePlacement(state: PlacementState): PlacementReport {
  const byId: Record<string, PlacementStep> = {};
  for (const step of state.steps) byId[step.id] = step;

  const failures: { code: string; subjectId?: string }[] = [];
  const executed: string[] = [];
  const signals = new Set<string>();
  const signatureParts: string[] = [];

  // Every step must appear exactly once — a dropped or duplicated step is its
  // own failure mode, reported separately from a bad ordering.
  const seen = new Set<string>();
  for (const id of state.order) {
    if (!byId[id]) {
      failures.push({ code: 'unknown-step', subjectId: id });
      continue;
    }
    if (seen.has(id)) {
      failures.push({ code: 'duplicate-step', subjectId: id });
      continue;
    }
    seen.add(id);
  }
  for (const step of state.steps) {
    if (!seen.has(step.id)) failures.push({ code: 'missing-step', subjectId: step.id });
  }

  let failedStepId: string | undefined;
  for (const id of state.order) {
    const step = byId[id];
    if (!step) continue;
    const blocked = step.requires.some((req) => !signals.has(req));
    if (blocked) {
      failedStepId = failedStepId ?? id;
      failures.push({ code: 'requirement-missing', subjectId: id });
      signatureParts.push(`${step.effect}!`);
      continue;
    }
    executed.push(id);
    signals.add(step.effect);
    signatureParts.push(step.effect);
  }

  const signature = signatureParts.join('>');
  const solved = failures.length === 0 && signature === state.goalSignature;
  if (signature !== state.goalSignature && failedStepId === undefined) {
    failures.push({ code: 'signature-mismatch' });
  }

  return {
    solved,
    failedStepId,
    failures,
    signature,
    executed,
    satisfiedIds: solved ? state.steps.map((s) => s.id) : [],
  };
}

/** Swaps two positions in an order array, returning a new array. */
export function swapStep(order: string[], a: number, b: number): string[] {
  const next = order.slice();
  const tmp = next[a];
  next[a] = next[b];
  next[b] = tmp;
  return next;
}

export function moveStep(order: string[], from: number, to: number): string[] {
  const next = order.slice();
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}