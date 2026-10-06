/**
 * Audio.
 *
 * Everything is synthesised with the Web Audio API: no asset downloads, no
 * licences. Audio only starts after a real user gesture, as browsers require.
 *
 * Design rule: every voice is tuned to a common chord and reaches the output
 * through a lowpass and a generated reverb. Independently detuned oscillators
 * were the previous approach and produced a harsh, clashing buzz — consonant
 * partials plus generous filtering are what make an ambient bed feel calm.
 *
 * The bed is quiet by design. It should sit under the game, not compete with it.
 */

/** A minor-ish open chord. Every layer is a chord tone or a soft octave. */
const ROOT = 110; // A2
const CHORD: readonly number[] = [
  ROOT,            // root
  ROOT * 1.5,      // fifth (A3)
  ROOT * 2,        // octave (A4)
  ROOT * 3,        // twelfth (A5)
  ROOT * 4,        // double octave (A6)
];

/**
 * Maximum regions that can add a voice. Seven regions plus the hub all fit
 * inside the five chord tones without doubling up on a frequency.
 */
const MAX_VOICES = 8;

class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private voices: { osc: OscillatorNode; gain: GainNode }[] = [];
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

      // master -> output. Kept conservative: this is ambience, not a score.
      const master = context.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      master.connect(context.destination);

      // One shared lowpass keeps every voice soft and removes any harshness.
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.Q.value = 0.4;
      filter.connect(master);

      // Slow filter sweep gives the bed motion without any rhythm.
      const sweep = context.createOscillator();
      const sweepDepth = context.createGain();
      sweep.frequency.value = 0.035;
      sweepDepth.gain.value = 260;
      sweep.connect(sweepDepth);
      sweepDepth.connect(filter.frequency);
      sweep.start();

      // A generated impulse response gives the world some size.
      const reverb = context.createConvolver();
      reverb.buffer = makeImpulse(context, 3.2, 2.4);
      const wet = context.createGain();
      wet.gain.value = 0.5;
      reverb.connect(wet);
      wet.connect(master);

      const bus = context.createGain();
      bus.gain.value = this.musicVolume;
      bus.connect(filter);
      bus.connect(reverb);

      // Chord voices. Each is a chord tone with a slow, offset tremolo so the
      // pad breathes instead of sitting as a flat drone.
      const voices: { osc: OscillatorNode; gain: GainNode }[] = [];
      CHORD.forEach((frequency, index) => {
        const osc = context.createOscillator();
        osc.type = index < 2 ? 'sine' : 'triangle';
        osc.frequency.value = frequency;

        const gain = context.createGain();
        gain.gain.value = 0;

        const tremolo = context.createOscillator();
        tremolo.frequency.value = 0.05 + index * 0.017;
        const tremoloDepth = context.createGain();
        tremoloDepth.gain.value = 0.035;
        tremolo.connect(tremoloDepth);
        tremoloDepth.connect(gain.gain);
        tremolo.start();

        osc.connect(gain);
        gain.connect(bus);
        osc.start();

        voices.push({ osc, gain });
      });

      // A very quiet filtered-noise floor removes digital silence.
      const noise = context.createBufferSource();
      noise.buffer = makeNoise(context, 4);
      noise.loop = true;
      const noiseFilter = context.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 480;
      noiseFilter.Q.value = 0.7;
      const noiseGain = context.createGain();
      noiseGain.gain.value = 0.012;
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(bus);
      noise.start();

      this.context = context;
      this.master = master;
      this.bus = bus;
      this.voices = voices;
      this.started = true;
      this.applyLayerCount(this.restoredCount);
      void context.resume();
    } catch {
      // Audio is a nicety: a blocked or unavailable context must never stop
      // the game from running.
      this.started = false;
    }
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
  }

  get music(): GainNode | null {
    return this.bus;
  }

  /** One chord voice per restored region, plus the base pad. */
  setRestoredCount(count: number): void {
    this.restoredCount = Math.max(0, Math.min(MAX_VOICES - 3, count));
    if (!this.started) return;
    this.applyLayerCount(this.restoredCount);
  }

  private applyLayerCount(count: number): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.voices.forEach((voice, index) => {
      // The first three voices are the base pad and always present; each extra
      // restored region brings in one more, and never more than eight voices.
      const active = index < 3 + count;
      const level = active ? [0.05, 0.035, 0.022, 0.016][index % 4] : 0;
      voice.gain.gain.setTargetAtTime(level, now, 2.2);
    });
  }

  /**
   * A soft confirmation tone: two chord tones struck and left to ring into the
   * reverb. Deliberately quiet and short.
   */
  chime(): void {
    if (!this.started || !this.context || !this.bus) return;
    const context = this.context;
    const now = context.currentTime;
    [CHORD[2], CHORD[3]].forEach((frequency, index) => {
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      const gain = context.createGain();
      const peak = index === 0 ? 0.05 : 0.028;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.04 + index * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
      osc.connect(gain);
      gain.connect(this.bus!);
      osc.start(now);
      osc.stop(now + 2.4);
    });
  }

  /** Dev-only snapshot of the live graph, used to verify the mix by eye. */
  debugSnapshot(): Record<string, unknown> | null {
    if (!this.started || !this.context) return null;
    return {
      master: this.master?.gain.value,
      music: this.bus?.gain.value,
      voices: this.voices.map((v) => ({
        freq: Number(v.osc.frequency.value.toFixed(1)),
        type: v.osc.type,
        gain: Number(v.gain.gain.value.toFixed(4)),
      })),
      restored: this.restoredCount,
    };
  }

  dispose(): void {
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