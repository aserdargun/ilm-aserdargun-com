import { describe, expect, it } from 'vitest';
import { APPLICATIONS } from '../src/catalog/applications';
import { REGIONS, REGION_ORDER } from '../src/catalog/regions';
import { ALL_STAGE_IDS, STAGES, representedCodes } from '../src/game/stages';
import {
  emptyProgression,
  isFinaleUnlocked,
  isRegionRestored,
  isRegionUnlocked,
  isStageComplete,
  regionProgress,
  toolsForProgress,
  type ProgressionState,
} from '../src/game/progression';

const REQUIRED_CODES = [
  'AIA', 'POL',
  'GPU', 'GEX', 'LLM', 'TFL',
  'HNS', 'ARL', 'DPL', 'CUL', 'AOS', 'AGR', 'CTX', 'MEM', 'SEC', 'EVL',
  'USL', 'ADP', 'LCL', 'CLD', 'DCL',
  'SWI', 'ANT', 'BEE',
  'VIS', 'CVL', 'WFM', 'WML',
  'ITL', 'PDT', 'DTR', 'ENG', 'HEX',
];

const BANNED_CODES = ['INF', 'NXT', 'STK'];

describe('catalog coverage', () => {
  it('contains exactly the 33 required applications', () => {
    expect(APPLICATIONS).toHaveLength(33);
    expect(APPLICATIONS.map((a) => a.code).sort()).toEqual([...REQUIRED_CODES].sort());
  });

  it('excludes INF, NXT and STK everywhere', () => {
    const codes = APPLICATIONS.map((a) => a.code);
    for (const banned of BANNED_CODES) {
      const lower = banned.toLowerCase();
      expect(codes, `${banned} present in catalog`).not.toContain(banned);
      // Guard against a banned code hiding in a slug or a source URL.
      for (const entry of APPLICATIONS) {
        expect(entry.slug, `${entry.code} slug`).not.toBe(lower);
        expect(entry.sourceUrl.toLowerCase(), `${entry.code} url`).not.toContain(lower);
        expect(entry.code, `${entry.code} references ${banned}`).not.toBe(banned);
      }
    }
  });

  it('gives every application a verified aserdargun source URL', () => {
    for (const entry of APPLICATIONS) {
      expect(entry.sourceUrl).toMatch(/^https:\/\/[a-z]{3}\.aserdargun\.com\/$/);
      expect(entry.sourceUrl).toBe(`https://${entry.slug}.aserdargun.com/`);
    }
  });

  it('writes every player-facing field in both languages', () => {
    for (const entry of APPLICATIONS) {
      for (const field of ['name', 'shortConcept', 'description', 'mechanic', 'discovery', 'completionCondition'] as const) {
        const value = entry[field];
        expect(value.tr.length, `${entry.code}.${field}.tr`).toBeGreaterThan(0);
        expect(value.en.length, `${entry.code}.${field}.en`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every quest id pointing at a real stage', () => {
    for (const entry of APPLICATIONS) {
      expect(entry.questIds.length, entry.code).toBeGreaterThan(0);
      for (const questId of entry.questIds) {
        expect(ALL_STAGE_IDS, `${entry.code} -> ${questId}`).toContain(questId);
      }
    }
  });

  it('agrees with the stage table about what each stage represents', () => {
    for (const entry of APPLICATIONS) {
      const stage = STAGES.find((s) => s.id === entry.stageId);
      expect(stage, `${entry.code} -> ${entry.stageId}`).toBeDefined();
      expect(stage!.appCodes, `${entry.code} in ${entry.stageId}`).toContain(entry.code);
      expect(stage!.system, `${entry.code} system`).toBe(entry.system);
      expect(stage!.region, `${entry.code} region`).toBe(entry.region);
    }
  });

  it('gives every application an observable effect through a stage', () => {
    const covered = representedCodes();
    expect(covered).toHaveLength(33);
    for (const code of REQUIRED_CODES) {
      expect(covered, `${code} has no stage`).toContain(code);
    }
  });

  it('assigns every stage to a known region', () => {
    const regionIds = new Set(REGIONS.map((r) => r.id));
    for (const stage of STAGES) {
      expect(regionIds.has(stage.region), stage.id).toBe(true);
    }
  });
});

describe('progression rules', () => {
  it('keeps every region locked until the opening puzzle is done', () => {
    const fresh = emptyProgression();
    expect(isRegionUnlocked(fresh, 'cartographers-terrace')).toBe(false);
    expect(
      isRegionUnlocked({ ...fresh, completedStages: ['r0-opening'] }, 'cartographers-terrace'),
    ).toBe(true);
  });

  it('unlocks regions strictly in order', () => {
    const state: ProgressionState = {
      ...emptyProgression(),
      completedStages: ['r0-opening'],
      completedRegions: ['cartographers-terrace'],
    };
    expect(isRegionUnlocked(state, 'flow-foundry')).toBe(true);
    expect(isRegionUnlocked(state, 'valley-living-machines')).toBe(false);
  });

  it('marks a region restored only when all of its stages are complete', () => {
    const partial: ProgressionState = {
      ...emptyProgression(),
      completedStages: ['r0-opening', 'r1-scout-match'],
    };
    expect(isRegionRestored(partial, 'cartographers-terrace', ALL_STAGE_IDS)).toBe(false);

    const done: ProgressionState = {
      ...emptyProgression(),
      completedStages: ['r0-opening', 'r1-scout-match', 'r1-equivalent-bridges'],
    };
    expect(isRegionRestored(done, 'cartographers-terrace', ALL_STAGE_IDS)).toBe(true);
  });

  it('reports per-region progress honestly', () => {
    const state: ProgressionState = {
      ...emptyProgression(),
      completedStages: ['r0-opening', 'r1-scout-match'],
    };
    const progress = regionProgress(state, 'cartographers-terrace', ALL_STAGE_IDS);
    expect(progress).toEqual({ done: 1, total: 2 });
  });

  it('never unlocks the finale while anything is outstanding', () => {
    const allStages = ALL_STAGE_IDS.filter((id) => id !== 'finale-synthesis-tree');
    const almost: ProgressionState = {
      ...emptyProgression(),
      completedStages: allStages.filter((id) => id !== 'cross-x3'),
      completedRegions: [...REGION_ORDER],
    };
    expect(isFinaleUnlocked(almost)).toBe(false);

    const complete: ProgressionState = {
      ...emptyProgression(),
      completedStages: allStages,
      completedRegions: [...REGION_ORDER],
    };
    expect(isFinaleUnlocked(complete)).toBe(true);
  });

  it('reaches every region through valid progression alone', () => {
    // Simulate a straight playthrough: solving stages in table order must
    // unlock each region in turn with no dead ends.
    const state = emptyProgression();
    for (const id of ALL_STAGE_IDS) {
      if (id === 'finale-synthesis-tree') continue;
      const stage = STAGES.find((s) => s.id === id)!;
      const reachable =
        stage.region === 'hub' ||
        stage.id.startsWith('cross-') ||
        isRegionUnlocked(state, stage.region);
      expect(reachable, `${id} unreachable`).toBe(true);
      state.completedStages.push(id);
      if (!state.completedRegions.includes(stage.region) && stage.region !== 'hub') {
        if (isRegionRestored(state, stage.region, ALL_STAGE_IDS)) {
          state.completedRegions.push(stage.region);
        }
      }
    }
    expect(state.completedRegions).toHaveLength(7);
    expect(isFinaleUnlocked(state)).toBe(true);
  });

  it('grants the staff modes in progression order', () => {
    expect(toolsForProgress([])).toEqual(['connect']);
    expect(toolsForProgress(['r0-opening', 'r1-equivalent-bridges'])).toContain('reveal');
    expect(toolsForProgress(['r0-opening', 'r1-equivalent-bridges', 'r2-loom-distribution'])).toContain(
      'preview',
    );
    expect(
      toolsForProgress(['r0-opening', 'r1-equivalent-bridges', 'r2-loom-distribution', 'r3-junction-choice']),
    ).toContain('decide');
  });

  it('reports a completed stage as complete', () => {
    const state: ProgressionState = {
      ...emptyProgression(),
      completedStages: ['r0-opening'],
    };
    expect(isStageComplete(state, 'r0-opening')).toBe(true);
    expect(isStageComplete(state, 'r1-scout-match')).toBe(false);
  });
});