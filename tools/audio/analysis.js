/**
 * Measurement code for the ambient bed.
 *
 * The bed is synthesised, so nothing about it is visible on screen and no test
 * can fail because of it. It has to be *measured*: rendered offline, then read
 * as numbers. This module is that reader.
 *
 * The metrics were chosen because each one names a specific irritation:
 *
 *  - **modulation depth** — how far the loudness wanders, as a fraction of
 *    its own mean. A steady bed sits near zero; a bed that swells and fades
 *    reads as breathing, and one that swells *irregularly* reads as unease.
 *  - **the modulation spectrum** — which rates do the wandering. The old bed
 *    carried five breath oscillators and five detune oscillators at rates
 *    between 0.009 Hz and 0.043 Hz, all incommensurate, so the loudness never
 *    repeated and never settled.
 *  - **roughness energy** — modulation between 30 Hz and 100 Hz. This is the
 *    band where beating between two close tones is heard as roughness rather
 *    than as motion.
 *  - **spectral centroid and band energy** — where the sound sits. A bright
 *    reverb and a 1.8 kHz noise floor push energy up into the band where the
 *    ear is most sensitive to irritation.
 */

/** In-place iterative radix-2 FFT. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let start = 0; start < n; start += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k += 1) {
        const ar = re[start + k];
        const ai = im[start + k];
        const br = re[start + k + half] * cr - im[start + k + half] * ci;
        const bi = re[start + k + half] * ci + im[start + k + half] * cr;
        re[start + k] = ar + br;
        im[start + k] = ai + bi;
        re[start + k + half] = ar - br;
        im[start + k + half] = ai - bi;
        const nextCr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nextCr;
      }
    }
  }
}

/** Next power of two at or above `n`. */
function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[index];
}

/** Mix to mono and copy out of the buffer. */
function toMono(buffer) {
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const out = new Float64Array(left.length);
  for (let i = 0; i < left.length; i += 1) out[i] = 0.5 * (left[i] + right[i]);
  return out;
}

function rms(signal, start, length) {
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    const v = signal[start + i];
    sum += v * v;
  }
  return Math.sqrt(sum / Math.max(1, length));
}

function db(value) {
  return 20 * Math.log10(Math.max(value, 1e-12));
}

/**
 * How the loudness wanders, and at which rates.
 *
 * The envelope is a short-time RMS: 200 ms windows, 50 ms hops, so the
 * spectrum that follows resolves rates down to about 0.005 Hz — slow enough to
 * separate the old bed's five breathing oscillators from one another.
 */
