/**
 * Audio.
 *
 * Everything is synthesised with the Web Audio API: no asset downloads, no
 * licences. Audio only starts after a real user gesture, as browsers require.
 *
 * The previous bed was five permanently-on oscillators over open fifths
 * (A2-E3-A3-E4-A4). Three things made it unpleasant, and all three were
 * measured rather than guessed:
 *
 *  1. No third anywhere. A2 plus E is a perfect fifth, so the whole pad was a
 *     single unresolved open fifth for the entire game.
 *  2. One fixed tremolo depth (0.035) was summed onto every voice regardless of
 *     that voice's own gain (0.016-0.05). Two voices swung to -0.013 and
 *     -0.019 — past zero, into phase inversion — at 0.084 and 0.101 Hz. That is
 *     a slow seasick wobble, not a breath.
 *  3. The shared lowpass swept 640-1160 Hz while every fundamental sat below
 *     640 Hz, so the filter meant to keep things soft never touched the sound.
 *
 * What replaced it: a four-chord progression where every chord carries a third,
 * slow pitch glides instead of a drone, detune drift for warmth instead of deep
 * tremolo, a static filter that opens as regions come back to life, and a
 * compressor so nothing can spike.
 */

/**
 * One chord per slot in the cycle. Each row is five ascending frequencies:
 * voice 0 is always the bass, voices 1-4 carry the colour. Every chord spells a
 * real triad or seventh, so there is always a third against the bass.
 */
const PROGRESSION: readonly (readonly number[])[] = [
  // Am9   — A C E B
  [110.0, 220.0, 261.63, 329.63, 493.88],
  // Fmaj7 — F A C E
  [87.31, 220.0, 261.63, 329.63, 440.0],
  // G6    — G B D E
  [98.0, 246.94, 293.66, 392.0, 493.88],
  // Em7   — E G B D
  [82.41, 196.0, 246.94, 293.66, 392.0],
];

const VOICES = PROGRESSION[0].length;

/** Seconds each chord holds before the glide to the next one begins. */
const CHORD_HOLD = 26;
/** Seconds spent gliding into the next chord. Long enough to read as a slide. */
const CHORD_GLIDE = 7;

/**
 * Per-voice level. Deliberately *not* a descending ladder: the previous one came
 * from `[...][index % 4]`, which wrapped and handed the top A4 the same 0.05 as
 * the 110 Hz root. These are tuned around a phone speaker, which rolls off hard
 * below ~250 Hz, so the sub-bass voice is kept quiet and the loudest voice is
 * the C4 at index 2. A pad weighted to the bass is headroom spent on a note the
 * listener's hardware cannot reproduce.
 */
const LEVELS = [0.055, 0.078, 0.086, 0.079, 0.058];

/** Sine below the top two voices; the triangles add presence once filtered. */
const TYPES: readonly OscillatorType[] = ['sine', 'sine', 'sine', 'triangle', 'triangle'];

/**
 * Detune drift in cents, and its rate in Hz. Two oscillators a few cents apart
 * beat slowly against each other, which reads as warmth. This is the opposite of
 * the old amplitude tremolo: it can never drive a gain negative.
 */
const DETUNE_CENTS = [3, 4, 5, 6, 7];
const DETUNE_RATES = [0.021, 0.017, 0.013, 0.011, 0.009];

/**
 * Breathing depth as a fraction of each voice's own level, and its rate. Fixed in
 * proportion, never as an absolute, so no voice can swing past zero.
 */
const BREATH_FRACTION = 0.18;
const BREATH_RATES = [0.043, 0.037, 0.031, 0.027, 0.023];

/** Filter opens as regions are restored: closed and dark, then open and bright. */
const CUTOFF_DARK = 820;
const CUTOFF_PER_REGION = 190;
const CUTOFF_BRIGHTEST = 2800;
/** Below this the bed turns to mud on a phone speaker. */
const HIGHPASS_HZ = 55;

