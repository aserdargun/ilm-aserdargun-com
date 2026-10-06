import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The bed is synthesised, so none of these failures announce themselves: the
 * page plays, tests pass, and it just sounds wrong. Every rule below was a real
 * defect in the previous engine.
 */
const src = readFileSync('src/game/audio.ts', 'utf8');

/** Pull a `const NAME = [...]` numeric array out of the module source. */
function constantArray(name: string): number[] {
  const match = src.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
  if (!match) throw new Error(`constant ${name} not found`);
  return match[1]
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => !Number.isNaN(n));
}

/** Pull a scalar `const NAME = <number>` out of the module source. */
function scalar(name: string): number {
  const match = src.match(new RegExp(`const ${name} = (-?[\\d.]+);`));
  if (!match) throw new Error(`constant ${name} not found`);
  return Number(match[1]);
}

/** Nearest equal-tempered semitone above a frequency, relative to A2. */
function semitonesFromA2(hz: number): number {
  return Math.round(12 * Math.log2(hz / 110));
}

const progression = [...src.matchAll(/^\s*\[((?:\s*[\d.]+,?)+)\s*\],?\s*$/gm)].map((m) =>
  m[1].split(',').map((n) => Number(n.trim())),
);

describe('ambient bed', () => {
  it('gives every chord a third against its own bass', () => {
    // The old bed was A2-E3-A3-E4-A4: five notes, all octaves and fifths, so
    // the entire game was one unresolved open fifth.
    expect(progression.length).toBeGreaterThanOrEqual(4);
    for (const chord of progression) {
      expect(chord.length).toBe(5);
      const bass = semitonesFromA2(chord[0]);
      const above = chord.slice(1).map(semitonesFromA2);
      const hasThird = above.some((s) => {
        const d = Math.abs(s - bass) % 12;
        return d === 3 || d === 4;
      });
      expect(hasThird, `chord ${chord} has no third above its bass`).toBe(true);
    }
  });

  it('keeps every voice ascending, with the bass always lowest', () => {
    for (const chord of progression) {
      const sorted = [...chord].sort((a, b) => a - b);
      expect(chord).toEqual(sorted);
    }
  });

  it('never lets a voice gain swing negative', () => {
    // The old engine summed one fixed 0.035 depth onto every voice, so the
    // quieter ones reached -0.013 and -0.019 and phase-inverted twice a cycle.
    const levels = constantArray('LEVELS');
    const fraction = scalar('BREATH_FRACTION');
    for (const level of levels) {
      expect(level - level * fraction).toBeGreaterThan(0);
      expect(fraction).toBeLessThan(0.5);
    }
  });

  it('breathes in proportion to each voice, not by a fixed depth', () => {
    expect(src).toMatch(/breathDepth\.gain\.value = LEVELS\[i\] \* BREATH_FRACTION/);
    // An absolute depth is what broke it; nothing may reintroduce one.
    expect(src).not.toMatch(/tremoloDepth/);
  });

  it('does not sweep the filter into its own fundamentals', () => {
    // The old lowpass swept 640-1160 Hz with every fundamental below 640 Hz,
    // so the filter that was supposed to soften the pad never touched it.
    const highest = Math.max(...progression.flat());
    expect(scalar('CUTOFF_DARK')).toBeGreaterThan(highest);
    expect(scalar('CUTOFF_BRIGHTEST')).toBeGreaterThan(scalar('CUTOFF_DARK'));
    // No oscillator may be wired into filter.frequency: that is the wow/flutter.
    expect(src).not.toMatch(/connect\((?:this\.)?filter\.frequency\)/);
    expect(src).not.toMatch(/sweepDepth/);
  });

  it('opens the filter as regions are restored', () => {
    expect(src).toMatch(/setRestoredCount[\s\S]*filter\.frequency\.setTargetAtTime/);
    const perRegion = scalar('CUTOFF_PER_REGION');
    expect(perRegion).toBeGreaterThan(0);
  });

  it('keeps the bed below the mud line and behind a limiter', () => {
    expect(src).toMatch(/createDynamicsCompressor/);
    expect(src).toMatch(/highpass/);
    expect(scalar('HIGHPASS_HZ')).toBeGreaterThan(20);
  });

  it('gives every voice its own level, with no modulo wrap', () => {
    // `[...][index % 4]` handed the top A4 the same 0.05 as the 110 Hz root.
    const levels = constantArray('LEVELS');
    expect(new Set(levels).size).toBe(levels.length);
    expect(src).not.toMatch(/LEVELS\[\s*index\s*%/);
  });

  it('puts the loudest voice above the phone bass roll-off', () => {
    // A phone speaker rolls off hard below ~250 Hz. Weighting the pad towards
    // 110 Hz spends headroom on a note the listener cannot actually hear.
    const levels = constantArray('LEVELS');
    const opening = progression[0];
    const loudest = levels.indexOf(Math.max(...levels));
    expect(opening[0]).toBeLessThan(200);
    expect(loudest).toBeGreaterThan(0);
    expect(opening[loudest]).toBeGreaterThanOrEqual(200);
  });

  it('moves between chords over time rather than sitting as a drone', () => {
    expect(scalar('CHORD_HOLD')).toBeGreaterThan(10);
    expect(scalar('CHORD_GLIDE')).toBeGreaterThan(1);
    expect(src).toMatch(/setInterval\(\(\) => this\.advanceChord\(\)/);
    // Ramping from a stale start point would click on every chord change.
    expect(src).toMatch(/cancelScheduledValues[\s\S]{0,80}setValueAtTime/);
    // Exponential ramps reject zero and negatives.
    for (const chord of progression) {
      for (const hz of chord) expect(hz).toBeGreaterThan(0);
    }
  });

  it('does not build an audio context until a user gesture', () => {
    expect(src).not.toMatch(/new AudioContext/);
    expect(src).not.toMatch(/^\s*audio\.start\(\)/m);
  });

  it('clears its chord timer on dispose', () => {
    expect(src).toMatch(/dispose\(\)[\s\S]*clearInterval/);
  });
});
