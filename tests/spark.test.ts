import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SPARK, lineFor, regionRestoredLine, variantCount, type SparkMoment } from '../src/game/spark';
import { REGIONS } from '../src/catalog/regions';
import { LANGS } from '../src/types/catalog';
import {
  advanceSpark,
  commitStage,
  enterStage,
  getState,
  raiseHint,
  resetStage,
  startNewGame,
  updatePlayerPosition,
  __finishSparkForTests,
  __resetSparkVisitsForTests,
} from '../src/game/store';
import { STAGE_BY_ID } from '../src/game/stages';
import { solveStage } from './helpers/solver';

/**
 * Spark is the only character in the game, and before this module existed seven
 * of his nine lines were written in both languages and called from nowhere.
 *
 * These tests exist so that cannot happen again silently. Three of them are the
 * ones that would have caught it:
 *
 *  - every moment is reachable from a real call site, read out of the store's
 *    source rather than a hand-maintained list;
 *  - every line exists in both languages and no line is empty or truncated;
 *  - a repeated moment says something different, because a companion who
 *    repeats one sentence forever is worse than one who says nothing.
 */

const MOMENTS = Object.keys(SPARK) as SparkMoment[];

const storeSource = readFileSync('src/game/store.ts', 'utf8');

function installStorage(): void {
  const backing = new Map<string, string>();
  const g = globalThis as unknown as { localStorage?: Storage; window?: unknown };
  g.localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, v),
    removeItem: (k: string) => void backing.delete(k),
    clear: () => backing.clear(),
    key: (i: number) => [...backing.keys()][i] ?? null,
    get length() {
      return backing.size;
    },
  } as Storage;
  g.window = g;
}

installStorage();

describe('Spark has something to say in every moment', () => {
  it('gives every moment at least one line', () => {
    for (const moment of MOMENTS) {
      expect(variantCount(moment), moment).toBeGreaterThan(0);
    }
  });

  it('writes every line in both languages', () => {
    for (const moment of MOMENTS) {
      for (const line of SPARK[moment]) {
        for (const lang of LANGS) {
          expect(line[lang].trim(), `${moment}.${lang}`).not.toBe('');
        }
      }
    }
  });

  it('does not leave Turkish identical to English', () => {
    // The whole point of the character is that he sounds like a person in the
    // player's language. A copied line is the failure mode the existing lesson
    // tests already guard against.
    const copied = MOMENTS.filter((moment) =>
      SPARK[moment].some((line) => line.tr === line.en),
    );
    expect(copied).toEqual([]);
  });

  it('never hands the player the answer', () => {
    // Spark may say what he notices, never what to do. A line naming a stage
    // id or a specific slot is a puzzle solution leaking into the dialogue.
    const ids = Object.keys(STAGE_BY_ID);
    for (const moment of MOMENTS) {
      for (const line of SPARK[moment]) {
        for (const lang of LANGS) {
          const text = line[lang];
          for (const id of ids) {
            expect(text, `${moment}.${lang} leaks ${id}`).not.toContain(id);
          }
          expect(text, `${moment}.${lang}`).not.toMatch(/\barm-\d|\bwarp-[a-d]|\bhall-[ab]/);
        }
      }
    }
  });

  it('gives the moments that repeat more than one line', () => {
    // These fire more than once per playthrough, so one sentence each would
    // become a stutter rather than a voice.
    for (const moment of ['solved', 'reset', 'stageOpen', 'wrongAttempt'] as SparkMoment[]) {
      expect(variantCount(moment), moment).toBeGreaterThan(1);
    }
  });

  it('says something new each time a moment repeats', () => {
    for (const moment of MOMENTS) {
      const count = variantCount(moment);
      if (count < 2) continue;
      const seen = new Set<string>();
      for (let visit = 0; visit < count; visit += 1) {
        seen.add(lineFor(moment, 'tr', visit) ?? '');
      }
      expect(seen.size, `${moment} repeats within one rotation`).toBe(count);
    }
  });

  it('wraps the rotation instead of running off the end', () => {
    const first = lineFor('wrongAttempt', 'en', 0);
    const wrapped = lineFor('wrongAttempt', 'en', variantCount('wrongAttempt'));
    expect(wrapped).toBe(first);
  });

  it('survives a negative visit counter', () => {
    expect(lineFor('solved', 'tr', -1)).toBe(lineFor('solved', 'tr', variantCount('solved') - 1));
  });

  it('has a distinct restoration line for every region', () => {
    const lines = REGIONS.map((region) => regionRestoredLine(region.id, 'tr'));
    expect(new Set(lines).size).toBe(REGIONS.length);
    for (const region of REGIONS) {
      for (const lang of LANGS) {
        expect(regionRestoredLine(region.id, lang).trim(), region.id).not.toBe('');
      }
    }
  });
});

