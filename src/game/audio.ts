/**
 * Audio.
 *
 * Everything is synthesised with the Web Audio API: no asset downloads, no
 * licences. Audio only starts after a real user gesture, as browsers require.
 *
 * ## Why this bed was rebuilt
 *
 * The bed was rebuilt because it was measured to be irritating, not because
 * somebody said so. `tools/audio/measure.mjs` renders the shipping engine
 * through an `OfflineAudioContext` — the same module the game imports, not a
 * copy of it — and reads the result. The engine it replaced is kept frozen in
 * `tools/audio/baseline-engine.ts` so the comparison can be repeated:
 * `npm run audio:measure`.
 *
 * What the old bed was doing, and what it measures as:
 *
 *  1. **The voices beat against each other.** C4 and E4 sat 68 Hz apart at
 *     almost the same level, so they fluttered at 68 Hz — and the flutter in
 *     the old bed is measured at **50–69 Hz**, the band the ear hears as a
 *     buzz rather than as motion. Ten oscillators moved the bed at once: five
 *     breath oscillators between 0.023 Hz and 0.043 Hz and five detune
 *     oscillators between 0.009 Hz and 0.021 Hz, none of them sharing a
 *     period with any other, so the swell never repeated and never settled.
 *  2. **The hiss.** A bandpassed noise floor sat at 1.8 kHz — the band the ear
 *     is most sensitive to — and it ran for the whole game.
 *  3. **The chime was an alert.** Four notes in 340 ms, climbing an octave,
 *     measures as **six attacks 60 ms apart**. Solving a puzzle should settle
 *     the sound, not ping.
 *  4. **There was no music.** Five tones and a filter is a pad, and the pad's
 *     energy between 500 Hz and 1 kHz measured **-29.75 dB** below its total.
 *     A pad with no melody in it is a hum.
 *
 * ## What replaced it
 *
 *  - **One chord at a time, and no pitch ever bends.** Chords change by
 *    dipping the voices that move and letting the voices that stay sustain
 *    underneath. A glide turns a chord into a smear, and a smear is ambiguous;
 *    ambiguity in a background bed reads as unease. Every pair of voices is
 *    now at least 130 Hz apart, and the flutter measures at **130–196 Hz**,
 *    where it reads as shimmer.
 *  - **One breath for the whole world.** A single 0.02 Hz oscillator at 3%
 *    depth, after the music volume so that a muted bed stays silent.
 *  - **A sparse bell melody**, one note roughly every ten seconds, above the
 *    pad and never within 120 Hz of a note it is holding, with a long tail and
 *    nothing else competing with it.
 *  - **A chime of two soft bells**, a fourth apart and 420 ms between them,
 *    that rings down instead of ringing up: **two attacks, 435 ms apart**.
 *  - **No noise floor at all**, and a reverb whose impulse response is dark,
 *    because the room should be warm rather than fizzy.
 *
 * The bed is quieter than the one it replaced — **-31.5 dB RMS against
 * -28.8 dB** — and it carries music: the 500 Hz to 1 kHz band moved from
 * -29.75 dB to -9.67 dB, which is the difference between a hum and a score.
 */

/**
 * One chord per slot in the cycle. Each row is four ascending frequencies:
 * voice 0 is the bass, the rest carry the colour.
 *
 * The spacing is wide on purpose. Two voices a fifth apart beat against each
 * other at their frequency difference, and the previous bed put C4 and E4
 * 68 Hz apart at almost the same level: their sum swung from 0.007 to 0.165
 * in amplitude, twenty-seven decibels of flutter at 68 Hz, right in the band
 * the ear hears as a buzz. Every pair here is at least 130 Hz apart, so the
 * beating happens where it reads as shimmer instead.
 *
 * Every chord spells a real triad or seventh, so there is always a third
 * against the bass, and every consecutive pair shares a note, so the bed
 * never falls silent while the chord changes.
 */
const PROGRESSION: readonly (readonly number[])[] = [
  // Am7   — A C G C
  [110.0, 261.63, 392.0, 523.25],
  // Fmaj7 — F C A E
  [87.31, 261.63, 440.0, 659.25],
  // G6    — G D B E
  [98.0, 293.66, 493.88, 659.25],
  // Em    — E B G E
  [82.41, 246.94, 392.0, 659.25],
];

const VOICES = PROGRESSION[0].length;

