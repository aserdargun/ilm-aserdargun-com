import { beforeEach, describe, expect, it } from 'vitest';
import { solveStage } from './helpers/solver';
import { STAGES, STAGE_BY_ID } from '../src/game/stages';
import {
  closeStage,
  commitStage,
  enterStage,
  getState,
  isStageReachable,
  setScreen,
  startNewGame,
  updatePlayerPosition,
} from '../src/game/store';
import {
  CROSS_STAGE_IDS,
  FINALE_STAGE_ID,
  isFinaleUnlocked,
  isRegionUnlocked,
  isRegionRestored,
  regionProgress,
} from '../src/game/progression';
import { ALL_STAGE_IDS } from '../src/game/stages';
import { REGION_ORDER } from '../src/catalog/regions';
import { APPLICATIONS } from '../src/catalog/applications';

/**
 * A complete playthrough.
 *
 * This drives the real store — the same actions the interface calls — through
 * every stage in world order, and asserts that the journey is actually
 * completable: regions unlock in sequence, each region restores when its stages
 * are done, the cross-region puzzles gate on real progress, and the finale
 * unlocks only once everything is genuinely finished.
 *
 * It is the check that answers "can this game be finished", which per-stage
 * solvability cannot.
 */

function installStorage(): void {
  const store = new Map<string, string>();
  const g = globalThis as unknown as { localStorage?: Storage; window?: unknown };
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
  g.window = g;
}

installStorage();

/** Solve a stage the way a player would: open it, apply, commit. */
function playStage(stageId: string): boolean {
  const stage = STAGE_BY_ID[stageId];
  enterStage(stageId);
  if (getState().activeStageId !== stageId) return false;
  getState().stageStates[stageId] = solveStage(stage);
  // enterStage stored a fresh state; overwrite it through the public path.
  const solved = commitStage(stageId);
  closeStage();
  return solved;
}

describe('a complete playthrough', () => {
  beforeEach(() => {
    startNewGame();
  });

  it('can be finished from a new game to the ending', () => {
    startNewGame();
    expect(getState().progression.completedStages).toEqual([]);

    // The hub and the seven regions, in the order the world presents them.
    const ordered = [
      'r0-opening',
      ...STAGES.filter((s) => /^r[1-7]-/.test(s.id)).map((s) => s.id),
      ...CROSS_STAGE_IDS,
      FINALE_STAGE_ID,
    ];

    const refusals: string[] = [];
    for (const stageId of ordered) {
      if (!playStage(stageId)) refusals.push(stageId);
    }

    expect(refusals, 'stages that could not be completed').toEqual([]);

    const state = getState();
    expect(state.progression.completedStages).toHaveLength(ALL_STAGE_IDS.length);
    expect(state.progression.completedRegions).toEqual(REGION_ORDER);
    expect(state.endingSeen).toBe(true);
    expect(state.screen).toBe('ending');
  });

  it('unlocks regions one at a time, in order', () => {
    startNewGame();

    // Nothing but the hub is reachable before the opening is solved.
    expect(isRegionUnlocked(getState().progression, REGION_ORDER[0])).toBe(false);

    expect(playStage('r0-opening')).toBe(true);
    expect(isRegionUnlocked(getState().progression, REGION_ORDER[0])).toBe(true);
    expect(isRegionUnlocked(getState().progression, REGION_ORDER[1])).toBe(false);

    // Complete region I fully, which then opens region II and nothing beyond.
    playStage('r1-scout-match');
    playStage('r1-equivalent-bridges');
    expect(isRegionUnlocked(getState().progression, REGION_ORDER[1])).toBe(true);
    expect(isRegionUnlocked(getState().progression, REGION_ORDER[2])).toBe(false);
  });

  it('restores a region only once every one of its stages is done', () => {
    startNewGame();
    playStage('r0-opening');
    playStage('r1-scout-match');

    const partial = regionProgress(getState().progression, 'cartographers-terrace', ALL_STAGE_IDS);
    expect(partial).toEqual({ done: 1, total: 2 });
    expect(getState().progression.completedRegions).not.toContain('cartographers-terrace');

    playStage('r1-equivalent-bridges');
    expect(isRegionRestored(getState().progression, 'cartographers-terrace', ALL_STAGE_IDS)).toBe(
      true,
    );
    expect(getState().progression.completedRegions).toContain('cartographers-terrace');
  });

  it('gates the cross-region puzzles on real regional progress', () => {
    startNewGame();
    expect(isStageReachable('cross-x1')).toBe(false);

    playStage('r0-opening');
    for (const id of orderedRegionStages()) playStage(id);
    expect(isStageReachable('cross-x1')).toBe(true);
    expect(isStageReachable('cross-x3')).toBe(true);
  });

  it('refuses the finale until every region and cross puzzle is genuinely done', () => {
    startNewGame();
    expect(isFinaleUnlocked(getState().progression)).toBe(false);

    playStage('r0-opening');
    for (const id of orderedRegionStages()) playStage(id);
    // Every region restored, but no cross-region puzzle yet.
    expect(isFinaleUnlocked(getState().progression)).toBe(false);
    expect(isStageReachable(FINALE_STAGE_ID)).toBe(false);

    for (const id of CROSS_STAGE_IDS) playStage(id);
    expect(isFinaleUnlocked(getState().progression)).toBe(true);
    expect(isStageReachable(FINALE_STAGE_ID)).toBe(true);
  });

  it('discovers every one of the 33 applications across the playthrough', () => {
    startNewGame();
    for (const id of [
      'r0-opening',
      ...orderedRegionStages(),
      ...CROSS_STAGE_IDS,
      FINALE_STAGE_ID,
    ]) {
      playStage(id);
    }
    const discovered = new Set(getState().progression.discoveredApps);
    const expected = new Set(APPLICATIONS.map((a) => a.slug));
    expect([...expected].filter((s) => !discovered.has(s))).toEqual([]);
    expect(discovered.size).toBe(33);
  });

  it('resists being replayed out of order', () => {
    startNewGame();
    // Reaching into a later region before earning it must not register.
    expect(playStage('r4-module-fit')).toBe(false);
    expect(getState().progression.completedStages).toEqual([]);
  });

  it('reloads a finished journey from the save', () => {
    startNewGame();
    for (const id of ['r0-opening', ...orderedRegionStages()]) playStage(id);

    const before = getState().progression.completedStages.length;
    const stored = localStorage.getItem('ilm.save.v3');
    expect(stored).toBeTruthy();

    // A fresh load must see the same progress.
    const parsed = JSON.parse(stored as string) as {
      progression: { completedStages: string[] };
    };
    expect(parsed.progression.completedStages.length).toBe(before);
  });
});

/** Every stage belonging to one of the seven regions, in world order. */
function orderedRegionStages(): string[] {
  return STAGES.filter((s) => /^r[1-7]-/.test(s.id)).map((s) => s.id);
}

void setScreen;
void updatePlayerPosition;