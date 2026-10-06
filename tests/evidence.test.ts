import { describe, expect, it } from 'vitest';
import {
  canTransition,
  evaluateCouncil,
  evaluateEvidence,
  packEvidence,
  recordCost,
  verifyAction,
  type EvidenceRecord,
} from '../src/systems/evidence';

const records: EvidenceRecord[] = [
  { id: 'r1', fresh: true, correct: true, tags: ['flow'], relevance: 1 },
  { id: 'r2', fresh: true, correct: true, tags: ['flow', 'pump'], relevance: 0.9 },
  { id: 'r3', fresh: false, correct: true, tags: ['route'], relevance: 0.4 },
  { id: 'r4', fresh: true, correct: false, tags: ['council'], relevance: 0.8 },
  { id: 'r5', fresh: true, correct: true, tags: ['noise', 'noise'], relevance: 0.1 },
];

describe('evidence system', () => {
  it('charges more capacity for a record carrying more tags', () => {
    expect(recordCost(records[0])).toBe(1);
    expect(recordCost(records[4])).toBe(2);
  });

  it('crowds out records packed past the lantern capacity', () => {
    // r1 costs 1, r2 costs 2, r5 costs 2. Only r1 fits inside a capacity of 2.
    const result = packEvidence(records, { capacity: 2, packed: ['r1', 'r2', 'r5'] });
    expect(result.admitted).toEqual(['r1']);
    expect(result.crowdedOut).toEqual(['r2', 'r5']);
  });

  it('reports a stale record distinctly from an incorrect one', () => {
    const report = evaluateEvidence(records, { capacity: 10, packed: ['r3', 'r4'] }, {
      requiredTags: ['route', 'council'],
      requireClean: true,
    });
    expect(report.suspect).toEqual(['r3', 'r4']);
    expect(report.failures).toContainEqual({ code: 'stale-record', subjectId: 'r3' });
    expect(report.failures).toContainEqual({ code: 'false-record', subjectId: 'r4' });
    expect(report.failures).toContainEqual({ code: 'unverified-context' });
    expect(report.solved).toBe(false);
  });

  it('solves when the lantern holds the required, current evidence', () => {
    const report = evaluateEvidence(records, { capacity: 4, packed: ['r1', 'r2'] }, {
      requiredTags: ['flow', 'pump'],
      requireClean: true,
    });
    expect(report.solved).toBe(true);
    expect(report.crowdedOut).toEqual([]);
  });

  it('fails when the lantern cannot fit the required tags at all', () => {
    const report = evaluateEvidence(records, { capacity: 1, packed: ['r5', 'r2'] }, {
      requiredTags: ['pump'],
      requireClean: true,
    });
    expect(report.failures).toContainEqual({ code: 'context-overflow' });
    expect(report.solved).toBe(false);
  });

  it('is not solved with an empty lantern even when no rule is violated', () => {
    const report = evaluateEvidence(records, { capacity: 5, packed: [] }, {
      requiredTags: [],
      requireClean: true,
    });
    expect(report.solved).toBe(false);
  });
});

describe('council consensus', () => {
  const seats = [
    { id: 'a', vote: 'proceed' as const, assumes: 'the-inlet-is-clear' },
    { id: 'b', vote: 'proceed' as const, assumes: 'the-inlet-is-clear' },
    { id: 'c', vote: 'proceed' as const, assumes: 'the-inlet-is-clear' },
    { id: 'd', vote: 'abstain' as const, assumes: 'the-inlet-is-clear' },
  ];

  it('exposes agreement that rests on a contradicted assumption', () => {
    const report = evaluateCouncil(seats, ['the-inlet-is-clear']);
    expect(report.converged).toBe(true);
    expect(report.votes.proceed).toBe(3);
    expect(report.assumptionInvalid).toBe(true);
    expect(report.failures).toContainEqual({
      code: 'false-consensus',
      subjectId: 'the-inlet-is-clear',
    });
    expect(report.solved).toBe(false);
  });

  it('accepts consensus once the shared assumption survives evidence', () => {
    const report = evaluateCouncil(seats, ['something-else']);
    expect(report.converged).toBe(true);
    expect(report.assumptionInvalid).toBe(false);
    expect(report.solved).toBe(true);
  });

  it('does not invent consensus from a split panel', () => {
    const split = [
      { id: 'a', vote: 'proceed' as const, assumes: 'x' },
      { id: 'b', vote: 'block' as const, assumes: 'y' },
      { id: 'c', vote: 'abstain' as const, assumes: 'z' },
    ];
    const report = evaluateCouncil(split, []);
    expect(report.converged).toBe(false);
    expect(report.failures).toContainEqual({ code: 'no-consensus' });
  });
});

describe('observe, act, verify', () => {
  it('treats a completed action that moved the wrong mechanism as a failure', () => {
    const result = verifyAction({
      intendedMechanism: 'pump',
      observedMechanism: 'valve',
      actionSucceeded: true,
    });
    expect(result.verified).toBe(false);
    expect(result.failureCode).toBe('wrong-target');
  });

  it('separates an action error from a targeting error', () => {
    const result = verifyAction({
      intendedMechanism: 'pump',
      observedMechanism: 'pump',
      actionSucceeded: false,
    });
    expect(result.failureCode).toBe('action-failed');
  });

  it('verifies only when the intended mechanism actually responded', () => {
    const result = verifyAction({
      intendedMechanism: 'pump',
      observedMechanism: 'pump',
      actionSucceeded: true,
    });
    expect(result.verified).toBe(true);
  });
});

describe('supervised worker lifecycle', () => {
  it('allows pausing a running worker', () => {
    expect(canTransition('running', 'paused')).toBe(true);
  });

  it('forbids resuming a worker that was never paused', () => {
    expect(canTransition('running', 'resumed')).toBe(false);
  });

  it('requires pausing before retasking', () => {
    expect(canTransition('paused', 'retasked')).toBe(true);
    expect(canTransition('running', 'retasked')).toBe(false);
  });
});