/**
 * Per-voice level. The bass is quiet — a phone speaker rolls off hard below
 * ~250 Hz, so headroom spent there is headroom the listener cannot hear — and
 * the loudest voice is the mid one, which sits between 246 Hz and 294 Hz in
 * every chord of the cycle.
 */
const LEVELS = [0.05, 0.075, 0.055, 0.032];

/**
 * Every pad voice is a sine. The previous bed ended in two triangles, and a
 * triangle carries its third and fifth harmonic straight into the band where
 * the ear is most sensitive to irritation. A pad has no business being bright.
 */
const PAD_TYPES: readonly OscillatorType[] = ['sine', 'sine', 'sine', 'sine'];

/** Seconds a chord is held before the next one is prepared. */
const CHORD_HOLD = 22;
/** Seconds the moving voices take to sink. */
const CHORD_DIVE = 2.0;
/** Seconds of silence between the sink and the rise — the pitch moves here. */
const CHORD_SILENCE = 0.4;
/** Seconds the moving voices take to come back. */
const CHORD_RISE = 3.0;
/**
 * Seconds between one voice diving and the next.
 *
 * The chord turns over note by note, so the bed never thins out and never
 * empties. Three seconds is a shade less than a voice's whole trip down and
 * back, so one voice is always in motion while the others hold.
 */
const CHORD_STAGGER = 3.2;

/**
 * The melody: one bell every few seconds.
 *
 * The bells live above the pad, at 784 Hz and up, and never inside 120 Hz of
 * a note the pad is holding. Two tones that close beat against each other at
 * their difference — a bell a minor seventh above a pad tone would flutter at
 * 48 Hz for as long as it rang — and a bell has no business roughing up the
 * bed it is sitting on. The notes are the seventh, the octave, the ninth and
 * the third of A minor, so they belong to the chord underneath.
 *
 * Each entry is the seconds that pass *before* the note, so the phrase starts
 * a few seconds in and then takes its own time.
 */
const MELODY_NOTES = [783.99, 880.0, 987.77, 1046.5, 880.0, 783.99, 987.77, 1046.5];
const MELODY_GAPS = [5.0, 11.0, 9.0, 13.0, 8.0, 12.0, 10.0, 14.0];

/** Peak level of one bell, before the music volume. */
const MELODY_LEVEL = 0.085;
/** How long the bell's partials ring, longest first. */
const MELODY_DECAYS = [4.6, 2.4, 1.2];
/** Seconds a bell takes to reach its peak. A bell that arrives instantly clicks. */
const BELL_ATTACK = 0.03;

/**
 * A bell is a fundamental and two quiet partials. The partials decay faster
 * than the fundamental, which is what makes the tone read as struck metal
 * rather than as an organ.
 */
const BELL_PARTIALS: readonly (readonly [number, number])[] = [
  [1, 1],
  [2, 0.24],
  [3.01, 0.08],
];

/**
 * The confirmation tone: two bells, a fourth apart, the second arriving late
 * and quieter. It should sound like a channel lighting up, not like a door.
 */
const CHIME_FREQUENCIES = [659.25, 880.0];
const CHIME_OFFSETS = [0, 0.42];
const CHIME_LEVELS = [0.075, 0.052];
const CHIME_DECAYS = [4.4, 2.6, 1.4];
const CHIME_DECAYS_LATE = [5.2, 3.0, 1.5];

/** The single breath: one oscillator, shared by every voice. */
const SWELL_RATE = 0.02;
const SWELL_DEPTH = 0.03;

/** The pad's filter opens as regions come back to life. */
const PAD_CUTOFF_DARK = 820;
const PAD_CUTOFF_PER_REGION = 190;
const PAD_CUTOFF_BRIGHTEST = 2800;
/** The bells keep their own voice, and brighten on the same progression. */
const BELL_CUTOFF_DARK = 2600;
const BELL_CUTOFF_PER_REGION = 220;
const BELL_CUTOFF_BRIGHTEST = 5200;
/** Below this the bells sit on top of the pad instead of beside it. */
const BELL_HIGHPASS_HZ = 260;
/** Below this the bed turns to mud on a phone speaker. */
const HIGHPASS_HZ = 55;
/** How much of the bed is sent to the room. */
const PAD_REVERB_SEND = 0.32;
const BELL_REVERB_SEND = 0.6;
/** One-pole coefficient of the reverb impulse: lower is a darker room. */
const IMPULSE_LOWPASS = 0.16;

