/**
 * EVIDENCE — capacity-limited context, staleness and correction.
 *
 * Powers CTX (packing a lantern, where irrelevant material crowds out useful
 * information), MEM (revising a route record after the world changed), AGR (a
 * majority sharing one wrong assumption), CUL (verify the intended mechanism
 * actually responded) and AOS (inspect, pause, retask, resume).
 *
 * The recurring trap: a record can be *confident and wrong*. Freshness and
 * correctness are deliberately separate fields, because that is precisely the
 * failure the world is built around.
 */

export interface EvidenceRecord {
  id: string;
  /** True when the record was written against the world's current state. */
  fresh: boolean;
  /** True when the claim itself holds. */
  correct: boolean;
  /** Tags used for relevance matching against the active lantern. */
  tags: string[];
  /** How strongly the record matches; 0..1. */
  relevance: number;
  body?: Record<'tr' | 'en', string>;
}

export interface Lantern {
  /** Total capacity in the game's abstract capacity unit. */
  capacity: number;
  /** Currently packed record ids, in load order. */
  packed: string[];
}

export interface EvidenceReport {
  /** Records actually admitted into the lantern. */
  admitted: string[];
  /** Records displaced because the lantern ran out of room. */
  crowdedOut: string[];
  /** Records still inside whose contents are stale or false. */
  suspect: string[];
  solved: boolean;
  failures: { code: string; subjectId?: string }[];
  satisfiedIds: string[];
}

export interface EvidenceGoal {
  /** Every one of these tags must be represented in the lantern. */
  requiredTags: string[];
  /** No admitted record may still be stale or incorrect. */
  requireClean: boolean;
}

export function recordCost(record: EvidenceRecord): number {
  // A verbose record costs more room. Relevance alone does not earn space.
  return 1 + Math.max(0, record.tags.length - 1);
}

/**
 * Packs records in the order given until capacity is exhausted. Anything after
 * the first overflow is displaced — this is what makes over-packing punished
 * rather than silently beneficial.
 */
export function packEvidence(
  records: EvidenceRecord[],
  lantern: Lantern,
): { admitted: string[]; crowdedOut: string[] } {
  const byId: Record<string, EvidenceRecord> = {};
  for (const record of records) byId[record.id] = record;

  const admitted: string[] = [];
  const crowdedOut: string[] = [];
  let used = 0;

  for (const id of lantern.packed) {
    const record = byId[id];
    if (!record) {
      crowdedOut.push(id);
      continue;
    }
    const cost = recordCost(record);
    if (used + cost <= lantern.capacity) {
      admitted.push(id);
      used += cost;
    } else {
      crowdedOut.push(id);
    }
  }

  return { admitted, crowdedOut };
}

export function evaluateEvidence(
  records: EvidenceRecord[],
  lantern: Lantern,
  goal: EvidenceGoal,
): EvidenceReport {
  const byId: Record<string, EvidenceRecord> = {};
  for (const record of records) byId[record.id] = record;

  const { admitted, crowdedOut } = packEvidence(records, lantern);
  const failures: { code: string; subjectId?: string }[] = [];
  const suspect: string[] = [];

  for (const id of admitted) {
    const record = byId[id];
    if (!record.fresh || !record.correct) {
      suspect.push(id);
      if (!record.fresh) failures.push({ code: 'stale-record', subjectId: id });
      if (!record.correct) failures.push({ code: 'false-record', subjectId: id });
    }
  }

  if (crowdedOut.length > 0) {
    failures.push({ code: 'context-overflow' });
  }

  const admittedTags = new Set<string>();
  for (const id of admitted) {
    for (const tag of byId[id].tags) admittedTags.add(tag);
  }
  for (const tag of goal.requiredTags) {
    if (!admittedTags.has(tag)) failures.push({ code: 'missing-evidence', subjectId: tag });
  }

  if (goal.requireClean && suspect.length > 0) {
    failures.push({ code: 'unverified-context' });
  }

  const solved = failures.length === 0 && admitted.length > 0;

  return {
    admitted,
    crowdedOut,
    suspect,
    solved,
    failures,
    satisfiedIds: solved ? admitted : [],
  };
}

