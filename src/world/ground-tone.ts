import * as THREE from 'three';

/**
 * The two ends of the ground's mottling, as HSL offsets from the region's stone.
 *
 * This is the only lever the ground has for large-scale value structure, and it
 * is worth spelling out why. The two tiled maps are capped at two world units —
 * anything painted into them repeats at that scale and reads as grain, not form.
 * The disc is flat by design (see `tests/disc.test.ts`), so it casts no shadow on
 * itself and cannot shade itself either. What is left is per-vertex colour, so
 * the size of this gap *is* the size of the ground's large-scale structure.
 *
 * Measured on the opening frame — the first thing a desktop player sees, and 59%
 * ground by pixel count — the gap was 0.12. That put the mottling at 4.8% in
 * vertex space and 5.4% between 400px cells, which is the same amplitude as the
 * fine grain of the tile underneath it: the surface read as one flat tone across
 * more than half the picture. Doubling the gap took the 400px figure to 6.4%.
 *
 * The numbers below are deliberately not tuned past that. Tripling it measured
 * only 6.7% and started reading as staining rather than sand.
 */
export const GROUND_WARM_OFFSET = { h: 0.012, s: 0.04, l: 0.1 };
export const GROUND_COOL_OFFSET = { h: -0.02, s: -0.02, l: -0.14 };

/** The lightness distance between the two ends, in HSL. */
export const GROUND_TONE_GAP =
  GROUND_WARM_OFFSET.l - GROUND_COOL_OFFSET.l;

export interface GroundToneEnds {
  base: THREE.Color;
  warm: THREE.Color;
  cool: THREE.Color;
  /** HSL lightness of each end after conversion — the values that can clamp. */
  baseL: number;
  warmL: number;
  coolL: number;
}

/**
 * Resolves the mottling's two endpoints for a region's stone colour.
 *
 * Kept separate from the component so the clamp guard has something to call: a
 * gap wide enough to matter can also push a light palette's warm end off the top
 * of the lightness range, where `offsetHSL` saturates and the two ends silently
 * collapse back toward each other. That failure is invisible in a screenshot
 * and expensive to find later.
 */
export function groundToneEnds(stone: string): GroundToneEnds {
  const base = new THREE.Color(stone);
  const warm = base.clone().offsetHSL(GROUND_WARM_OFFSET.h, GROUND_WARM_OFFSET.s, GROUND_WARM_OFFSET.l);
  const cool = base.clone().offsetHSL(GROUND_COOL_OFFSET.h, GROUND_COOL_OFFSET.s, GROUND_COOL_OFFSET.l);

  // `offsetHSL` reads and writes lightness in sRGB, so `getHSL` has to be asked
  // for sRGB too — the working space would report a different, lower number and
  // the guard below would be testing something nobody renders.
  const hsl = (c: THREE.Color) => ({ l: c.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).l });
  return {
    base,
    warm,
    cool,
    baseL: hsl(base).l,
    warmL: hsl(warm).l,
    coolL: hsl(cool).l,
  };
}