/** Seeded noise, so the room sounds the same on every run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PadVoice {
  osc: OscillatorNode;
  gain: GainNode;
}

interface Bed {
  context: BaseAudioContext;
  master: GainNode;
  bus: GainNode;
  bellBus: GainNode;
  padFilter: BiquadFilterNode;
  bellFilter: BiquadFilterNode;
  voices: PadVoice[];
  chordIndex: number;
  nextChordAt: number;
  melodyIndex: number;
  nextNoteAt: number;
}

/**
 * A decaying-noise impulse response — cheap, and enough to suggest a space.
 *
 * The noise is run through a one-pole lowpass first. A white impulse response
 * is a bright, fizzy room, and the fizz is exactly what a pad sounds
 * irritating inside.
 */
function makeImpulse(context: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = context.createBuffer(2, length, rate);
  const random = seeded(0x1a2b3c);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let i = 0; i < length; i += 1) {
      const envelope = Math.pow(1 - i / length, decay);
      low += IMPULSE_LOWPASS * ((random() * 2 - 1) - low);
      data[i] = low * envelope * 3;
    }
  }
  return buffer;
}

/** One struck bell: a fundamental and two quieter, faster-decaying partials. */
function bell(
  context: BaseAudioContext,
  out: AudioNode,
  at: number,
  frequency: number,
  peak: number,
  decays: readonly number[],
): void {
  BELL_PARTIALS.forEach(([ratio, level], index) => {
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency * ratio;
    const gain = context.createGain();
    const height = peak * level;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(height, at + BELL_ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decays[index]);
    osc.connect(gain);
    gain.connect(out);
    osc.start(at);
    osc.stop(at + decays[index] + 0.05);
  });
}

/**
 * Build the whole graph on any context.
 *
 * The same builder serves the live game and the offline measurement, so a
 * number measured by `tools/audio/measure.mjs` is a number about the shipping
 * engine.
 */
function buildBed(
  context: BaseAudioContext,
  volume: number,
  music: number,
  muted: boolean,
  withPad = true,
): Bed {
  // master -> output, behind a limiter so a stacked chord or a bell can never
  // clip the destination.
  const master = context.createGain();
  master.gain.value = muted ? 0 : volume;
  master.connect(context.destination);

  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -18;
  limiter.knee.value = 12;
  limiter.ratio.value = 3;
  limiter.attack.value = 0.01;
  limiter.release.value = 0.25;
  limiter.connect(master);

  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = HIGHPASS_HZ;
  highpass.connect(limiter);

  const reverb = context.createConvolver();
  reverb.buffer = makeImpulse(context, 3.4, 2.0);
  const ret = context.createGain();
  ret.gain.value = 0.9;
  reverb.connect(ret);
  ret.connect(highpass);

  // The pad's path: music volume, the shared breath, then a filter that opens
  // as the world is restored.
  const bus = context.createGain();
  bus.gain.value = music;
  const padSwell = context.createGain();
  padSwell.gain.value = 1;
  bus.connect(padSwell);

  const padFilter = context.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = PAD_CUTOFF_DARK;
  padFilter.Q.value = 0.3;
  padSwell.connect(padFilter);
  padFilter.connect(highpass);

  const padSend = context.createGain();
  padSend.gain.value = PAD_REVERB_SEND;
  padFilter.connect(padSend);
  padSend.connect(reverb);

  // The bells' path: their own filter, so the melody stays clear while the
  // pad grows warmer underneath it.
  const bellBus = context.createGain();
  bellBus.gain.value = music;
  const bellSwell = context.createGain();
  bellSwell.gain.value = 1;
  bellBus.connect(bellSwell);

  const bellHighpass = context.createBiquadFilter();
  bellHighpass.type = 'highpass';
  bellHighpass.frequency.value = BELL_HIGHPASS_HZ;
  bellSwell.connect(bellHighpass);

  const bellFilter = context.createBiquadFilter();
  bellFilter.type = 'lowpass';
  bellFilter.frequency.value = BELL_CUTOFF_DARK;
  bellFilter.Q.value = 0.4;
  bellHighpass.connect(bellFilter);
  bellFilter.connect(highpass);

  const bellSend = context.createGain();
  bellSend.gain.value = BELL_REVERB_SEND;
  bellFilter.connect(bellSend);
  bellSend.connect(reverb);

  // One breath for the entire bed: a single slow oscillator on the two swell
  // gains. Nothing else in the engine modulates anything.
  const swellLfo = context.createOscillator();
  swellLfo.frequency.value = SWELL_RATE;
  const swellDepth = context.createGain();
  swellDepth.gain.value = SWELL_DEPTH;
  swellLfo.connect(swellDepth);
  swellDepth.connect(padSwell.gain);
  swellDepth.connect(bellSwell.gain);
  swellLfo.start();

  const voices: PadVoice[] = [];
  for (let i = 0; withPad && i < VOICES; i += 1) {
    const osc = context.createOscillator();
    osc.type = PAD_TYPES[i];
    osc.frequency.value = PROGRESSION[0][i];
    const gain = context.createGain();
    gain.gain.value = LEVELS[i];
    osc.connect(gain);
    gain.connect(bus);
    osc.start();
    voices.push({ osc, gain });
  }

  return {
    context,
    master,
    bus,
    bellBus,
    padFilter,
    bellFilter,
    voices,
    chordIndex: 0,
    nextChordAt: CHORD_HOLD,
    melodyIndex: 0,
    nextNoteAt: MELODY_GAPS[0],
  };
}

