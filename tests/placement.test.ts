import { describe, expect, it } from 'vitest';
import { evaluatePlacement, moveStep, type PlacementStep } from '../src/systems/placement';

const STEPS: PlacementStep[] = [
  { id: 'sense', effect: 'sensed', requires: [] },
  { id: 'plan', effect: 'planned', requires: ['sensed'] },
  { id: 'act', effect: 'acted', requires: ['planned'] },
  { id: 'verify', effect: 'verified', requires: ['acted'] },
];

function state(order: string[]) {
  return { steps: STEPS, order, goalSignature: 'sensed>planned>acted>verified' };
}

describe('placement system', () => {
  it('solves when the order produces the target signature', () => {
    const report = evaluatePlacement(state(['sense', 'plan', 'act', 'verify']));
    expect(report.solved).toBe(true);
    expect(report.executed).toHaveLength(4);
  });

  it('reports the first step whose requirements are unmet', () => {
    const report = evaluatePlacement(state(['plan', 'sense', 'act', 'verify']));
    expect(report.solved).toBe(false);
    expect(report.failedStepId).toBe('plan');
    expect(report.failures).toContainEqual({ code: 'requirement-missing', subjectId: 'plan' });
  });

  it('detects a dropped step rather than silently ignoring it', () => {
    const report = evaluatePlacement(state(['sense', 'plan', 'verify']));
    expect(report.solved).toBe(false);
    expect(report.failures).toContainEqual({ code: 'missing-step', subjectId: 'act' });
  });

  it('detects a duplicated step', () => {
    const report = evaluatePlacement(state(['sense', 'sense', 'plan', 'act', 'verify']));
    expect(report.failures).toContainEqual({ code: 'duplicate-step', subjectId: 'sense' });
  });

  it('accepts two different orders that reach the same behaviour', () => {
    const parallel: PlacementStep[] = [
      { id: 'a', effect: 'alpha', requires: [] },
      { id: 'b', effect: 'beta', requires: [] },
      { id: 'join', effect: 'joined', requires: ['alpha', 'beta'] },
    ];
    const first = evaluatePlacement({
      steps: parallel,
      order: ['a', 'b', 'join'],
      goalSignature: 'alpha>beta>joined',
    });
    const second = evaluatePlacement({
      steps: parallel,
      order: ['b', 'a', 'join'],
      goalSignature: 'beta>alpha>joined',
    });
    // Same behaviour, different symbolic arrangement — the POL lesson.
    expect(first.solved).toBe(true);
    expect(second.solved).toBe(true);
    expect(first.signature).not.toBe(second.signature);
  });

  it('moveStep relocates an item without mutating the input', () => {
    const original = ['a', 'b', 'c'];
    const moved = moveStep(original, 0, 2);
    expect(moved).toEqual(['b', 'c', 'a']);
    expect(original).toEqual(['a', 'b', 'c']);
  });

  it('moveStep ignores out-of-range indices instead of corrupting the order', () => {
    const original = ['a', 'b'];
    expect(moveStep(original, 5, 0)).toEqual(['a', 'b']);
  });
});