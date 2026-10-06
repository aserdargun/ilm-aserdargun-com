/**
 * PERCEPTION — what a lens can and cannot show.
 *
 * Powers VIS (edge / depth / motion layers), CVL (measuring those layers
 * against a known answer key and hitting occlusion or light failures),
 * WFM (a model that preserves uncertainty) and WML (counterfactual branches).
 *
 * The point of the system is its *limits*: occlusion hides what is behind it,
 * a depth lens is unreliable in poor light, and a motion lens can only report
 * cells that actually changed between two observations.
 */

export type LensId = 'edge' | 'depth' | 'motion';

export const LENS_IDS: readonly LensId[] = ['edge', 'depth', 'motion'] as const;

export interface SceneCell {
  /** The property the test scene actually holds. */
  target: boolean;
  /** Something solid in front of the cell. */
  occluder: boolean;
  /** Illumination at this cell, 0..1. */
  lit: number;
  /** Depth value used by the depth lens. */
  depth: number;
  /** Whether the cell changed since the previous observation. */
  moved: boolean;
}

export interface Scene {
  width: number;
  height: number;
  cells: SceneCell[];
}

export interface PerceptionParams {
  /** Cells the lens cannot resolve at all, budget-wise. */
  budget: number;
  /** Depth readouts below this light level are unreliable. */
  reliableLight: number;
}

export interface PerceptionReport {
  lens: LensId;
  /** Indices the lens resolved to the correct answer. */
  correct: number[];
  /** Indices the lens reported but got wrong. */
  wrong: number[];
  /** Indices the lens never resolved. */
  unseen: number[];
  /** Fraction of the scene resolved correctly, 0..1. */
  accuracy: number;
  /** Cells the lens reported whose confidence is too low to act on. */
  uncertain: number[];
  solved: boolean;
  failures: { code: string; subjectId?: string }[];
  satisfiedIds: string[];
}

export function cellIndex(scene: Scene, x: number, y: number): number {
  return y * scene.width + x;
}

export function cellAt(scene: Scene, index: number): SceneCell | undefined {
  return scene.cells[index];
}

/**
 * Rows run away from the viewer, so the cell in *front* of (x, y) is (x, y+1).
 * A solid form there hides whatever sits behind it.
 */
export function isOccluded(scene: Scene, index: number): boolean {
  const x = index % scene.width;
  const y = Math.floor(index / scene.width);
  const frontIndex = cellIndex(scene, x, y + 1);
  const front = scene.cells[frontIndex];
  return Boolean(front && front.occluder);
}

/**
 * Runs one lens over the scene and reports what it got right, wrong, and
 * skipped. `motion` reads the previous observation's `moved` flags, so it
 * requires the player to observe the scene twice to be useful.
 */
export function perceive(
  scene: Scene,
  lens: LensId,
  params: PerceptionParams,
  observedBefore = false,
): PerceptionReport {
  const correct: number[] = [];
  const wrong: number[] = [];
  const unseen: number[] = [];
  const uncertain: number[] = [];

  let budget = Math.max(0, Math.floor(params.budget));

  for (let index = 0; index < scene.cells.length; index += 1) {
    const cell = scene.cells[index];

    if (lens === 'motion' && !observedBefore) {
      // Without a prior observation there is nothing to compare against.
      unseen.push(index);
      continue;
    }
    if (budget <= 0) {
      unseen.push(index);
      continue;
    }
    budget -= 1;

    let claim: boolean;
    let confident = true;

    if (lens === 'edge') {
      claim = cell.occluder;
      if (isOccluded(scene, index)) {
        // The edge behind a solid form is genuinely unresolvable here.
        claim = false;
        confident = false;
      }
    } else if (lens === 'depth') {
      // Depth readouts collapse in poor light — this is the CVL light failure.
      if (cell.lit < params.reliableLight) {
        claim = false;
        confident = false;
      } else {
        claim = cell.depth > 0.5;
      }
    } else {
      claim = cell.moved;
    }

    if (!confident) uncertain.push(index);
    if (claim === cell.target) correct.push(index);
    else wrong.push(index);
  }

  const resolved = correct.length + wrong.length;
  const accuracy = resolved === 0 ? 0 : correct.length / resolved;

  // The task counts as done only when nothing is misreported: a lens that
  // answers confidently and wrongly is worse than one that stays silent.
  const solved = wrong.length === 0 && unseen.length === 0 && scene.cells.length > 0;

  const failures: { code: string; subjectId?: string }[] = [];
  if (unseen.length > 0) failures.push({ code: 'not-resolved' });
  if (wrong.length > 0) failures.push({ code: 'misread' });
  if (lens === 'depth' && uncertain.length > 0) failures.push({ code: 'low-light' });
  if (lens === 'motion' && !observedBefore) failures.push({ code: 'needs-baseline' });

  return {
    lens,
    correct,
    wrong,
    unseen,
    accuracy,
    uncertain,
    solved,
    failures,
    satisfiedIds: solved ? [lens] : [],
  };
}

/**
 * A world model predicts the next state but must keep uncertainty about the
 * parts it never observed (WFM). `observed` marks what has actually been seen.
 */
export interface WorldModel {
  /** Cell indices the model has genuinely observed. */
  observed: number[];
  /** Cell indices the model is extrapolating. */
  assumed: number[];
}

export function partitionCells(
  scene: Scene,
  perception: PerceptionReport,
): WorldModel {
  const observed = perception.correct.slice();
  const assumed = scene.cells.map((_, i) => i).filter((i) => !observed.includes(i));
  return { observed, assumed };
}

/**
 * Weighted prediction error. Cells the model merely assumed count double, so a
 * plan resting mostly on assumptions reports higher uncertainty than one built
 * on observation — which is the lesson WFM exists to teach.
 */
export function modelUncertainty(
  model: WorldModel,
  truth: boolean[],
  predictions: boolean[],
): number {
  const observed = new Set(model.observed);
  let weightedError = 0;
  let totalWeight = 0;
  const length = Math.min(truth.length, predictions.length);
  for (let index = 0; index < length; index += 1) {
    const weight = observed.has(index) ? 1 : 2;
    if (truth[index] !== predictions[index]) weightedError += weight;
    totalWeight += weight;
  }
  return totalWeight === 0 ? 0 : weightedError / totalWeight;
}