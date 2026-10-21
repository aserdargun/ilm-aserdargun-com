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
