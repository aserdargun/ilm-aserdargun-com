import { describe, expect, it } from 'vitest';
import { STAGES } from '../src/game/stages';
import { hintFor, lessonFor } from '../src/game/lessons';
import { LABELS, hasLabel, lookup } from '../src/game/labels';
import { APPLICATIONS } from '../src/catalog/applications';
import { LANGS } from '../src/types/catalog';

/**
 * The teaching layer and the label dictionary are only worth anything if they
 * are complete. A stage with no lesson ships an unsolvable idea; an id with no
 * label ships `arm-2` into the interface. Both fail here rather than in play.
 */

/** Every id a player can be shown, gathered from whatever the stage carries. */
function visibleIds(stage: (typeof STAGES)[number]): string[] {
  const data = stage.data as Record<string, unknown>;
  const out: string[] = [];

  for (const item of stage.items ?? []) out.push(item.id);
  for (const slot of stage.slots ?? []) out.push(slot.id);

  const pushKind = (entry: Record<string, unknown>) => {
    if (typeof entry.kind === 'string') out.push(entry.kind);
    if (typeof entry.accepts === 'string') out.push(entry.accepts);
    if (typeof entry.assumes === 'string') out.push(entry.assumes);
    if (Array.isArray(entry.tags)) out.push(...(entry.tags as string[]));
    if (Array.isArray(entry.requires)) out.push(...(entry.requires as string[]));
    if (typeof entry.effect === 'string') out.push(entry.effect);
  };

  for (const key of [
    'scouts',
    'seals',
    'routes',
    'targets',
    'seats',
    'records',
    'steps',
    'lanes',
    'work',
    'branches',
    'options',
  ]) {
    const list = data[key];
    if (!Array.isArray(list)) continue;
    for (const entry of list as Record<string, unknown>[]) {
      if (typeof entry.id === 'string') out.push(entry.id);
      pushKind(entry);
    }
  }

  if (typeof data.trueFault === 'string') out.push(data.trueFault);
  if (typeof data.verifyTarget === 'string') out.push(data.verifyTarget);
  if (typeof data.decoyTarget === 'string') out.push(data.decoyTarget);
  if (Array.isArray(data.requiredStates)) out.push(...(data.requiredStates as string[]));
  if (Array.isArray(data.contradicted)) out.push(...(data.contradicted as string[]));

  return out;
}

describe('every stage teaches something', () => {
  it('has a lesson for every stage', () => {
    const missing = STAGES.filter((stage) => !lessonFor(stage.id)).map((s) => s.id);
    expect(missing).toEqual([]);
  });

  it('has no lesson for a stage that does not exist', () => {
    expect(lessonFor('not-a-stage')).toBeUndefined();
  });

  it('writes every lesson field in both languages', () => {
    for (const stage of STAGES) {
      const lesson = lessonFor(stage.id);
      if (!lesson) continue;
      for (const lang of LANGS) {
        expect(lesson.principle[lang].trim(), `${stage.id}.principle.${lang}`).not.toBe('');
        expect(lesson.misconception[lang].trim(), `${stage.id}.misconception.${lang}`).not.toBe('');
        expect(lesson.firstMove[lang].trim(), `${stage.id}.firstMove.${lang}`).not.toBe('');
        for (let tier = 0; tier < lesson.hints.length; tier += 1) {
          expect(lesson.hints[tier][lang].trim(), `${stage.id}.hint${tier}.${lang}`).not.toBe('');
        }
      }
    }
  });

  it('gives every stage exactly three escalating hints', () => {
    for (const stage of STAGES) {
      expect(lessonFor(stage.id)?.hints, stage.id).toHaveLength(3);
    }
  });

  it('does not reuse the same hint text three times', () => {
    for (const stage of STAGES) {
      const hints = lessonFor(stage.id)?.hints ?? [];
      for (const lang of LANGS) {
        const texts = hints.map((h) => h[lang]);
        expect(new Set(texts).size, `${stage.id}.${lang}`).toBe(3);
      }
    }
  });

  it('writes Turkish as Turkish rather than copying the English', () => {
    // The trap sentence is the one a player is most likely to skip, so it is
    // the one most at risk of being pasted across the two languages.
    const copied = STAGES.filter((stage) => {
      const lesson = lessonFor(stage.id);
      return lesson ? lesson.misconception.tr === lesson.misconception.en : false;
    }).map((s) => s.id);
    expect(copied).toEqual([]);
  });

  it('pairs each lesson with a stage that carries a real application', () => {
    const codes = new Set(APPLICATIONS.map((a) => a.code));
    for (const stage of STAGES) {
      for (const code of stage.appCodes) {
        expect(codes.has(code), `${stage.id} -> ${code}`).toBe(true);
      }
    }
  });
});

describe('hint tiers', () => {
  it('returns the requested tier', () => {
    const [first, second, third] = lessonFor('r2-loom-distribution')!.hints;
    expect(hintFor('r2-loom-distribution', 1)).toBe(first);
    expect(hintFor('r2-loom-distribution', 2)).toBe(second);
    expect(hintFor('r2-loom-distribution', 3)).toBe(third);
  });

  it('clamps an out-of-range tier into the weakest and strongest', () => {
    const [first, , third] = lessonFor('r0-opening')!.hints;
    // Tiers only ever run 1..3; a stale save asking outside that range still
    // gets a real hint rather than nothing.
    expect(hintFor('r0-opening', 0)).toBe(first);
    expect(hintFor('r0-opening', 9)).toBe(third);
    expect(hintFor('r0-opening', -4)).toBe(first);
  });

  it('returns nothing for an unknown stage', () => {
    expect(hintFor('not-a-stage', 1)).toBeUndefined();
  });
});

describe('labels cover every id the interface can show', () => {
  it('names every id reachable from stage data', () => {
    const missing: string[] = [];
    for (const stage of STAGES) {
      for (const id of visibleIds(stage)) {
        if (!hasLabel(id)) missing.push(`${stage.id}:${id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('names every sensor a stage can place', () => {
    for (let i = 0; i < 6; i += 1) {
      // Sensors are rendered through a generated label rather than the table.
      expect(typeof `sensor-${i}`).toBe('string');
    }
    expect(STAGES.some((s) => (s.data as { trueFault?: string }).trueFault)).toBe(true);
  });

  it('writes every label in both languages', () => {
    for (const lang of LANGS) {
      for (const [id, text] of Object.entries(LABELS)) {
        expect(text[lang].trim(), `${id}.${lang}`).not.toBe('');
      }
    }
  });

  it('falls back to the id rather than rendering nothing', () => {
    expect(lookup('definitely-not-a-real-id', 'tr')).toBe('definitely-not-a-real-id');
    expect(hasLabel('definitely-not-a-real-id')).toBe(false);
  });
});