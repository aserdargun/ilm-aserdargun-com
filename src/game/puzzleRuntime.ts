import { canConnect, evaluateConnection, type ConnectionNode } from '../systems/connection';
import { evaluatePlacement, type PlacementStep } from '../systems/placement';
import { perceive, type LensId, type Scene, type SceneCell } from '../systems/perception';
import {
  evaluateEvidence,
  verifyAction,
  type CouncilSeat,
  type EvidenceRecord,
} from '../systems/evidence';
import {
  evaluateAllocation,
  type AllocationLane,
  type WorkUnit,
} from '../systems/allocation';
import {
  compareToOutcome,
  FAULTS,
  narrowCandidates,
  type Counterfactual,
  type FaultId,
} from '../systems/prediction';
import { makeRng, type Vec3 } from '../systems/types';
import type { StageDefinition, StageRuntimeState } from './stages';

/**
 * One evaluator dispatches a stage to its system. The stage data describes the
 * puzzle; the runtime turns the player's generic interaction state (what is
 * placed where, which option is chosen) into a system input and returns a
 * verdict plus the concrete applications whose effect is now satisfied.
 *
 * Every function here is pure — the renderer and the store stay thin.
 */

export interface StageEvaluation {
  solved: boolean;
  /** Application codes whose observable effect this stage has unlocked. */
  satisfiedCodes: string[];
  /** Machine-readable failure codes for hints and tests. */
  failures: string[];
  /** Present when the stage can explain itself to the player. */
  messageKey?: string;
}

/** Default player state for a stage: nothing placed, nothing chosen. */
export function initialStageState(stage: StageDefinition): StageRuntimeState {
  const state: StageRuntimeState = { assignments: {}, held: null };
  switch (stage.system) {
    case 'connection':
      // Slots start empty; the player wires them.
      break;
    case 'placement':
      // Steps start shuffled so the order is genuinely something to solve.
      state.assignments.order = shuffledIds(stage, 0x51f3);
      break;
    case 'allocation':
      break;
    case 'perception':
      state.observations = 0;
      break;
    case 'evidence':
      state.packed = [];
      state.corrected = [];
      break;
    case 'prediction':
      state.chosen = null;
      state.approved = false;
      break;
  }
  return state;
}