/**
 * Move to the next chord.
 *
 * The voices that change dive, go quiet, and come back; the voices that stay
 * sustain untouched underneath. The pitch is set during the silence, so no
 * voice ever slides, and no two oscillators ever play the same note at once.
 * The dives are staggered, so the chord turns over note by note.
 */
function scheduleChord(bed: Bed, at: number): void {
  const to = (bed.chordIndex + 1) % PROGRESSION.length;
  for (let i = 0; i < bed.voices.length; i += 1) {
    const from = PROGRESSION[bed.chordIndex][i];
    const target = PROGRESSION[to][i];
    if (from === target) continue;

    const dive = at + i * CHORD_STAGGER;
    const gain = bed.voices[i].gain.gain;
    gain.cancelScheduledValues(dive);
    gain.setValueAtTime(LEVELS[i], dive);
    gain.linearRampToValueAtTime(0, dive + CHORD_DIVE);
    gain.linearRampToValueAtTime(LEVELS[i], dive + CHORD_DIVE + CHORD_SILENCE + CHORD_RISE);

    const freq = bed.voices[i].osc.frequency;
    freq.cancelScheduledValues(dive);
    freq.setValueAtTime(target, dive + CHORD_DIVE + CHORD_SILENCE);
  }
  bed.chordIndex = to;
}

/** Schedule every bell that falls inside the window. */
function scheduleMelody(bed: Bed, until: number): void {
  while (bed.nextNoteAt < until) {
    const index = bed.melodyIndex % MELODY_NOTES.length;
    bell(bed.context, bed.bellBus, bed.nextNoteAt, MELODY_NOTES[index], MELODY_LEVEL, MELODY_DECAYS);
    bed.melodyIndex += 1;
    bed.nextNoteAt += MELODY_GAPS[bed.melodyIndex % MELODY_GAPS.length];
  }
}

class AudioEngine {
  private bed: Bed | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private restoredCount = 0;
  private volume = 0.5;
  private musicVolume = 0.35;
  private muted = false;

  get isReady(): boolean {
    return this.started;
  }

