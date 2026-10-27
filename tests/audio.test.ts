import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The bed is synthesised, so none of these failures announce themselves: the
 * page plays, tests pass, and it just sounds wrong. Every rule below was a
 * real defect in the engine that came before it.
 *
 * The numbers were read off the shipping engine with `tools/audio/measure.mjs`,
 * which renders it offline and measures the result.
 */
const src = readFileSync('src/game/audio.ts', 'utf8');

/** Pull a `const NAME = [...]` numeric array out of the module source. */
function constantArray(name: string): number[] {
  const match = src.match(new RegExp(`const ${name}(?::[^=]*)? = \\[([^\\]]*)\\]`));
  if (!match) throw new Error(`constant ${name} not found`);
  return match[1]
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => !Number.isNaN(n));
}

/** Pull a `const NAME = [...]` string array out of the module source. */
function stringArray(name: string): string[] {
  const match = src.match(new RegExp(`const ${name}(?::[^=]*)? = \\[([^\\]]*)\\]`));
  if (!match) throw new Error(`constant ${name} not found`);
  return match[1]
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

/** Pull a scalar `const NAME = <number>` out of the module source. */
function scalar(name: string): number {
  const match = src.match(new RegExp(`const ${name}(?::[^=]*)? = (-?[\\d.]+);`));
  if (!match) throw new Error(`constant ${name} not found`);
  return Number(match[1]);
}

/** The chord cycle, read out of the source rather than restated here. */
function progression(): number[][] {
  const start = src.indexOf('const PROGRESSION');
  if (start < 0) throw new Error('PROGRESSION not found');
  const equals = src.indexOf('=', start);
  const end = src.indexOf('];', equals);
  const block = src.slice(equals + 1, end);
  // Only the rows: the outer bracket is followed by a newline and another
  // bracket, and a row is nothing but numbers.
  return [...block.matchAll(/\[\s*((?:\d+\.?\d*\s*,\s*)*\d+\.?\d*)\s*\]/g)].map((m) =>
    m[1].split(',').map((n) => Number(n.trim())),
  );
}

/** Nearest equal-tempered semitone above a frequency, relative to A2. */
function semitonesFromA2(hz: number): number {
  return Math.round(12 * Math.log2(hz / 110));
}

describe('ambient bed', () => {
  it('gives every chord a third against its own bass', () => {
    // The first bed was A2-E3-A3-E4-A4: five notes, all octaves and fifths, so
    // the entire game was one unresolved open fifth.
    const chords = progression();
    expect(chords.length).toBeGreaterThanOrEqual(4);
    for (const chord of chords) {
      expect(chord.length).toBeGreaterThanOrEqual(4);
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
    for (const chord of progression()) {
      const sorted = [...chord].sort((a, b) => a - b);
      expect(chord).toEqual(sorted);
    }
  });

  it('spreads the voices so that no two of them beat against each other', () => {
    // Two notes a fifth apart beat at their frequency difference, and the
    // previous bed put C4 and E4 68 Hz apart at nearly the same level: a
    // flutter with 27 dB of depth, in the band the ear hears as a buzz.
    // Every pair has to be far enough apart that the flutter reads as
    // shimmer instead.
    for (const chord of progression()) {
      for (let i = 0; i < chord.length; i += 1) {
        for (let j = i + 1; j < chord.length; j += 1) {
          expect(chord[j] - chord[i], `chord ${chord} beats at ${chord[j] - chord[i]} Hz`).toBeGreaterThanOrEqual(120);
        }
      }
    }
  });

  it('never puts two voices a semitone apart', () => {
    // A minor second is the harshest interval there is, and it is audible
    // even at a whisper.
    for (const chord of progression()) {
      for (let i = 0; i < chord.length; i += 1) {
        for (let j = i + 1; j < chord.length; j += 1) {
          const distance = Math.abs(semitonesFromA2(chord[j]) - semitonesFromA2(chord[i])) % 12;
          expect(distance, `chord ${chord} has a semitone`).not.toBe(1);
        }
      }
    }
  });

  it('keeps a note sounding across every chord change', () => {
    // The chord turns over one note at a time. If two neighbouring chords
    // shared nothing, the bed would empty out for a second every cycle.
    const chords = progression();
    for (let i = 0; i < chords.length; i += 1) {
      const from = chords[i];
      const to = chords[(i + 1) % chords.length];
      const shared = from.filter((hz) => to.includes(hz));
      expect(shared.length, `chords ${from} and ${to} share nothing`).toBeGreaterThan(0);
    }
  });

  it('gives every voice its own level, with no modulo wrap', () => {
    // `[...][index % 4]` handed the top note the same 0.05 as the root.
    const levels = constantArray('LEVELS');
    expect(new Set(levels).size).toBe(levels.length);
    expect(src).not.toMatch(/LEVELS\[\s*index\s*%/);
  });

  it('puts the loudest voice above the phone bass roll-off', () => {
    // A phone speaker rolls off hard below ~250 Hz. Weighting the pad towards
    // 110 Hz spends headroom on a note the listener cannot actually hear.
    const levels = constantArray('LEVELS');
    const opening = progression()[0];
    const loudest = levels.indexOf(Math.max(...levels));
    expect(loudest).toBeGreaterThan(0);
    expect(opening[loudest]).toBeGreaterThanOrEqual(200);
  });

  it('synthesises every pad voice as a sine', () => {
    // The previous bed ended in two triangles, and a triangle carries its
    // third and fifth harmonic into the band where the ear is most sensitive
    // to irritation. A pad has no business being bright.
    const types = stringArray('PAD_TYPES');
    expect(types.length).toBeGreaterThanOrEqual(4);
    expect(new Set(types)).toEqual(new Set(['sine']));
    expect(src).not.toMatch(/type = '(triangle|square|sawtooth)'/);
  });

  it('has no noise floor at all', () => {
    // A bandpassed noise floor at 1.8 kHz ran for the whole game, in the band
    // the ear is most sensitive to.
    expect(src).not.toMatch(/createBufferSource/);
    expect(src).not.toMatch(/'bandpass'/);
  });

  it('keeps the room dark', () => {
    // A white impulse response is a bright, fizzy room, and the fizz is what
    // a pad sounds irritating inside.
    expect(scalar('IMPULSE_LOWPASS')).toBeLessThanOrEqual(0.25);
  });

  it('does not sweep the filter into its own fundamentals', () => {
    // The old lowpass swept 640-1160 Hz with every fundamental below 640 Hz,
    // so the filter that was supposed to soften the pad never touched it.
    const pad = progression().flat();
    const bells = constantArray('MELODY_NOTES');
    expect(scalar('PAD_CUTOFF_DARK')).toBeGreaterThan(Math.max(...pad));
    expect(scalar('BELL_CUTOFF_DARK')).toBeGreaterThan(Math.max(...bells));
    // No oscillator may be wired into a filter's frequency: that is the
    // wow/flutter.
    expect(src).not.toMatch(/connect\((?:bed\.)?(?:padFilter|bellFilter|filter)\.frequency\)/);
    expect(src).not.toMatch(/sweepDepth/);
  });

  it('opens the filter as regions are restored', () => {
    expect(src).toMatch(/setRestoredCount[\s\S]*padFilter\.frequency\.setTargetAtTime/);
    expect(scalar('PAD_CUTOFF_PER_REGION')).toBeGreaterThan(0);
    expect(src).toMatch(/setRestoredCount[\s\S]*bellFilter\.frequency\.setTargetAtTime/);
  });

  it('keeps the bed below the mud line and behind a limiter', () => {
    expect(src).toMatch(/createDynamicsCompressor/);
    expect(src).toMatch(/highpass/);
    expect(scalar('HIGHPASS_HZ')).toBeGreaterThan(20);
  });

  it('modulates the bed exactly once, and slowly', () => {
    // Ten oscillators used to move this bed: five breath oscillators between
    // 0.023 Hz and 0.043 Hz and five detune oscillators between 0.009 Hz and
    // 0.021 Hz, none of them sharing a period with any other. The swell never
    // repeated and never settled. One slow breath is what a bed needs.
    expect(src).not.toMatch(/breathDepth|detuneDepth|tremolo/);
    // Nothing may drive a voice's own gain.
    expect(src).not.toMatch(/connect\((?:this\.)?gain\.gain\)/);
    expect(src).toMatch(/swellLfo/);
    expect(scalar('SWELL_RATE')).toBeLessThanOrEqual(0.05);
    expect(scalar('SWELL_DEPTH')).toBeLessThanOrEqual(0.06);
  });

  it('never bends a pitch', () => {
    // A glide turns a chord into an ambiguous smear, and an ambiguous chord
    // in the background reads as unease. The pitch is set while the voice is
    // silent, so the change is a step and not a slide.
    expect(src).not.toMatch(/freq\w*\.?\w*RampToValueAtTime/);
    expect(src).not.toMatch(/osc\.frequency\.\w*RampToValueAtTime/);
    expect(src).toMatch(/freq\.setValueAtTime/);
  });

  it('moves between chords over time rather than sitting as a drone', () => {
    expect(scalar('CHORD_HOLD')).toBeGreaterThan(10);
    expect(src).toMatch(/setInterval\(\(\) => this\.tick\(\)/);
    // The chord turns over note by note, so it never thins out.
    expect(scalar('CHORD_STAGGER')).toBeGreaterThan(0);
    const trip = scalar('CHORD_DIVE') + scalar('CHORD_SILENCE') + scalar('CHORD_RISE');
    expect(scalar('CHORD_STAGGER')).toBeLessThan(trip);
    // And the whole turn-over has to fit inside a breath.
    expect(2 * scalar('CHORD_STAGGER') + trip).toBeLessThan(60);
  });

  it('plays a melody, and keeps it sparse', () => {
    // Five tones and a filter is a pad. A pad with no melody in it is a hum.
    const gaps = constantArray('MELODY_GAPS');
    expect(gaps.length).toBeGreaterThanOrEqual(4);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(5);
    const notes = constantArray('MELODY_NOTES');
    expect(notes.length).toBe(gaps.length);
    // The bells have to clear the bell filter, or they turn into mud.
    expect(Math.min(...notes)).toBeGreaterThan(scalar('BELL_HIGHPASS_HZ'));
    // And they have to ring, rather than tick.
    expect(constantArray('MELODY_DECAYS')[0]).toBeGreaterThanOrEqual(3);
    expect(scalar('MELODY_LEVEL')).toBeLessThanOrEqual(0.15);
  });

  it('keeps the melody clear of the pad', () => {
    // A bell a minor seventh above a pad tone flutters at 48 Hz for as long
    // as it rings, and the bell is the louder of the two. The melody either
    // doubles a note the pad is holding or stays well clear of it.
    const pad = progression().flat();
    const bells = [...constantArray('MELODY_NOTES'), ...constantArray('CHIME_FREQUENCIES')];
    for (const bell of bells) {
      for (const note of pad) {
        const distance = Math.abs(bell - note);
        expect(distance === 0 || distance >= 120, `bell ${bell} is ${distance} Hz from ${note}`).toBe(
          true,
        );
      }
    }
  });

  it('chimes rather than alerts', () => {
    // Four notes in 340 ms, climbing an octave, is a notification. A
    // contemplative game should settle when a puzzle is solved.
    const frequencies = constantArray('CHIME_FREQUENCIES');
    const offsets = constantArray('CHIME_OFFSETS');
    expect(frequencies.length).toBeLessThanOrEqual(2);
    expect(offsets.length).toBe(frequencies.length);
    // The gap between the notes is what makes it a chime rather than a
    // jingle; the first note may start at once.
    for (let i = 1; i < offsets.length; i += 1) {
      expect(offsets[i] - offsets[i - 1]).toBeGreaterThanOrEqual(0.3);
    }
    // The figure must not climb more than a fifth.
    const ratio = Math.max(...frequencies) / Math.min(...frequencies);
    expect(ratio).toBeLessThanOrEqual(1.6);
    expect(Math.max(...constantArray('CHIME_LEVELS'))).toBeLessThanOrEqual(0.09);
  });

  it('does not build an audio context until a user gesture', () => {
    expect(src).not.toMatch(/new AudioContext/);
    expect(src).not.toMatch(/^\s*audio\.start\(\)/m);
  });

  it('clears its chord timer on dispose', () => {
    expect(src).toMatch(/dispose\(\)[\s\S]*clearInterval/);
  });

  it('keeps the offline render the measurement tool depends on', () => {
    // `tools/audio/measure.mjs` measures the shipping engine, not a copy of
    // it. If this export goes, the measurements become fiction.
    expect(src).toMatch(/export async function renderBedOffline/);
    expect(src).toMatch(/export async function renderChimeOffline/);
  });
});