function shuffledIds(stage: StageDefinition, seed: number): string[] {
  const ids = (stage.data?.steps as { id: string }[] | undefined)?.map((s) => s.id) ?? [];
  const rng = makeRng(seed);
  const out = ids.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export function evaluateStage(
  stage: StageDefinition,
  state: StageRuntimeState,
): StageEvaluation {
  switch (stage.system) {
    case 'connection':
      return evaluateConnectionStage(stage, state);
    case 'placement':
      return evaluatePlacementStage(stage, state);
    case 'allocation':
      return evaluateAllocationStage(stage, state);
    case 'perception':
      return evaluatePerceptionStage(stage, state);
    case 'evidence':
      return evaluateEvidenceStage(stage, state);
    case 'prediction':
      return evaluatePredictionStage(stage, state);
  }
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

interface ConnectionStageData {
  nodes?: ConnectionNode[];
  edges?: { id: string; from: string; to: string; active: boolean }[];
  links?: [string, string][];
  scouts?: { id: string; kind: string }[];
  routes?: { id: string; accepts: string }[];
  seals?: { id: string; kind: string }[];
  targets?: { id: string; accepts: string }[];
  solution?: [string, string][];
  kind?: string;
}

function evaluateConnectionStage(
  stage: StageDefinition,
  state: StageRuntimeState,
): StageEvaluation {
  const data = stage.data as ConnectionStageData;
  const solvedPairs = new Set(
    Object.entries(state.assignments)
      .filter(([, items]) => items.length > 0)
      .map(([slot, items]) => `${slot}>${items[0]}`),
  );

  // Generic wire list form: `links` pairs that must all exist.
  if (data.links) {
    const nodes = buildNodesFromLinks(data.links, data.kind ?? 'resource');
    const edges = data.links.map(([from, to], i) => ({
      id: `e${i}`,
      from,
      to,
      active: solvedPairs.has(`${from}>${to}`) || solvedPairs.has(`${to}>${from}`),
    }));
    const goals = data.links.map(([from]) => ({ nodeId: from, amount: 1 }));
    const report = evaluateConnection({ nodes, edges, goals });
    return {
      solved: report.solved && data.links.every(([a, b]) => solvedPairs.has(`${a}>${b}`) || solvedPairs.has(`${b}>${a}`)),
      satisfiedCodes: report.solved ? stage.appCodes : [],
      failures: report.failures.map((f) => f.code),
    };
  }

  // Matching form: N sources of distinct kinds onto N accepting targets.
  const sources = data.scouts ?? data.seals ?? [];
  const targets = data.routes ?? data.targets ?? [];
  const sourceKinds = new Map(sources.map((s) => [s.id, s.kind]));

  const failures: string[] = [];
  let wired = 0;

  for (const [targetId, items] of Object.entries(state.assignments)) {
    const target = targets.find((t) => t.id === targetId);
    if (!target || items.length === 0) continue;
    if (items.length > 1) {
      failures.push('too-many-wired');
      continue;
    }
    const sourceId = items[0];
    const kind = sourceKinds.get(sourceId);
    wired += 1;
    if (kind === undefined) {
      failures.push('unknown-source');
      continue;
    }
    // Compatibility is what makes this a puzzle rather than a guessing game.
    if (kind !== target.accepts) {
      failures.push('incompatible');
      continue;
    }
    // A target that accepts nothing must stay unwired (the SEC trap).
    if (target.accepts === 'none') failures.push('unauthorised-target');
  }

  // Targets that accept nothing are traps: leaving them unwired is the point,
  // so they are excluded from the "every target wired" requirement.
  const wireable = targets.filter((t) => t.accepts !== 'none');
  const allTargetsWired = wireable.every(
    (t) => (state.assignments[t.id] ?? []).length === 1,
  );
  const solved = wired === wireable.length && allTargetsWired && failures.length === 0;

  // EVL: permission seals must survive every trial, not just the first.
  const trials = (stage.data as { trials?: number }).trials ?? 1;
  const trialsHeld = (state.assignments.__trials ?? []).length + 1 >= trials;

  return {
    solved: solved && (trials > 1 ? trialsHeld : true),
    satisfiedCodes: solved && (trials > 1 ? trialsHeld : true) ? stage.appCodes : [],
    failures: solved && trials > 1 && !trialsHeld ? ['needs-more-trials'] : failures,
  };
}

function buildNodesFromLinks(
  links: [string, string][],
  kind: string,
): ConnectionNode[] {
  const ids = new Set<string>();
  for (const [a, b] of links) {
    ids.add(a);
    ids.add(b);
  }
  return [...ids].map((id, i) => ({
    id,
    kind: kind as ConnectionNode['kind'],
    capacity: 10,
    position: { x: i, y: 0, z: 0 },
    source: links.some(([from]) => from === id),
    sink: links.some(([, to]) => to === id),
  }));
}

/** Exposed so the UI can explain why a wire was refused. */
export function explainIncompatibility(
  stage: StageDefinition,
  fromId: string,
  toId: string,
): boolean {
  const data = stage.data as ConnectionStageData;
  const sources = data.scouts ?? data.seals ?? [];
  const kind = sources.find((s) => s.id === fromId)?.kind;
  const target = (data.routes ?? data.targets ?? []).find((t) => t.id === toId);
  if (kind === undefined || !target) return false;
  if (target.accepts === 'none') return false;
  return canConnect({ [fromId]: { kind: kind as ConnectionNode['kind'], capacity: 1, position: { x: 0, y: 0, z: 0 } } } as Record<string, ConnectionNode>, fromId, toId) && kind === target.accepts;
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

interface PlacementStageData {
  steps?: PlacementStep[];
  goalSignature?: string;
}

function evaluatePlacementStage(
  stage: StageDefinition,
  state: StageRuntimeState,
): StageEvaluation {
  const data = stage.data as PlacementStageData;
  const steps = data.steps ?? [];
  const order = (state.assignments.order as string[] | undefined) ?? steps.map((s) => s.id);
  const report = evaluatePlacement({
    steps,
    order,
    goalSignature: data.goalSignature ?? '',
  });
  return {
    solved: report.solved,
    satisfiedCodes: report.solved ? stage.appCodes : [],
    failures: report.failures.map((f) => f.code),
  };
}

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

interface AllocationStageData {
  lanes?: AllocationLane[];
  work?: WorkUnit[];
  requireEveryLaneUsed?: boolean;
  reseed?: boolean;
  prefersShared?: boolean;
}

function evaluateAllocationStage(
  stage: StageDefinition,
  state: StageRuntimeState,
): StageEvaluation {
  const data = stage.data as AllocationStageData;
  const report = evaluateAllocation(data.lanes ?? [], data.work ?? [], state.assignments);
  const failures = report.failures.map((f) => f.code);

  if (data.requireEveryLaneUsed) {
    const used = Object.values(state.assignments).filter((v) => v.length > 0).length;
    // A loom arm nobody used is wasted capacity, not a free choice.
    if (used < (data.lanes ?? []).length) failures.push('idle-lane');
  }

  if (data.prefersShared) {
    // BEE: sharing must beat the solo option on measured yield.
    const shared = evaluateAllocation(
      [{ id: 'floor-open', kind: 'resource', capacity: 3, latency: 2, costPerUnit: 1 }],
      data.work ?? [],
      { 'floor-open': (data.work ?? []).map((w) => w.id) },
    ).makespan;
    const solo = evaluateAllocation(
      [{ id: 'floor-shut', kind: 'resource', capacity: 3, latency: 0, costPerUnit: 1 }],
      data.work ?? [],
      { 'floor-shut': (data.work ?? []).map((w) => w.id) },
    ).makespan;
    if (shared <= solo) failures.push('sharing-not-useful');
  }

  return {
    solved: failures.length === 0 && report.solved,
    satisfiedCodes: failures.length === 0 && report.solved ? stage.appCodes : [],
    failures,
  };
}

// ---------------------------------------------------------------------------
// Perception
// ---------------------------------------------------------------------------

interface PerceptionStageData {
  gridWidth?: number;
  gridHeight?: number;
  budget?: number;
  reliableLight?: number;
  hasAnswerKey?: boolean;
}

/** The test scene is derived from the stage id so it is identical on every run. */
export function buildScene(stage: StageDefinition): Scene {
  const data = stage.data as PerceptionStageData;
  const width = data.gridWidth ?? 4;
  const height = data.gridHeight ?? 4;
  const rng = makeRng(hashStageId(stage.id));
  const cells: SceneCell[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const occluder = rng() < 0.25;
      cells.push({
        target: occluder || rng() < 0.4,
        occluder,
        // One deliberate dark band guarantees the depth lens has a real limit.
        lit: y === height - 1 && x < 2 ? 0.15 : 1,
        depth: rng(),
        moved: rng() < 0.3,
      });
    }
  }
  return { width, height, cells };
}

function hashStageId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function evaluatePerceptionStage(
  stage: StageDefinition,
  state: StageRuntimeState,
): StageEvaluation {
  const data = stage.data as PerceptionStageData;
  const scene = buildScene(stage);
  const lens = (state.lens as LensId | undefined) ?? null;
  if (!lens) {
    return { solved: false, satisfiedCodes: [], failures: ['no-lens'] };
  }

  const params = {
    budget: data.budget ?? scene.cells.length,
    reliableLight: data.reliableLight ?? 0.4,
  };
  const reports = (['edge', 'depth', 'motion'] as LensId[]).map((l) =>
    perceive(scene, l, params, (state.observations ?? 0) > 1),
  );
  void lens;

  const failures: string[] = [];
  if ((state.observations ?? 0) < 2) failures.push('needs-baseline');

  // No lens resolves everything, and that is the lesson. The stage clears when
  // the player has classified every cell correctly as either something an
  // instrument can actually see, or something it merely assumes.
  const resolvable = new Set<number>();
  const unresolvable = new Set<number>();
  for (const report of reports) {
    for (const index of report.correct) resolvable.add(index);
    for (const index of [...report.unseen, ...report.uncertain]) unresolvable.add(index);
  }
  // A cell only counts as truly unresolvable when no lens ever got it right.
  for (const index of [...resolvable]) {
    if (!reports.some((r) => r.correct.includes(index))) resolvable.delete(index);
  }
  const truth = new Map<number, 'observed' | 'assumed'>();
  for (const index of resolvable) truth.set(index, 'observed');
  for (const index of unresolvable) if (!truth.has(index)) truth.set(index, 'assumed');

  const marked = new Map<string, string>();
  for (const [index, verdict] of (state.assignments.__marked as string[] | undefined ?? []).map(
    (entry) => entry.split(':') as [string, string],
  )) {
    marked.set(index, verdict);
  }

  if (marked.size < truth.size) failures.push('cells-unclassified');
  for (const [index, verdict] of truth) {
    if (marked.get(String(index)) !== verdict) failures.push('misclassified');
  }

  const solved = failures.length === 0;
  return {
    solved,
    satisfiedCodes: solved ? stage.appCodes : [],
    failures: solved ? [] : [...new Set(failures)],
  };
}

/**
 * Cell classification used by the mirror stages: the player marks each cell as
 * observed or assumed, and the scene decides whether they were honest.
 */
export interface CellTruth {
  index: number;
  truth: 'observed' | 'assumed';
}

/** Marks every cell the way the scene actually supports. */
export function cellTruths(stage: StageDefinition): CellTruth[] {
  const data = stage.data as { gridWidth?: number; gridHeight?: number; reliableLight?: number };
  const scene = buildScene(stage);
  const params = {
    budget: scene.cells.length,
    reliableLight: data.reliableLight ?? 0.4,
  };
  const reports = (['edge', 'depth', 'motion'] as LensId[]).map((l) =>
    perceive(scene, l, params, true),
  );
  const resolvable = new Set<number>();
  const unresolvable = new Set<number>();
  for (const report of reports) {
    for (const index of report.correct) resolvable.add(index);
    for (const index of [...report.unseen, ...report.uncertain]) unresolvable.add(index);
  }
  for (const index of [...resolvable]) {
    if (!reports.some((r) => r.correct.includes(index))) resolvable.delete(index);
  }
  const out: CellTruth[] = [];
  for (let index = 0; index < scene.cells.length; index += 1) {
    out.push({
      index,
      truth: resolvable.has(index) ? 'observed' : 'assumed',
    });
  }
  return out;
}

/** PDT: the sensors the player has actually read, and the faults still possible. */
export function symptomSetFromSensors(sensors: string[]): number[] {
  // Each sensor id encodes one authored symptom index.
  return sensors.map((id) => Number(id.replace('sensor-', ''))).filter((n) => Number.isFinite(n));
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

interface EvidenceStageData {
  capacity?: number;
  requiredTags?: string[];
  records?: EvidenceRecord[];
  correctable?: string[];
  seats?: CouncilSeat[];
  contradicted?: string[];
  requiredStates?: string[];
}

function evaluateEvidenceStage(
  stage: StageDefinition,
  state: StageRuntimeState,
): StageEvaluation {
  const data = stage.data as EvidenceStageData;

  if (data.seats) {
    // The chamber is cleared by naming the assumption the majority shares
    // wrongly — not by reaching agreement with it.
    const flagged = (state.assignments.__flagged as string[] | undefined) ?? [];
    const caught = (data.contradicted ?? []).every((assumption) => flagged.includes(assumption));
    const failures: string[] = [];
    if (!caught) failures.push('consensus-unexamined');
    return {
      solved: caught,
      satisfiedCodes: caught ? stage.appCodes : [],
      failures,
    };
  }

  if (data.requiredStates) {
    // AOS: the full supervision lifecycle must have actually been performed.
    const performed = (state.assignments.__states as string[] | undefined) ?? [];
    const missing = data.requiredStates.filter((s) => !performed.includes(s));
    return {
      solved: missing.length === 0,
      satisfiedCodes: missing.length === 0 ? stage.appCodes : [],
      failures: missing.map((m) => `missing-state:${m}`),
    };
  }

  const rawRecords = data.records ?? [];
  const corrected = new Set(state.corrected ?? []);
  const records: EvidenceRecord[] = rawRecords.map((r) =>
    corrected.has(r.id) ? { ...r, fresh: true } : r,
  );

  const report = evaluateEvidence(
    records,
    { capacity: data.capacity ?? 3, packed: state.packed ?? [] },
    { requiredTags: data.requiredTags ?? [], requireClean: true },
  );

  return {
    solved: report.solved,
    satisfiedCodes: report.solved ? stage.appCodes : [],
    failures: report.failures.map((f) => f.code),
  };
}

// ---------------------------------------------------------------------------
// Prediction
// ---------------------------------------------------------------------------

interface PredictionStageData {
  options?: { id: string; outcome: number }[];
  correct?: string;
  branches?: Counterfactual[];
  actual?: number;
  verifyTarget?: string;
  decoyTarget?: string;
  trueFault?: string;
  decoySymptom?: number;
  causeSymptom?: number;
  sensors?: number;
  markAssumed?: boolean;
  gridWidth?: number;
  gridHeight?: number;
}

function evaluatePredictionStage(
  stage: StageDefinition,
  state: StageRuntimeState,
): StageEvaluation {
  const data = stage.data as PredictionStageData;

  // CUL: the mechanism that was intended must be the one that responded.
  if (data.verifyTarget && data.decoyTarget) {
    const observedList = state.assignments.__observed;
    const observed = observedList?.[0];
    const failures: string[] = [];
    if (!state.chosen) failures.push('no-decision');
    if (state.chosen && data.correct && state.chosen !== data.correct) {
      failures.push('wrong-decision');
    }
    if (observed === undefined) {
      failures.push('not-verified');
    } else {
      const verification = verifyAction({
        intendedMechanism: data.verifyTarget,
        observedMechanism: observed,
        actionSucceeded: true,
      });
      if (!verification.verified) failures.push(verification.failureCode ?? 'wrong-target');
    }
    return {
      solved: failures.length === 0,
      satisfiedCodes: failures.length === 0 ? stage.appCodes : [],
      failures,
    };
  }

  if (data.branches) {
    const chosen = state.chosen;
    const failures: string[] = [];
    if (!chosen) failures.push('no-decision');
    if (!state.approved) failures.push('not-approved');
    if (chosen) {
      const comparison = compareToOutcome(data.branches, chosen, data.actual ?? 0);
      // The finale's rule: the decision must have been the better of the two.
      if (data.correct && chosen !== data.correct) failures.push('wrong-choice');
      if (comparison && Math.abs(comparison.error) > 30) failures.push('large-model-error');
    }
    return {
      solved: failures.length === 0,
      satisfiedCodes: failures.length === 0 ? stage.appCodes : [],
      failures,
    };
  }

  if (data.options) {
    const chosen = state.chosen;
    const correct = data.correct ?? data.options[0]?.id;
    return {
      solved: chosen === correct,
      satisfiedCodes: chosen === correct ? stage.appCodes : [],
      failures: chosen === correct ? [] : chosen ? ['wrong-decision'] : ['no-decision'],
    };
  }

  // PDT: sensors narrow the field; the stage clears only when exactly one fault
  // survives, and that fault must be the real one.
  if (data.sensors && data.trueFault) {
    const placed = (state.assignments.__sensors as string[] | undefined) ?? [];
    if (placed.length === 0) {
      return { solved: false, satisfiedCodes: [], failures: ['no-sensors'] };
    }
    const remaining = narrowCandidates(Object.keys(FAULTS) as FaultId[], symptomSetFromSensors(placed));
    const solved = remaining.length === 1 && remaining[0] === data.trueFault;
    const failures: string[] = [];
    if (remaining.length > 1) failures.push('candidates-remain');
    if (remaining.length === 1 && remaining[0] !== data.trueFault) failures.push('wrong-fault');
    return {
      solved,
      satisfiedCodes: solved ? stage.appCodes : [],
      failures: failures.length ? failures : solved ? [] : ['inconclusive'],
    };
  }

  // WFM / ITL: honest modelling means classifying every cell as something the
  // instruments actually saw, or something the model merely assumed.
  if (data.markAssumed) {
    const truths = cellTruths(stage);
    const marked = new Map(
      ((state.assignments.__marked as string[] | undefined) ?? []).map(
        (entry) => entry.split(':') as [string, string],
      ),
    );
    const failures: string[] = [];
    if ((state.observations ?? 0) < 1) failures.push('needs-observation');
    for (const { index, truth } of truths) {
      if (marked.get(String(index)) !== truth) failures.push('misclassified');
    }
    const solved = failures.length === 0;
    return {
      solved,
      satisfiedCodes: solved ? stage.appCodes : [],
      failures: solved ? [] : [...new Set(failures)],
    };
  }

  return { solved: false, satisfiedCodes: [], failures: ['no-data'] };
}

/** World-space position of a stage console inside its region. */
export function stageWorldPosition(stage: StageDefinition, anchor: Vec3): Vec3 {
  return {
    x: anchor.x + stage.offset[0],
    y: anchor.y + stage.offset[1],
    z: anchor.z + stage.offset[2],
  };
}