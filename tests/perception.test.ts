import { describe, expect, it } from 'vitest';
import {
  modelUncertainty,
  perceive,
  type Scene,
  type SceneCell,
} from '../src/systems/perception';
import { narrowCandidates } from '../src/systems/prediction';

function cell(p: Partial<SceneCell>): SceneCell {
  return {
    target: false,
    occluder: false,
    lit: 1,
    depth: 1,
    moved: false,
    ...p,
  };
}

function scene(cells: SceneCell[]): Scene {
  return { width: 1, height: cells.length, cells };
}

describe('perception system', () => {
  const params = { budget: 100, reliableLight: 0.4 };

  it('needs two observations before the motion lens is usable', () => {
    const s = scene([cell({ target: true, moved: true })]);
    const first = perceive(s, 'motion', params, false);
    expect(first.solved).toBe(false);
    expect(first.failures).toContainEqual({ code: 'needs-baseline' });
    expect(first.unseen).toHaveLength(1);

    const second = perceive(s, 'motion', params, true);
    expect(second.correct).toEqual([0]);
    expect(second.solved).toBe(true);
  });

  it('refuses to read depth where light is insufficient', () => {
    const dark = cell({ target: true, lit: 0.1, depth: 1 });
    const report = perceive(scene([dark]), 'depth', params);
    expect(report.uncertain).toEqual([0]);
    expect(report.wrong).toEqual([0]);
    expect(report.failures).toContainEqual({ code: 'low-light' });
  });

  it('reports cells an occluder hides from the edge lens', () => {
    const behind = cell({ target: true, occluder: true });
    const occluder = cell({ target: true, occluder: true });
    // Row 0 sits behind row 1's solid form.
    const s: Scene = { width: 1, height: 2, cells: [behind, occluder] };
    const report = perceive(s, 'edge', params);
    expect(report.uncertain).toEqual([0]);
  });

  it('respects the resolution budget and reports the remainder unseen', () => {
    const cells = Array.from({ length: 6 }, () => cell({ target: false }));
    const report = perceive(scene(cells), 'edge', { ...params, budget: 2 });
    expect(report.unseen).toHaveLength(4);
    expect(report.solved).toBe(false);
  });

  it('is not solved while any cell is misreported', () => {
    // A depth lens in the dark confidently reports the wrong answer.
    const cells = [cell({ target: true, lit: 0.05, depth: 0 }), cell({ target: true, lit: 1, depth: 1 })];
    const report = perceive(scene(cells), 'depth', params);
    expect(report.wrong.length).toBeGreaterThan(0);
    expect(report.solved).toBe(false);
  });

  it('weights assumed cells more heavily than observed ones', () => {
    const truth = [true, true];
    const wrongAboutBoth = modelUncertainty({ observed: [], assumed: [0, 1] }, truth, [false, false]);
    const rightAboutBoth = modelUncertainty({ observed: [], assumed: [0, 1] }, truth, [true, true]);
    expect(wrongAboutBoth).toBe(1);
    expect(rightAboutBoth).toBe(0);
  });

  it('narrows fault candidates as symptoms accumulate', () => {
    const all = ['seal-wear', 'cavitation', 'sensor-drift', 'blocked-inlet', 'vane-shear'] as const;
    // No evidence narrows nothing; symptoms overlap, so it takes a combination.
    expect(narrowCandidates([...all], []).length).toBe(5);
    expect(narrowCandidates([...all], [3])).toEqual([
      'sensor-drift',
      'blocked-inlet',
    ]);
    // Reporting symptom 4 eliminates every fault that cannot explain it.
    expect(narrowCandidates([...all], [3, 4])).toEqual(['blocked-inlet']);
  });
});