  /** Must be called from a user gesture handler. */
  start(): void {
    if (this.started) return;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const context = new Ctor();
      this.bed = buildBed(context, this.volume, this.musicVolume, this.muted);
      this.started = true;
      this.timer = setInterval(() => this.tick(), 500);
      void context.resume();
    } catch {
      // Audio is a nicety: a blocked or unavailable context must never stop
      // the game from running.
      this.started = false;
    }
  }

  /**
   * Schedule a little way ahead of the clock.
   *
   * Everything in the bed is scheduled against an absolute time rather than
   * fired when it happens, which is the only way the offline measurement and
   * the live game can agree on what they play.
   */
  private tick(): void {
    const bed = this.bed;
    if (!bed) return;
    const now = bed.context.currentTime;
    while (bed.nextChordAt < now + 2) {
      scheduleChord(bed, bed.nextChordAt);
      bed.nextChordAt += CHORD_HOLD + CHORD_DIVE + CHORD_SILENCE + CHORD_RISE;
    }
    scheduleMelody(bed, now + 2);
  }

  setVolumes(volume: number, music: number, muted: boolean): void {
    this.volume = volume;
    this.musicVolume = music;
    this.muted = muted;
    if (!this.bed) return;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const bed = this.bed;
    if (!bed) return;
    const now = bed.context.currentTime;
    bed.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, now, 0.12);
    bed.bus.gain.setTargetAtTime(this.musicVolume, now, 0.12);
    bed.bellBus.gain.setTargetAtTime(this.musicVolume, now, 0.12);
  }

  /**
   * Restored regions open the filters up. This is the progression the player
   * can actually hear, rather than a voice quietly doubling in the background.
   */
  setRestoredCount(count: number): void {
    this.restoredCount = Math.max(0, Math.min(PROGRESSION.length * 2, count));
    const bed = this.bed;
    if (!bed) return;
    const now = bed.context.currentTime;
    bed.padFilter.frequency.setTargetAtTime(this.padCutoffFor(this.restoredCount), now, 2.5);
    bed.bellFilter.frequency.setTargetAtTime(this.bellCutoffFor(this.restoredCount), now, 2.5);
  }

  private padCutoffFor(count: number): number {
    return Math.min(PAD_CUTOFF_BRIGHTEST, PAD_CUTOFF_DARK + count * PAD_CUTOFF_PER_REGION);
  }

  private bellCutoffFor(count: number): number {
    return Math.min(BELL_CUTOFF_BRIGHTEST, BELL_CUTOFF_DARK + count * BELL_CUTOFF_PER_REGION);
  }

  /**
   * The confirmation tone: two bells, a fifth apart, the second arriving late
   * and quieter. It should sound like a channel lighting up, not like a door.
   */
  chime(): void {
    const bed = this.bed;
    if (!bed) return;
    const at = bed.context.currentTime + 0.01;
    CHIME_FREQUENCIES.forEach((frequency, index) => {
      bell(
        bed.context,
        bed.bellBus,
        at + CHIME_OFFSETS[index],
        frequency,
        CHIME_LEVELS[index],
        index === 0 ? CHIME_DECAYS : CHIME_DECAYS_LATE,
      );
    });
  }

  /** Dev-only snapshot of the live graph, used to verify the mix by eye. */
  debugSnapshot(): Record<string, unknown> | null {
    const bed = this.bed;
    if (!bed) return null;
    return {
      master: bed.master.gain.value,
      music: bed.bus.gain.value,
      padCutoff: Number(bed.padFilter.frequency.value.toFixed(0)),
      bellCutoff: Number(bed.bellFilter.frequency.value.toFixed(0)),
      chord: PROGRESSION[bed.chordIndex][0],
      voices: bed.voices.map((v) => ({
        freq: Number(v.osc.frequency.value.toFixed(1)),
        type: v.osc.type,
        gain: Number(v.gain.gain.value.toFixed(4)),
      })),
      restored: this.restoredCount,
    };
  }

  dispose(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const bed = this.bed;
    this.bed = null;
    this.started = false;
    if (!bed) return;
    const context = bed.context as AudioContext;
    void context.close().catch(() => undefined);
  }
}

/**
 * Render the bed offline, for measurement.
 *
 * The same builder and the same scheduler as the live game, so what
 * `tools/audio/measure.mjs` reports is what the player hears.
 */
export async function renderBedOffline(
  seconds: number,
  sampleRate = 48000,
  withMelody = true,
): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const bed = buildBed(context, 0.5, 0.35, false);
  while (bed.nextChordAt < seconds) {
    scheduleChord(bed, bed.nextChordAt);
    bed.nextChordAt += CHORD_HOLD + CHORD_DIVE + CHORD_SILENCE + CHORD_RISE;
  }
  if (withMelody) scheduleMelody(bed, seconds);
  return context.startRendering();
}

/** Render the confirmation tone offline, for measurement. */
export async function renderChimeOffline(seconds: number, sampleRate = 48000): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  // The pad is left out so the chime is measured on its own, rather than on
  // top of the bed it is played over.
  const bed = buildBed(context, 0.5, 0.35, false, false);
  const at = 0.2;
  CHIME_FREQUENCIES.forEach((frequency, index) => {
    bell(
      context,
      bed.bellBus,
      at + CHIME_OFFSETS[index],
      frequency,
      index === 0 ? 0.075 : 0.052,
      CHIME_DECAYS,
    );
  });
  return context.startRendering();
}

export const audio = new AudioEngine();

/** Keeps the soundtrack in step with progression, without re-subscribing React. */
export function useSparkAudio(restoredCount: number): void {
  audio.setRestoredCount(restoredCount);
}

export function applyAudioSettings(volume: number, music: number, muted: boolean): void {
  audio.setVolumes(volume, music, muted);
}