export function modulationAnalysis(buffer, fromSec = 40, toSec = 200) {
  const sampleRate = buffer.sampleRate;
  const signal = toMono(buffer);
  const win = Math.round(0.2 * sampleRate);
  const hop = Math.round(0.05 * sampleRate);
  const start = Math.round(fromSec * sampleRate);
  const end = Math.min(signal.length, Math.round(toSec * sampleRate));
  const frames = Math.max(0, Math.floor((end - start - win) / hop));
  if (frames < 64) throw new Error('not enough audio for a modulation measurement');

  const envelope = new Float64Array(frames);
  for (let f = 0; f < frames; f += 1) {
    envelope[f] = rms(signal, start + f * hop, win);
  }

  const sorted = [...envelope].sort((a, b) => a - b);
  const mean = envelope.reduce((a, b) => a + b, 0) / frames;
  const p5 = percentile(sorted, 0.05);
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);

  const size = nextPow2(frames);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < frames; i += 1) re[i] = envelope[i] - mean;
  fft(re, im);

  const binRate = sampleRate / hop / size;
  const half = size >> 1;
  const magnitude = new Float64Array(half);
  for (let i = 0; i < half; i += 1) magnitude[i] = Math.hypot(re[i], im[i]);

  const bandEnergy = (fromHz, toHz) => {
    const from = Math.max(1, Math.round(fromHz / binRate));
    const to = Math.min(half - 1, Math.round(toHz / binRate));
    let sum = 0;
    for (let i = from; i <= to; i += 1) sum += magnitude[i] ** 2;
    return sum;
  };

  // Bin 1 holds the drift of the whole measurement — the window's own trend —
  // and it dwarfs every real rate, so it is left out of the totals.
  const total = bandEnergy(2 * binRate, sampleRate / 2);
  const slow = bandEnergy(2 * binRate, 0.5);
  const mid = bandEnergy(0.5, 5);
  const rough = bandEnergy(30, 100);
  const fast = bandEnergy(100, sampleRate / 2);

  // The loudest modulation rates, as peaks in the envelope spectrum. The
  // threshold is relative to the strongest peak in the slow band, not to the
  // first bin: bin 1 holds the drift of the whole measurement and would
  // swallow everything.
  let strongest = 0;
  for (let i = 2; i < Math.min(half, Math.round(0.5 / binRate)); i += 1) {
    if (magnitude[i] > strongest) strongest = magnitude[i];
  }
  const peaks = [];
  for (let i = 2; i < half - 1; i += 1) {
    const value = magnitude[i];
    if (value <= magnitude[i - 1] || value < magnitude[i + 1]) continue;
    if (value < strongest * 0.08) continue;
    peaks.push({
      hz: Number((i * binRate).toFixed(6)),
      periodSec: Number((1 / (i * binRate)).toFixed(2)),
      amplitude: Number(value.toFixed(4)),
    });
  }
  peaks.sort((a, b) => b.amplitude - a.amplitude);

  // Regularity: does the bed breathe on a period, or does it wander?
  //
  // A bed that swells on a cycle repeats itself, and the envelope's
  // autocorrelation shows that cycle as a peak. A bed that wanders — the
  // swell moving at rates that share no period with each other — has no
  // such peak, and that is the difference between breathing and seasickness.
  const step = 4;
  const coarse = [];
  for (let i = 0; i < frames; i += step) coarse.push(envelope[i] - mean);
  let energy = 0;
  for (const value of coarse) energy += value * value;
  // The coarse envelope is sampled every `hop * step` audio samples.
  const perSecond = sampleRate / (hop * step);
  let bestLag = 0;
  let bestValue = 0;
  if (energy > 0) {
    const minLag = Math.max(1, Math.round(5 * perSecond));
    const maxLag = Math.min(coarse.length - 1, Math.round(120 * perSecond));
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let sum = 0;
      for (let i = 0; i + lag < coarse.length; i += 1) sum += coarse[i] * coarse[i + lag];
      const value = sum / energy;
      if (value > bestValue) {
        bestValue = value;
        bestLag = lag;
      }
    }
  }

  return {
    windowSec: [fromSec, toSec],
    meanDb: Number(db(mean).toFixed(2)),
    medianDb: Number(db(p50).toFixed(2)),
    p5Db: Number(db(p5).toFixed(2)),
    p95Db: Number(db(p95).toFixed(2)),
    /** How far the loudness wanders, as a fraction of its own mean. */
    modulationDepth: Number(((p95 - p5) / mean).toFixed(4)),
    /** The same measure in decibels, which is how loudness is judged. */
    modulationDepthDb: Number((db(p95) - db(p5)).toFixed(2)),
    /** The period the loudness repeats on, if it repeats at all. */
    envelopePeriodSec: bestLag ? Number(((bestLag / perSecond).toFixed(2))) : null,
    /** How strongly it repeats on that period: 1 is a metronome. */
    envelopeRegularity: Number(bestValue.toFixed(3)),
    slowShare: Number((slow / total).toFixed(4)),
    midShare: Number((mid / total).toFixed(4)),
    roughnessShare: Number((rough / total).toFixed(4)),
    fastShare: Number((fast / total).toFixed(4)),
    peaks: peaks.slice(0, 6),
  };
}

/**
 * Roughness: the flutter between two notes that are close together.
 *
 * A 200-millisecond envelope cannot see this. Two voices a fifth apart beat
 * against each other at their frequency difference — 68 Hz for C4 and E4 —
 * and that beat is what the ear hears as a buzz, long before it is heard as
 * a wobble. The envelope here is short enough (3 ms) to follow it, and the
 * spectrum is read between 15 Hz and 200 Hz, which is where beating lives.
 *
 * The depth of the beat is the difference between the quietest and loudest
 * point of the flutter, so it is reported for the strongest pair as well.
 */