describe('Spark is actually reachable from the game', () => {
  beforeEach(() => {
    startNewGame();
    __resetSparkVisitsForTests();
  });

  it('speaks on the first frame of a new journey', () => {
    startNewGame();
    expect(getState().sparkLine?.text).toBe(lineFor('intro', 'tr', 0));
  });

  it('speaks when a region is restored for the first time', () => {
    startNewGame();
    enterStage('r1-scout-match');
    getState().stageStates['r1-scout-match'] = solveStage(STAGE_BY_ID['r1-scout-match']);
    expect(commitStage('r1-scout-match')).toBe(true);
    playStage('r1-equivalent-bridges');

    // Region I is complete now, so Spark must have said something about it.
    const spoken = drainSpark();
    expect(spoken.join(' ')).toContain(regionRestoredLine('cartographers-terrace', 'tr'));
  });

  it('says a region is restored once, not on every later stage', () => {
    // The regression that matters: region I is complete after two stages, so a
    // third commit *inside that same region* must stay silent. The old code
    // recomputed "restored" from the full completed list and announced the
    // region again every single time any of its stages was replayed.
    startNewGame();
    playStage('r1-scout-match');
    playStage('r1-equivalent-bridges');

    const afterRestore = drainSpark().join(' ');
    expect(afterRestore).toContain(regionRestoredLine('cartographers-terrace', 'tr'));

    // Replay a stage in the already-restored region.
    playStage('r1-scout-match');
    expect(drainSpark().join(' ')).not.toContain(regionRestoredLine('cartographers-terrace', 'tr'));
  });

  it('does not claim a region is restored while it is still missing stages', () => {
    startNewGame();
    playStage('r1-scout-match');
    expect(drainSpark().join(' ')).not.toContain(regionRestoredLine('cartographers-terrace', 'tr'));
  });

  it('speaks when the player runs out of hints', () => {
    startNewGame();
    enterStage('r0-opening');
    raiseHint('r0-opening');
    raiseHint('r0-opening');
    expect(drainSpark().join(' ')).not.toContain(lineFor('outOfHints', 'tr', 0));
    raiseHint('r0-opening');
    expect(drainSpark().join(' ')).toContain(lineFor('outOfHints', 'tr', 0));
  });

  it('speaks when a move is rejected', () => {
    startNewGame();
    enterStage('r0-opening');
    // Nothing wired yet, so the commit must fail and Spark must answer.
    expect(commitStage('r0-opening')).toBe(false);
    expect(drainSpark().join(' ')).toContain(lineFor('wrongAttempt', 'tr', 0));
  });

  it('speaks when a puzzle is reset', () => {
    startNewGame();
    enterStage('r0-opening');
    resetStage('r0-opening');
    expect(drainSpark().join(' ')).toContain(lineFor('reset', 'tr', 0));
  });

  it('greets a region once, not on every crossing', () => {
    startNewGame();
    updatePlayerPosition(0, 0, 0, 'cartographers-terrace');
    const first = drainSpark().join(' ');
    expect(first).toContain(lineFor('regionArrival', 'tr', 0));

    updatePlayerPosition(0, 0, 40, 'cartographers-terrace');
    updatePlayerPosition(0, 0, 0, 'flow-foundry');
    const second = drainSpark().join(' ');
    // A second region is new, so it gets greeted; the first one does not repeat.
    expect(second).toContain(lineFor('regionArrival', 'tr', 1));
    expect(second).not.toContain(lineFor('regionArrival', 'tr', 0));
  });

  it('keeps every line queued rather than dropping the ones behind it', () => {
    startNewGame();
    enterStage('r0-opening');
    resetStage('r0-opening');
    expect(getState().sparkQueue.length).toBeGreaterThan(0);

    const spoken = drainSpark();
    expect(spoken).toContain(lineFor('reset', 'tr', 0));
    expect(new Set(spoken).size).toBe(spoken.length);
  });

  it('says the stage line before its general remark', () => {
    startNewGame();
    enterStage('r0-opening');
    expect(getState().sparkLine?.text).toBe(STAGE_BY_ID['r0-opening'].sparkLine.tr);

    __finishSparkForTests();
    advanceSpark();
    expect(getState().sparkLine?.text).toBe(lineFor('stageOpen', 'tr', 0));
  });

  it('has a call site for every moment it defines', () => {
    // The regression this whole module exists to prevent: a written line that
    // nothing ever speaks.
    const orphans = MOMENTS.filter((moment) => !storeSource.includes(`'${moment}'`));
    expect(orphans).toEqual([]);
  });
});

/** Collects everything Spark says, forcing each queued line to the front. */
function drainSpark(): string[] {
  const spoken: string[] = [];
  for (let i = 0; i < 24; i += 1) {
    const line = getState().sparkLine;
    if (line && !spoken.includes(line.text)) spoken.push(line.text);
    // Jump past the current line's read time.
    __finishSparkForTests();
    advanceSpark();
  }
  return spoken;
}

/** Solve a stage the way the interface does. */
function playStage(stageId: string): boolean {
  enterStage(stageId);
  getState().stageStates[stageId] = solveStage(STAGE_BY_ID[stageId]);
  const solved = commitStage(stageId);
  return solved;
}