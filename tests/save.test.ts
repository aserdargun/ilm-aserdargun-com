import { beforeEach, describe, expect, it } from 'vitest';
import {
  SAVE_VERSION,
  clearSave,
  createSave,
  isValidSave,
  loadSave,
  reconcile,
  writeSave,
} from '../src/game/save';
import { ALL_STAGE_IDS } from '../src/game/stages';

/** Minimal in-memory localStorage so the save layer can be exercised in node. */
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

describe('save schema', () => {
  it('accepts a freshly created save', () => {
    expect(isValidSave(createSave('tr'))).toBe(true);
  });

  it('rejects non-objects, null and primitives', () => {
    expect(isValidSave(null)).toBe(false);
    expect(isValidSave('nope')).toBe(false);
    expect(isValidSave(42)).toBe(false);
    expect(isValidSave(undefined)).toBe(false);
  });

  it('rejects a save with an unknown region', () => {
    const save = createSave();
    (save.player as { regionId: string }).regionId = 'atlantis';
    expect(isValidSave(save)).toBe(false);
  });

  it('rejects non-finite player coordinates', () => {
    const save = createSave();
    save.player.x = Number.NaN;
    expect(isValidSave(save)).toBe(false);
  });

  it('rejects a save whose stage list is not strings', () => {
    const save = createSave();
    (save.progression as { completedStages: unknown }).completedStages = [1, 2, 3];
    expect(isValidSave(save)).toBe(false);
  });

  it('rejects a save with an unknown tool mode', () => {
    const save = createSave();
    (save.progression as { unlockedTools: unknown }).unlockedTools = ['connect', 'warp'];
    expect(isValidSave(save)).toBe(false);
  });
});

describe('save round trip', () => {
  beforeEach(() => {
    clearSave();
  });

  it('reports empty when nothing has been written', () => {
    expect(loadSave().status).toBe('empty');
  });

  it('writes and reads back the same journey', () => {
    const save = createSave('en');
    save.progression.completedStages = ['r0-opening'];
    save.progression.unlockedTools = ['connect', 'reveal'];
    save.discoveredApps = ['aia'];
    save.player = { x: 12.5, y: 0, z: -4, regionId: 'cartographers-terrace' };
    expect(writeSave(save)).toBe(true);

    const outcome = loadSave();
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.save.progression.completedStages).toEqual(['r0-opening']);
    expect(outcome.save.progression.unlockedTools).toEqual(['connect', 'reveal']);
    expect(outcome.save.player.regionId).toBe('cartographers-terrace');
    expect(outcome.save.lang).toBe('en');
  });

  it('reports corrupt rather than throwing on unparsable JSON', () => {
    localStorage.setItem(`ilm.save.v${SAVE_VERSION}`, '{ this is not json');
    expect(loadSave().status).toBe('corrupt');
  });

  it('reports corrupt on structurally invalid JSON', () => {
    localStorage.setItem(`ilm.save.v${SAVE_VERSION}`, JSON.stringify({ version: 99 }));
    expect(loadSave().status).toBe('corrupt');
  });

  it('reports a version mismatch instead of loading it', () => {
    const save = createSave();
    save.version = SAVE_VERSION - 1;
    writeSave(save);
    expect(loadSave().status).toBe('version');
  });

  it('reports a version when only a legacy save exists', () => {
    localStorage.setItem('ilm.save.v1', JSON.stringify({ version: 1, player: {} }));
    const outcome = loadSave();
    expect(outcome.status).toBe('version');
    if (outcome.status === 'version') expect(outcome.found).toBe(1);
  });
});

describe('reconciliation', () => {
  it('drops stage ids that no longer exist', () => {
    const save = createSave();
    save.progression.completedStages = ['r0-opening', 'a-stage-that-was-removed'];
    const result = reconcile(save, ALL_STAGE_IDS);
    expect(result.progression.completedStages).toEqual(['r0-opening']);
  });

  it('recomputes restored regions instead of trusting the stored list', () => {
    const save = createSave();
    // Claims the valley is restored without completing any of its stages.
    save.progression.completedRegions = ['valley-living-machines'];
    save.progression.completedStages = ['r0-opening'];
    const result = reconcile(save, ALL_STAGE_IDS);
    expect(result.progression.completedRegions).toEqual([]);
  });

  it('recomputes a genuinely restored region', () => {
    const save = createSave();
    save.progression.completedStages = ['r0-opening', 'r1-scout-match', 'r1-equivalent-bridges'];
    save.progression.completedRegions = [];
    const result = reconcile(save, ALL_STAGE_IDS);
    expect(result.progression.completedRegions).toEqual(['cartographers-terrace']);
  });

  it('clears an active stage that no longer exists', () => {
    const save = createSave();
    save.activeStageId = 'ghost-stage';
    expect(reconcile(save, ALL_STAGE_IDS).activeStageId).toBeNull();
  });

  it('keeps a valid active stage', () => {
    const save = createSave();
    save.activeStageId = 'r1-scout-match';
    expect(reconcile(save, ALL_STAGE_IDS).activeStageId).toBe('r1-scout-match');
  });
});

describe('language independence', () => {
  it('stores the language alongside progress without coupling them', () => {
    const save = createSave('tr');
    save.progression.completedStages = ['r0-opening'];
    writeSave(save);

    const first = loadSave();
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') return;

    // Changing the language must not disturb progression or the active stage.
    first.save.lang = 'en';
    first.save.activeStageId = 'r1-scout-match';
    writeSave(first.save);

    const second = loadSave();
    expect(second.status).toBe('ok');
    if (second.status !== 'ok') return;
    expect(second.save.lang).toBe('en');
    expect(second.save.progression.completedStages).toEqual(['r0-opening']);
    expect(second.save.activeStageId).toBe('r1-scout-match');
  });

  it('survives a corrupt save by clearing it', () => {
    localStorage.setItem(`ilm.save.v${SAVE_VERSION}`, 'garbage');
    expect(loadSave().status).toBe('corrupt');
    clearSave();
    expect(loadSave().status).toBe('empty');
  });
});