export function roughnessAnalysis(buffer, fromSec = 40, toSec = 200) {
  const sampleRate = buffer.sampleRate;
  const signal = toMono(buffer);
  const win = Math.round(0.003 * sampleRate);
  const hop = Math.round(0.0015 * sampleRate);
  const start = Math.round(fromSec * sampleRate);
  const end = Math.min(signal.length, Math.round(toSec * sampleRate));
  const frames = Math.max(0, Math.floor((end - start - win) / hop));
  if (frames < 256) throw new Error('not enough audio for a roughness measurement');

  const envelope = new Float64Array(frames);
  for (let f = 0; f < frames; f += 1) envelope[f] = rms(signal, start + f * hop, win);

  const size = nextPow2(frames);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const mean = envelope.reduce((a, b) => a + b, 0) / frames;
  for (let i = 0; i < frames; i += 1) re[i] = envelope[i] - mean;
  fft(re, im);

  const binRate = sampleRate / hop / size;
  const half = size >> 1;
  const magnitude = new Float64Array(half);
  for (let i = 0; i < half; i += 1) magnitude[i] = Math.hypot(re[i], im[i]);

  const bandEnergy = (fromHz, toHz) => {
    const from = Math.max(1, Math.round(fromHz / binRate));
    const to = Math.min(half - 1, Math.round(toHz / binRate));
    let sum = 0;
    for (let i = from; i <= to; i += 1) sum += magnitude[i] ** 2;
    return sum;
  };

  const total = bandEnergy(15, 400);
  const rough = bandEnergy(15, 100);

  let strongest = 0;
  for (let i = Math.round(15 / binRate); i < Math.round(200 / binRate); i += 1) {
    if (magnitude[i] > strongest) strongest = magnitude[i];
  }

  const peaks = [];
  for (let i = 2; i < half - 1; i += 1) {
    const hz = i * binRate;
    if (hz < 15 || hz > 200) continue;
    const value = magnitude[i];
    if (value <= magnitude[i - 1] || value < magnitude[i + 1]) continue;
    if (value < strongest * 0.12) continue;
    peaks.push({ hz: Number(hz.toFixed(2)), amplitude: Number(value.toFixed(3)) });
  }
  peaks.sort((a, b) => b.amplitude - a.amplitude);

  // How deep the flutter is, as a modulation index.
  //
  // A tone whose amplitude is modulated by `m` puts `m / 2` of its own
  // amplitude into each sideband, so the index follows from the strongest
  // peak in the envelope spectrum without rebuilding the envelope.
  let depthDb = 0;
  let index = 0;
  if (peaks.length > 0 && strongest > 0) {
    index = (2 * strongest) / size / mean;
    depthDb = Number((db(1 + index) - db(1 - index)).toFixed(2));
  }

  return {
    roughnessShare: Number((rough / Math.max(total, 1e-30)).toFixed(4)),
    flutterIndex: Number(index.toFixed(4)),
    flutterDepthDb: depthDb,
    peaks: peaks.slice(0, 8),
  };
}

/**
 * Where the energy sits, measured as a Welch periodogram.
 *
 * A single long FFT of a signal that drifts would smear the chords across
 * bins, so the spectrum is averaged over 2.7-second windows.
 */
export function spectrumAnalysis(buffer, fromSec = 40, toSec = 200) {
  const sampleRate = buffer.sampleRate;
  const signal = toMono(buffer);
  const size = 1 << 17;
  const hop = size >> 1;
  const start = Math.round(fromSec * sampleRate);
  const end = Math.min(signal.length, Math.round(toSec * sampleRate));

  const window = new Float64Array(size);
  for (let i = 0; i < size; i += 1) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);

  const half = size >> 1;
  const average = new Float64Array(half);
  let segments = 0;
  for (let offset = start; offset + size <= end; offset += hop) {
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < size; i += 1) re[i] = signal[offset + i] * window[i];
    fft(re, im);
    for (let i = 0; i < half; i += 1) average[i] += (re[i] ** 2 + im[i] ** 2) / (size * size);
    segments += 1;
  }
  if (segments === 0) throw new Error('not enough audio for a spectrum measurement');
  for (let i = 0; i < half; i += 1) average[i] /= segments;

  const binHz = sampleRate / size;
  const bandDb = (fromHz, toHz) => {
    const from = Math.max(1, Math.round(fromHz / binHz));
    const to = Math.min(half - 1, Math.round(toHz / binHz));
    let sum = 0;
    for (let i = from; i <= to; i += 1) sum += average[i];
    const total = average.reduce((a, b) => a + b, 0);
    return Number((10 * Math.log10(Math.max(sum, 1e-30) / Math.max(total, 1e-30))).toFixed(2));
  };

  let weighted = 0;
  let total = 0;
  for (let i = 1; i < half; i += 1) {
    weighted += i * binHz * average[i];
    total += average[i];
  }

  return {
    windowSec: [fromSec, toSec],
    centroidHz: Number((weighted / Math.max(total, 1e-30)).toFixed(1)),
    bandsDb: {
      '0-200': bandDb(0, 200),
      '200-500': bandDb(200, 500),
      '500-1000': bandDb(500, 1000),
      '1000-2000': bandDb(1000, 2000),
      '1600-2400': bandDb(1600, 2400),
      '2000-4000': bandDb(2000, 4000),
      '4000-8000': bandDb(4000, 8000),
      '8000+': bandDb(8000, sampleRate / 2),
    },
  };
}

/**
 * The confirmation tone.
 *
 * A jingle is not a chime: four notes in 340 ms is an alert, and an alert in a
 * contemplative game lands like a notification. What matters is how many
 * attacks arrive, how far apart they are, and whether the pitch climbs.
 */
