/**
 * The measurement probe.
 *
 * Loaded by `tools/audio/probe.html` through the dev server, so the engines
 * under test are the real modules — the same files the game imports — and not
 * a re-implementation of them.
 *
 * The live engine is imported dynamically: before the calming pass it had no
 * offline render at all, and a missing export must not take the whole probe
 * down with it.
 */

import {
  chimeAnalysis,
  levelAnalysis,
  modulationAnalysis,
  roughnessAnalysis,
  spectrumAnalysis,
} from './analysis.js';
import {
  renderBedOffline as renderBaselineBed,
  renderChimeOffline as renderBaselineChime,
} from './baseline-engine.ts';

let live = null;
let liveError = null;

async function loadLive() {
  if (live || liveError) return live;
  try {
    live = await import('../../src/game/audio.ts');
  } catch (error) {
    liveError = String(error);
  }
  return live;
}

/** Render one engine's bed and chime, and measure both. */
async function measure(engine, seconds) {
  const from = Math.min(40, seconds * 0.25);
  const bed = await engine.renderBedOffline(seconds);
  // The same bed without the bells, so the pad can be compared on its own.
  const pad = await engine.renderBedOffline(seconds, 48000, false);
  const chime = await engine.renderChimeOffline(4);
  return {
    bed: {
      modulation: modulationAnalysis(bed, from, seconds),
      roughness: roughnessAnalysis(bed, from, seconds),
      spectrum: spectrumAnalysis(bed, from, seconds),
      levels: levelAnalysis(bed),
    },
    pad: {
      modulation: modulationAnalysis(pad, from, seconds),
      roughness: roughnessAnalysis(pad, from, seconds),
      spectrum: spectrumAnalysis(pad, from, seconds),
      levels: levelAnalysis(pad),
    },
    chime: chimeAnalysis(chime, 0.2),
  };
}

const params = new URLSearchParams(location.search);

window.__ilmAudioProbe = async (which = params.get('engine') ?? 'baseline', seconds = Number(params.get('seconds') ?? 200)) => {
  const engines = { baseline: { renderBedOffline: renderBaselineBed, renderChimeOffline: renderBaselineChime } };
  if (which === 'live' || which === 'both') {
    const module = await loadLive();
    if (!module) return { error: `live engine unavailable: ${liveError}` };
    engines.live = module;
  }
  if (which === 'both') {
    return {
      baseline: await measure(engines.baseline, seconds),
      live: await measure(engines.live, seconds),
    };
  }
  const engine = engines[which] ?? engines.baseline;
  return measure(engine, seconds);
};

window.__ilmAudioReady = true;