/**
 * AGR — a council reaches agreement. Agreement is reported as agreement, never
 * as correctness, so this deliberately exposes whether the shared assumption
 * actually holds.
 */
export interface CouncilSeat {
  id: string;
  vote: 'proceed' | 'abstain' | 'block';
  /** The assumption this seat is relying on. */
  assumes: string;
}

export interface CouncilReport {
  votes: Record<'proceed' | 'abstain' | 'block', number>;
  /** True when the panel converged on one vote. */
  converged: boolean;
  /** The assumption the majority shares, if any. */
  sharedAssumption?: string;
  /** Whether that shared assumption is contradicted by evidence. */
  assumptionInvalid: boolean;
  solved: boolean;
  failures: { code: string; subjectId?: string }[];
  satisfiedIds: string[];
}

export function evaluateCouncil(
  seats: CouncilSeat[],
  contradictedAssumptions: string[],
  /** A proposed action is only safe when a correct seat blocks or the shared
   *  assumption survives verification. */
  proceedRequiresValidAssumption = true,
): CouncilReport {
  const votes = { proceed: 0, abstain: 0, block: 0 };
  const tally: Record<string, number> = {};

  for (const seat of seats) {
    votes[seat.vote] += 1;
    tally[seat.assumes] = (tally[seat.assumes] ?? 0) + 1;
  }

  let sharedAssumption: string | undefined;
  let best = 0;
  for (const [assumption, count] of Object.entries(tally)) {
    if (count > best) {
      best = count;
      sharedAssumption = assumption;
    }
  }

  const total = seats.length;
  const converged = total > 0 && best > total / 2;
  const assumptionInvalid =
    sharedAssumption !== undefined && contradictedAssumptions.includes(sharedAssumption);

  const failures: { code: string; subjectId?: string }[] = [];
  if (converged && assumptionInvalid) {
    failures.push({ code: 'false-consensus', subjectId: sharedAssumption });
  }
  if (converged && proceedRequiresValidAssumption && assumptionInvalid) {
    failures.push({ code: 'do-not-trust-majority' });
  }
  if (!converged) {
    failures.push({ code: 'no-consensus' });
  }

  const solved = failures.length === 0;
  return {
    votes,
    converged,
    sharedAssumption,
    assumptionInvalid,
    solved,
    failures,
    satisfiedIds: solved ? seats.map((s) => s.id) : [],
  };
}

/**
 * CUL — observe, act, verify. Returns whether the mechanism that was *intended*
 * actually responded, which is deliberately not the same as "the action ran".
 */
export interface ActVerification {
  /** What the operator expected to move. */
  intendedMechanism: string;
  /** What actually moved. */
  observedMechanism: string;
  /** Whether the action completed without error. */
  actionSucceeded: boolean;
}

export interface VerifyReport {
  verified: boolean;
  failureCode?: 'wrong-target' | 'action-failed';
  satisfiedIds: string[];
}

export function verifyAction(report: ActVerification): VerifyReport {
  if (!report.actionSucceeded) {
    return { verified: false, failureCode: 'action-failed', satisfiedIds: [] };
  }
  if (report.intendedMechanism !== report.observedMechanism) {
    return { verified: false, failureCode: 'wrong-target', satisfiedIds: [] };
  }
  return {
    verified: true,
    satisfiedIds: [report.intendedMechanism],
  };
}

/** AOS — inspect, pause, retask, resume. */
export type WorkerState = 'running' | 'paused' | 'retasked' | 'resumed';

export function canTransition(from: WorkerState, to: WorkerState): boolean {
  const table: Record<WorkerState, WorkerState[]> = {
    running: ['paused'],
    paused: ['running', 'retasked'],
    retasked: ['resumed', 'running'],
    resumed: ['running', 'paused'],
  };
  return table[from].includes(to);
}