export function chimeAnalysis(buffer, triggerSec = 0.2) {
  const sampleRate = buffer.sampleRate;
  const signal = toMono(buffer);
  const win = Math.round(0.01 * sampleRate);
  const hop = Math.round(0.005 * sampleRate);
  const frames = Math.floor((signal.length - win) / hop);
  const envelope = new Float64Array(frames);
  for (let f = 0; f < frames; f += 1) envelope[f] = rms(signal, f * hop, win);

  let peak = 0;
  let peakIndex = 0;
  for (let f = 0; f < frames; f += 1) {
    if (envelope[f] > peak) {
      peak = envelope[f];
      peakIndex = f;
    }
  }

  // Attacks, found in the rise of the envelope rather than in its level:
  // four notes in 340 ms never let the envelope fall back far enough for a
  // level threshold to separate them.
  const flux = new Float64Array(frames);
  let maxFlux = 0;
  for (let f = 1; f < frames; f += 1) {
    flux[f] = Math.max(0, envelope[f] - envelope[f - 1]);
    if (flux[f] > maxFlux) maxFlux = flux[f];
  }
  const onsets = [];
  if (maxFlux > 0) {
    for (let f = 2; f < frames - 1; f += 1) {
      if (flux[f] < maxFlux * 0.3) continue;
      if (flux[f] < flux[f - 1] || flux[f] < flux[f + 1]) continue;
      const time = (f * hop) / sampleRate;
      if (onsets.length && time - onsets[onsets.length - 1] < 0.06) continue;
      onsets.push(time);
    }
  }

  // The pitch of a note, taken from the strongest partial in the range the
  // game uses. A centroid is no use here: a bell's second partial is louder
  // than its fundamental, so the centroid would report twice the note.
  const pitchAt = (fromSec) => {
    const size = 1 << 13;
    const offset = Math.round(fromSec * sampleRate);
    if (offset + size > signal.length) return 0;
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < size; i += 1) {
      re[i] = signal[offset + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
    }
    fft(re, im);
    const low = Math.max(1, Math.round((150 * size) / sampleRate));
    const high = Math.min((size >> 1) - 1, Math.round((1200 * size) / sampleRate));
    let best = 0;
    let bestIndex = low;
    for (let i = low; i <= high; i += 1) {
      const magnitude = Math.hypot(re[i], im[i]);
      if (magnitude > best) {
        best = magnitude;
        bestIndex = i;
      }
    }
    return (bestIndex * sampleRate) / size;
  };

  // How bright the tone is at its start and at its end: a rising figure is
  // urgent, a falling or level one settles.
  const centroidAt = (fromSec, toSec) => {
    const size = 1 << 13;
    const offset = Math.round(fromSec * sampleRate);
    if (offset + size > signal.length) return 0;
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < size; i += 1) {
      re[i] = signal[offset + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
    }
    fft(re, im);
    let weighted = 0;
    let total = 0;
    for (let i = 1; i < size >> 1; i += 1) {
      const magnitude = Math.hypot(re[i], im[i]);
      weighted += ((i * sampleRate) / size) * magnitude;
      total += magnitude;
    }
    return weighted / Math.max(total, 1e-30);
  };

  const gaps = [];
  for (let i = 1; i < onsets.length; i += 1) gaps.push((onsets[i] - onsets[i - 1]) * 1000);

  // The pitch of each note, taken from the moment it strikes.
  const pitches = onsets.map((time) => Math.round(pitchAt(time + 0.01)));
  const first = onsets.length ? onsets[0] : triggerSec;

  return {
    peakDb: Number(db(peak).toFixed(2)),
    /** Time from the first attack to the loudest point of the tone. */
    riseMs: Number(((peakIndex * hop) / sampleRate - first) * 1000).toFixed(1),
    onsets: onsets.length,
    onsetTimesMs: onsets.map((t) => Number((t * 1000).toFixed(0))),
    minGapMs: gaps.length ? Number(Math.min(...gaps).toFixed(1)) : null,
    pitchesHz: pitches,
    /** How far the figure climbs: above 1.5 is an alarm, near 1 is a settle. */
    pitchRatio: pitches.length > 1 ? Number((pitches[pitches.length - 1] / pitches[0]).toFixed(3)) : 1,
    centroidStartHz: Number(centroidAt(triggerSec + 0.02, triggerSec + 0.14).toFixed(0)),
    centroidEndHz: Number(centroidAt(triggerSec + 0.9, triggerSec + 1.02).toFixed(0)),
  };
}

/** Peak and RMS of the whole render, in decibels. */
export function levelAnalysis(buffer) {
  const signal = toMono(buffer);
  let peak = 0;
  for (let i = 0; i < signal.length; i += 1) {
    const v = Math.abs(signal[i]);
    if (v > peak) peak = v;
  }
  return {
    peakDb: Number(db(peak).toFixed(2)),
    rmsDb: Number(db(rms(signal, 0, signal.length)).toFixed(2)),
  };
}
