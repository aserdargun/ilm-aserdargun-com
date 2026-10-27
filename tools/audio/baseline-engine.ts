/**
 * The ambient bed as it sounded *before* the calming pass, frozen here so the
 * change can be measured instead of asserted.
 *
 * This is a copy of `src/game/audio.ts` at the commit before the calming
 * work, with three additions and no change to the sound itself:
 *
 *  1. `build()` takes a `BaseAudioContext` instead of creating its own, so the
 *     same graph can be rendered into an `OfflineAudioContext` and measured
 *     sample by sample.
 *  2. The chord schedule and the chime take an explicit time, because an
 *     offline context's clock never advances while it renders.
 *  3. The reverb impulse and the noise floor use a seeded generator, so two
 *     runs of the same measurement produce the same numbers.
 *
 * Nothing here ships. The game plays `src/game/audio.ts`; this file exists so
 * `tools/audio/probe.html` can render both engines side by side.
 */

const PROGRESSION: readonly (readonly number[])[] = [
  [110.0, 220.0, 261.63, 329.63, 493.88],
  [87.31, 220.0, 261.63, 329.63, 440.0],
  [98.0, 246.94, 293.66, 392.0, 493.88],
  [82.41, 196.0, 246.94, 293.66, 392.0],
];

const VOICES = PROGRESSION[0].length;

const CHORD_HOLD = 26;
const CHORD_GLIDE = 7;

const LEVELS = [0.055, 0.078, 0.086, 0.079, 0.058];

const TYPES: readonly OscillatorType[] = ['sine', 'sine', 'sine', 'triangle', 'triangle'];

const DETUNE_CENTS = [3, 4, 5, 6, 7];
const DETUNE_RATES = [0.021, 0.017, 0.013, 0.011, 0.009];

const BREATH_FRACTION = 0.18;
const BREATH_RATES = [0.043, 0.037, 0.031, 0.027, 0.023];

const CUTOFF_DARK = 820;
const CUTOFF_PER_REGION = 190;
const CUTOFF_BRIGHTEST = 2800;
const HIGHPASS_HZ = 55;

const MUSIC_VOLUME = 0.35;
const MASTER_VOLUME = 0.5;

/** Seeded noise, so a measurement of this engine can be repeated exactly. */
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

function makeImpulse(context: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = context.createBuffer(2, length, rate);
  const random = seeded(0x1a2b3c);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const envelope = Math.pow(1 - i / length, decay);
      data[i] = (random() * 2 - 1) * envelope;
    }
  }
  return buffer;
}

function makeNoise(context: BaseAudioContext, seconds: number): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = context.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const random = seeded(0x5f3759df);
  let previous = 0;
  for (let i = 0; i < length; i += 1) {
    const white = random() * 2 - 1;
    previous = previous * 0.96 + white * 0.04;
    data[i] = previous * 3;
  }
  return buffer;
}

interface BaselineVoice {
  osc: OscillatorNode;
  gain: GainNode;
}

class BaselineEngine {
  context: BaseAudioContext | null = null;
  master: GainNode | null = null;
  bus: GainNode | null = null;
  filter: BiquadFilterNode | null = null;
  voices: BaselineVoice[] = [];
  chordIndex = 0;
  nextChordAt = 0;

  build(context: BaseAudioContext, withPad = true): void {
    const master = context.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(context.destination);

    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 12;
    limiter.ratio.value = 3;
    limiter.attack.value = 0.01;
    limiter.release.value = 0.25;
    limiter.connect(master);

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = CUTOFF_DARK;
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
    bus.gain.value = MUSIC_VOLUME;
    bus.connect(filter);

    const voices: BaselineVoice[] = [];
    for (let i = 0; withPad && i < VOICES; i += 1) {
      const osc = context.createOscillator();
      osc.type = TYPES[i];
      osc.frequency.value = PROGRESSION[0][i];

      const gain = context.createGain();
      gain.gain.value = LEVELS[i];

      const detuneLfo = context.createOscillator();
      detuneLfo.frequency.value = DETUNE_RATES[i];
      const detuneDepth = context.createGain();
      detuneDepth.gain.value = DETUNE_CENTS[i];
      detuneLfo.connect(detuneDepth);
      detuneDepth.connect(osc.detune);
      detuneLfo.start();

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
    this.nextChordAt = 0;
  }

  advanceChord(now: number): void {
    const to = (this.chordIndex + 1) % PROGRESSION.length;
    const start = now + 0.05;
    for (let i = 0; i < this.voices.length; i += 1) {
      const freq = this.voices[i].osc.frequency;
      freq.cancelScheduledValues(now);
      freq.setValueAtTime(freq.value, start);
      freq.exponentialRampToValueAtTime(PROGRESSION[to][i], start + CHORD_GLIDE);
    }
    this.chordIndex = to;
    this.nextChordAt = now + CHORD_HOLD;
  }

  chime(at: number): void {
    if (!this.context || !this.bus) return;
    const context = this.context;
    const start = at;
    const arpeggio: readonly number[] = [440, 523.25, 659.25, 880];
    arpeggio.forEach((frequency, index) => {
      const when = start + index * 0.085;
      const osc = context.createOscillator();
      osc.type = index === arpeggio.length - 1 ? 'triangle' : 'sine';
      osc.frequency.value = frequency;
      const gain = context.createGain();
      const peak = 0.075 / (1 + index * 0.45);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(peak, when + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 2.6);
      osc.connect(gain);
      gain.connect(this.bus!);
      osc.start(when);
      osc.stop(when + 2.8);
    });
  }
}

export async function renderBedOffline(seconds: number, sampleRate = 48000): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const engine = new BaselineEngine();
  engine.build(context);
  let when = engine.nextChordAt;
  while (when < seconds) {
    engine.advanceChord(when);
    when = engine.nextChordAt;
  }
  return context.startRendering();
}

export async function renderChimeOffline(seconds: number, sampleRate = 48000): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const engine = new BaselineEngine();
  // The pad is left out so the chime is measured on its own, rather than on
  // top of the bed it is played over.
  engine.build(context, false);
  engine.chime(0.2);
  return context.startRendering();
}
