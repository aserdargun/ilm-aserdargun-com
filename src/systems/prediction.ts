/**
 * PREDICTION — a model, a preview, and an honest comparison with reality.
 *
 * Powers ITL (build a small model of the water system), PDT (place sensors to
 * narrow a fault), DTR (compare two options, approve one, examine the result),
 * EVL (test a repair under several conditions), WML (counterfactual previews)
 * and the finale, where the visible symptom is not the fault.
 *
 * Predictions here are useful but deliberately fallible: a model built from
 * incomplete observation must be able to be confidently wrong.
 */

export type FaultId = 'seal-wear' | 'cavitation' | 'sensor-drift' | 'blocked-inlet' | 'vane-shear';

export interface FaultSignature {
  /** Signals that a careful observer would actually notice. */
  symptoms: number[];
  /** Signals that are true but not what is actually wrong. */
  decoys: number[];
}

/**
 * Deliberately separates the symptom from the cause. This mismatch is the
 * finale's central move: the loudest signal is not the fault.
 */
export const FAULTS: Record<FaultId, FaultSignature> = {
  // Chosen so that every fault can be isolated by some combination of
  // observed symptoms: no signature may be a superset of another, or the
  // diagnosis puzzle would have an unwinnable answer.
  'seal-wear': { symptoms: [1, 5], decoys: [2] },
  cavitation: { symptoms: [2, 4], decoys: [1] },
  'sensor-drift': { symptoms: [6], decoys: [3] },
  'blocked-inlet': { symptoms: [3, 5], decoys: [4] },
  'vane-shear': { symptoms: [4, 6], decoys: [1] },
};

export interface RepairPart {
  id: string;
  fault: FaultId;
  /** Fictional fit cost; higher is harder to fit in the workshop. */
  fitCost: number;
  /** Whether the part can be swapped without shutting the system down. */
  hotSwappable: boolean;
}

export interface DiagnosisReport {
  /** The fault the player named. */
  chosen: FaultId;
  correct: boolean;
  /** Symptoms the player actually observed. */
  observed: number[];
  /** Signals they used that were merely correlated. */
  leanedOnDecoys: number[];
  solved: boolean;
  failures: { code: string; subjectId?: string }[];
  satisfiedIds: string[];
}

export function diagnose(
  chosen: FaultId,
  trueFault: FaultId,
  observed: number[],
): DiagnosisReport {
  const signature = FAULTS[chosen];
  const observedSet = new Set(observed);
  const leanedOnDecoys = signature.decoys.filter((d) => observedSet.has(d));
  // Naming the true fault is not enough: the player must also have looked where
  // the cause actually shows, not only where the loudest decoy points.
  const sawCause = signature.symptoms.some((s) => observedSet.has(s));
  const correct = chosen === trueFault;
  const solved = correct && sawCause && leanedOnDecoys.length === 0;

  const failures: { code: string; subjectId?: string }[] = [];
  if (!correct) failures.push({ code: 'wrong-fault', subjectId: trueFault });
  if (!sawCause) failures.push({ code: 'cause-unobserved', subjectId: chosen });
  if (leanedOnDecoys.length > 0) failures.push({ code: 'symptom-confusion' });

  return {
    chosen,
    correct,
    observed,
    leanedOnDecoys,
    solved,
    failures,
    satisfiedIds: solved ? [chosen] : [],
  };
}

/**
 * PDT — placing sensors narrows the candidate fault set.
 *
 * A fault stays a candidate only while it can still account for *every*
 * symptom the player has observed. Once the player reports something a fault
 * cannot explain at all, that fault is eliminated — which is what turns a
 * handful of sensor positions into a diagnosis.
 */
export function narrowCandidates(
  allFaults: FaultId[],
  observedSymptoms: number[],
): FaultId[] {
  if (observedSymptoms.length === 0) return allFaults.slice();
  return allFaults.filter((fault) => {
    const signature = FAULTS[fault];
    const explicable = new Set([...signature.symptoms, ...signature.decoys]);
    return observedSymptoms.every((symptom) => explicable.has(symptom));
  });
}

export interface Scenario {
  id: string;
  /** Baseline pump output in fictional units. */
  baseline: number;
  /** Multiplier applied when the true fault is present. */
  faultEffect: number;
}

export interface Prediction {
  outcome: number;
  /** 0..1; higher means the model rested on assumptions rather than evidence. */
  uncertainty: number;
}

/** EVL — the same repair is retested under different conditions. */
export interface EvalCondition {
  id: string;
  scenario: Scenario;
  /** Conditions whose result differs from baseline are the ones that matter. */
  expectDifferent: boolean;
}

export interface EvalReport {
  passed: string[];
  failed: string[];
  /** Conditions where a repair that passed once still fails. */
  fragile: string[];
  solved: boolean;
  failures: { code: string; subjectId?: string }[];
  satisfiedIds: string[];
}

export function evaluateRepair(
  repairedFault: FaultId | null,
  conditions: EvalCondition[],
): EvalReport {
  const passed: string[] = [];
  const failed: string[] = [];

  for (const condition of conditions) {
    const activeFault: FaultId | null = repairedFault;
    const outcome = condition.scenario.baseline * (activeFault ? condition.scenario.faultEffect : 1);
    const behaves = activeFault === repairedFault;
    const differs = outcome !== condition.scenario.baseline;
    if (behaves && differs === condition.expectDifferent) passed.push(condition.id);
    else failed.push(condition.id);
  }

  // A repair that only holds under the first condition is fragile, not fixed.
  const fragile = failed.slice();
  const failures: { code: string; subjectId?: string }[] = [];
  for (const id of fragile) failures.push({ code: 'condition-failed', subjectId: id });
  if (repairedFault === null) failures.push({ code: 'no-repair' });

  const solved = failures.length === 0 && conditions.length > 0;
  return {
    passed,
    failed: fragile,
    fragile,
    solved,
    failures,
    satisfiedIds: solved ? passed : [],
  };
}

/** DTR / WML — preview two options, approve one, compare against reality. */
export interface Counterfactual {
  id: string;
  label: string;
  predicted: number;
}

export interface OutcomeComparison {
  chosen: string;
  predicted: number;
  actual: number;
  /** Signed gap between what the model promised and what happened. */
  error: number;
  /** True when the chosen option still beat the one that was declined. */
  wasBestChoice: boolean;
}

export function compareToOutcome(
  branches: Counterfactual[],
  chosenId: string,
  actual: number,
): OutcomeComparison | undefined {
  const chosen = branches.find((b) => b.id === chosenId);
  if (!chosen) return undefined;
  let bestPredicted = chosen.predicted;
  for (const branch of branches) {
    if (branch.predicted > bestPredicted) bestPredicted = branch.predicted;
  }
  return {
    chosen: chosenId,
    predicted: chosen.predicted,
    actual,
    error: actual - chosen.predicted,
    // The choice is judged against the best available option, not perfection.
    wasBestChoice: chosen.predicted === bestPredicted,
  };
}

/** ITL — an assumption is only ever "consistent with evidence", never proven. */
export function supportsConclusion(
  predicted: number[],
  observed: number[],
  tolerance: number,
): boolean {
  if (predicted.length === 0 || observed.length === 0) return false;
  const length = Math.min(predicted.length, observed.length);
  let matches = 0;
  for (let i = 0; i < length; i += 1) {
    if (Math.abs(predicted[i] - observed[i]) <= tolerance) matches += 1;
  }
  return matches / length >= 0.8;
}