class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private voices: { osc: OscillatorNode; gain: GainNode }[] = [];
  private chordIndex = 0;
  private nextChordAt = 0;
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

      // master -> output, behind a limiter so a stacked chord or a chime can
      // never clip the destination.
      const master = context.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      master.connect(context.destination);

      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -18;
      limiter.knee.value = 12;
      limiter.ratio.value = 3;
      limiter.attack.value = 0.01;
      limiter.release.value = 0.25;
      limiter.connect(master);

      // Both dry and wet pass through the same filter, so the reverb tail is
      // coloured like the direct sound instead of sitting beside it.
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = this.cutoffFor(this.restoredCount);
      filter.Q.value = 0.3;
      const highpass = context.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = HIGHPASS_HZ;
      filter.connect(highpass);
      highpass.connect(limiter);

      const reverb = context.createConvolver();
      reverb.buffer = makeImpulse(context, 3.6, 2.0);
      const send = context.createGain();
      send.gain.value = 0.38;
      const ret = context.createGain();
      ret.gain.value = 0.9;
      filter.connect(send);
      send.connect(reverb);
      reverb.connect(ret);
      ret.connect(limiter);

      const bus = context.createGain();
      bus.gain.value = this.musicVolume;
      bus.connect(filter);

      const voices: { osc: OscillatorNode; gain: GainNode }[] = [];
      for (let i = 0; i < VOICES; i += 1) {
        const osc = context.createOscillator();
        osc.type = TYPES[i];
        osc.frequency.value = PROGRESSION[0][i];

        const gain = context.createGain();
        gain.gain.value = LEVELS[i];

        // Warmth: a few cents of drift, incommensurate per voice so the beats
        // never line up into an obvious pulse.
        const detuneLfo = context.createOscillator();
        detuneLfo.frequency.value = DETUNE_RATES[i];
        const detuneDepth = context.createGain();
        detuneDepth.gain.value = DETUNE_CENTS[i];
        detuneLfo.connect(detuneDepth);
        detuneDepth.connect(osc.detune);
        detuneLfo.start();

        // Breathing: depth is a fraction of this voice's own level, so the
        // gain node stays positive for the whole cycle.
        const breathLfo = context.createOscillator();
        breathLfo.frequency.value = BREATH_RATES[i];
        const breathDepth = context.createGain();
        breathDepth.gain.value = LEVELS[i] * BREATH_FRACTION;
        breathLfo.connect(breathDepth);
        breathDepth.connect(gain.gain);
        breathLfo.start();

        osc.connect(gain);
        gain.connect(bus);
        osc.start();

        voices.push({ osc, gain });
      }

      // A very quiet filtered-noise floor removes digital silence.
      const noise = context.createBufferSource();
      noise.buffer = makeNoise(context, 4);
      noise.loop = true;
      const noiseFilter = context.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 1800;
      noiseFilter.Q.value = 0.6;
      const noiseGain = context.createGain();
      noiseGain.gain.value = 0.006;
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(bus);
      noise.start();

      this.context = context;
      this.master = master;
      this.bus = bus;
      this.filter = filter;
      this.voices = voices;
      this.started = true;
      this.nextChordAt = context.currentTime + CHORD_HOLD;
      this.timer = setInterval(() => this.advanceChord(), 1000);
      void context.resume();
    } catch {
      // Audio is a nicety: a blocked or unavailable context must never stop
      // the game from running.
      this.started = false;
    }
  }

  /** Glide every voice to the next chord. Called on a timer, never per frame. */
  private advanceChord(): void {
    if (!this.context || !this.started) return;
    const now = this.context.currentTime;
    if (now < this.nextChordAt) return;

    const to = (this.chordIndex + 1) % PROGRESSION.length;
    const start = now + 0.05;
    for (let i = 0; i < this.voices.length; i += 1) {
      const freq = this.voices[i].osc.frequency;
      // Freeze the current value first: cancelling without a set leaves the
      // ramp starting from wherever the old glide happened to be.
      freq.cancelScheduledValues(now);
      freq.setValueAtTime(freq.value, start);
      freq.exponentialRampToValueAtTime(PROGRESSION[to][i], start + CHORD_GLIDE);
    }
    this.chordIndex = to;
    this.nextChordAt = now + CHORD_HOLD;
  }

  setVolumes(volume: number, music: number, muted: boolean): void {
    this.volume = volume;
    this.musicVolume = music;
    this.muted = muted;
    if (!this.started) return;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.master || !this.music || !this.context) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, now, 0.12);
    this.music.gain.setTargetAtTime(this.musicVolume, now, 0.12);
  }

  get music(): GainNode | null {
    return this.bus;
  }

  private cutoffFor(count: number): number {
    return Math.min(CUTOFF_BRIGHTEST, CUTOFF_DARK + count * CUTOFF_PER_REGION);
  }

  /**
   * Restored regions open the filter up. This is the progression the player can
   * actually hear, rather than a voice quietly doubling in the background.
   */
  setRestoredCount(count: number): void {
    this.restoredCount = Math.max(0, Math.min(PROGRESSION.length * 2, count));
    if (!this.started || !this.filter || !this.context) return;
    this.filter.frequency.setTargetAtTime(
      this.cutoffFor(this.restoredCount),
      this.context.currentTime,
      2.5,
    );
  }

  /**
   * The confirmation tone: a rising A-minor arpeggio left to ring into the
   * reverb. It should sound like a channel lighting up.
   */
  chime(): void {
    if (!this.started || !this.context || !this.bus) return;
    const context = this.context;
    const start = context.currentTime + 0.01;
    const arpeggio: readonly number[] = [440, 523.25, 659.25, 880];
    arpeggio.forEach((frequency, index) => {
      const at = start + index * 0.085;
      const osc = context.createOscillator();
      osc.type = index === arpeggio.length - 1 ? 'triangle' : 'sine';
      osc.frequency.value = frequency;
      const gain = context.createGain();
      const peak = 0.075 / (1 + index * 0.45);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 2.6);
      osc.connect(gain);
      gain.connect(this.bus!);
      osc.start(at);
      osc.stop(at + 2.8);
    });
  }

  /** Dev-only snapshot of the live graph, used to verify the mix by eye. */
  debugSnapshot(): Record<string, unknown> | null {
    if (!this.started || !this.context) return null;
    return {
      master: this.master?.gain.value,
      music: this.bus?.gain.value,
      cutoff: Number((this.filter?.frequency.value ?? 0).toFixed(0)),
      chord: PROGRESSION[this.chordIndex][0],
      voices: this.voices.map((v) => ({
        freq: Number(v.osc.frequency.value.toFixed(1)),
        type: v.osc.type,
        gain: Number(v.gain.gain.value.toFixed(4)),
        detune: Number(v.osc.detune.value.toFixed(2)),
      })),
      restored: this.restoredCount,
    };
  }

  dispose(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (!this.context) return;
    void this.context.close().catch(() => undefined);
    this.context = null;
    this.started = false;
  }
}

/** A decaying-noise impulse response — cheap, and enough to suggest a space. */
function makeImpulse(context: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = context.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const envelope = Math.pow(1 - i / length, decay);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
  }
  return buffer;
}

/** Low-passed noise, used as a near-inaudible air bed. */
function makeNoise(context: AudioContext, seconds: number): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = context.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let previous = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    previous = previous * 0.96 + white * 0.04;
    data[i] = previous * 3;
  }
  return buffer;
}

export const audio = new AudioEngine();

/** Keeps the soundtrack in step with progression, without re-subscribing React. */
export function useSparkAudio(restoredCount: number): void {
  audio.setRestoredCount(restoredCount);
}

export function applyAudioSettings(volume: number, music: number, muted: boolean): void {
  audio.setVolumes(volume, music, muted);
}
