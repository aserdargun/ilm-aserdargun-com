import * as THREE from 'three';
import type { RegionId } from '../types/catalog';

/**
 * What each region does when it is restored.
 *
 * The catalogue promises a visible effect for every region — light spreading
 * along a branch, routes drawn as light across a map, a council light
 * becoming a steady ring, the harbour's lights burning, flowers opening, the
 * mirrors sharpening, the pump coming to life. **Seven of the eight had none
 * of it.** Measured on the running build, restoring the Memory Council City
 * moved its own landmark by **0.4 luma**: the region was restored, the
 * counter moved, the stage was marked complete, and the landmark looked
 * exactly as it had. The game's own line is that every connection brings the
 * world to life, and for seven regions it did not.
 *
 * The part that lights up is not a choice of convenience but the part the
 * effect is *about*: the council's turquoise light, the gardens' flowers, the
 * terrace's landmasses, the loom's water, the mirrors' glass, the valley's
 * moving parts, the harbour's lit metal. The colour is the region's own
 * accent, from the palette the region was designed around, so the effect
 * belongs to the region rather than being the same turquoise everywhere.
 *
 * The hub is absent because it already has one — the tree's crown, and the
 * canal that fills with it — and it does it better than a lamp.
 */
export interface RestorationGlow {
  /** The material in the landmark's model that carries the light. */
  material: string;
  /** How brightly, as the material's emissive intensity. */
  emissive: number;
}

export const RESTORATION_GLOW: Partial<Record<RegionId, RestorationGlow>> = {
  'cartographers-terrace': { material: 'ceramic', emissive: 0.55 },
  'flow-foundry': { material: 'water', emissive: 0.4 },
  'memory-council-city': { material: 'turquoise_soft', emissive: 0.9 },
  'adaptation-cloud-harbor': { material: 'metal', emissive: 0.6 },
  'collective-gardens': { material: 'coral', emissive: 0.85 },
  'observers-mirrors': { material: 'glass', emissive: 0.45 },
  'valley-living-machines': { material: 'turquoise_soft', emissive: 0.8 },
};

/**
 * The landmark model each region's glow lives in.
 *
 * Duplicated from `World.tsx`'s table on purpose: the test needs to open the
 * right file, and a test that imports the component module would pull React
 * and the renderer in with it.
 */
export const RESTORATION_MODEL: Partial<Record<RegionId, string>> = {
  'cartographers-terrace': 'terrace_map',
  'flow-foundry': 'great_loom',
  'memory-council-city': 'council_city',
  'adaptation-cloud-harbor': 'cloud_harbour',
  'collective-gardens': 'collective_gardens',
  'observers-mirrors': 'observer_mirrors',
  'valley-living-machines': 'living_valley',
};

/**
 * How long the wave of light takes to cross a landmark, in seconds.
 */
export const RESTORATION_WAVE_SECONDS = 2.2;

/**
 * How far the wave travels, in world units.
 *
 * The landmarks are fifteen to twenty-five units across, so thirty covers
 * them with a margin and the wave does not visibly stop in mid-air.
 */
export const RESTORATION_WAVE_REACH = 30;

const WAVE_FLAG = 'ilmekRestorationWave';

/** The state one material's wave is in. */
export interface RestorationWave {
  /** How far the front has travelled, in world units. */
  front: number;
  /** Where the front is heading. */
  target: number;
  /** The centre the wave spreads from, in world XZ. */
  origin: THREE.Vector2;
  /** The uniform the shader reads, so the GPU sees the value move. */
  frontUniform: { value: number };
  /** The uniform the vertex shader reads. */
  originUniform: { value: THREE.Vector2 };
}

/**
 * Install a wave of light on a material.
 *
 * The catalogue's language is about process, not switches: light *spreads*
 * along a branch, routes *draw* as light across a map, the council light
 * becomes a *steady ring*. A lamp that comes on all at once says the region
 * was switched on; a wave that travels across it says the region woke up.
 *
 * The wave is written on the material's emissive, multiplied by a mask that
 * is one inside the front and zero outside it, and the front's distance is
 * measured in world units from the region's own centre. That is why it can be
 * the same wave for all seven regions: none of them needed a different one,
 * and a ring spreading out from the middle of the island is the shape all
 * seven of them describe.
 */
export function patchRestorationWave(
  material: THREE.MeshStandardMaterial,
  origin: THREE.Vector2,
): RestorationWave {
  const existing = material.userData[WAVE_FLAG] as RestorationWave | undefined;
  if (existing) {
    existing.origin.copy(origin);
    existing.originUniform.value.copy(origin);
    return existing;
  }

  const wave: RestorationWave = {
    front: RESTORATION_WAVE_REACH,
    target: RESTORATION_WAVE_REACH,
    origin: origin.clone(),
    frontUniform: { value: RESTORATION_WAVE_REACH },
    originUniform: { value: origin.clone() },
  };
  material.userData[WAVE_FLAG] = wave;

  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previous) previous.call(material, shader, renderer);
    shader.uniforms.uRestorationFront = wave.frontUniform;
    shader.uniforms.uRestorationOrigin = wave.originUniform;

    shader.vertexShader = `
      varying float vRestorationDistance;
      uniform vec2 uRestorationOrigin;
    ${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vRestorationDistance = length((modelMatrix * vec4(transformed, 1.0)).xz - uRestorationOrigin);`,
    );

    shader.fragmentShader = `
      varying float vRestorationDistance;
      uniform float uRestorationFront;
    ${shader.fragmentShader}`.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       totalEmissiveRadiance *= smoothstep(uRestorationFront, uRestorationFront - 6.0, vRestorationDistance);`,
    );
  };
  material.needsUpdate = true;
  return wave;
}

/**
 * Start the wave, or let the material's own light show through.
 *
 * The front at its reach means the mask is one everywhere, so a material that
 * was already glowing — the gardens' coral is emissive at 0.252 — keeps
 * exactly the light it had. The front at zero means nothing is lit yet, which
 * is where a wave starts.
 */
export function setRestorationWave(
  wave: RestorationWave,
  lit: boolean,
  animate: boolean,
): void {
  if (lit && animate) {
    wave.front = 0;
    wave.target = RESTORATION_WAVE_REACH;
  } else {
    wave.front = RESTORATION_WAVE_REACH;
    wave.target = RESTORATION_WAVE_REACH;
  }
  wave.frontUniform.value = wave.front;
}

/**
 * Move the wave's front towards its target.
 *
 * The step is clamped so a backgrounded tab does not resume with one enormous
 * jump, and the front never travels past its target.
 */
export function advanceRestorationWave(wave: RestorationWave, delta: number): void {
  if (wave.front === wave.target) return;
  const step = (RESTORATION_WAVE_REACH / RESTORATION_WAVE_SECONDS) * Math.min(delta, 0.1);
  wave.front =
    wave.front < wave.target
      ? Math.min(wave.target, wave.front + step)
      : Math.max(wave.target, wave.front - step);
  wave.frontUniform.value = wave.front;
}
