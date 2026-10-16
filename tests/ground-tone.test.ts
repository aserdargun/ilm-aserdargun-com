import { describe, expect, it } from 'vitest';
import { REGIONS } from '../src/catalog/regions';
import { GROUND_TONE_GAP, groundToneEnds } from '../src/world/ground-tone';
import {
  GROUND_MACRO_AMPLITUDE,
  GROUND_MACRO_PERIOD,
} from '../src/world/ground-macro';

/**
 * The ground's large-scale value structure is one number wide, and the two ways
 * it can silently disappear are both invisible in a screenshot.
 *
 * The first is regression: the gap was 0.12 and measured 5.4% between 400px
 * cells, which is the same amplitude as the fine grain of the tiled maps under
 * it — the ground read as one flat tone across 59% of the opening frame. Nobody
 * reviewing a screenshot would call that broken, which is exactly why it needs a
 * floor with a number on it.
 *
 * The second is saturation. Widening the gap can push a light palette's warm end
 * off the top of the lightness range, where `offsetHSL` clamps and the two ends
 * quietly collapse back together — the mottling amplitude would be gone again,
 * and again with no visual signature.
 */

describe('ground mottling endpoints', () => {
  it('keeps the gap wide enough to survive lighting', () => {
    // 0.12 was the shipped defect; 0.24 measured 6.4% at 400px against 5.4%.
    expect(GROUND_TONE_GAP).toBeGreaterThanOrEqual(0.2);
  });

  it('does not clamp either end, for any region palette', () => {
    for (const region of REGIONS) {
      const { warmL, coolL } = groundToneEnds(region.palette.stone);
      const tag = `${region.id} (${region.palette.stone})`;
      expect(warmL, `${tag}: warm end hit the top`).toBeLessThan(1);
      expect(coolL, `${tag}: cool end hit the bottom`).toBeGreaterThan(0);
    }
  });

  it('orders the ends the way the lerp reads them', () => {
    for (const region of REGIONS) {
      const { baseL, warmL, coolL } = groundToneEnds(region.palette.stone);
      const tag = region.id;
      expect(warmL, `${tag}: warm end is not lighter than base`).toBeGreaterThan(baseL);
      expect(coolL, `${tag}: cool end is not darker than base`).toBeLessThan(baseL);
    }
  });

  it('reproduces the full gap after conversion, not before', () => {
    // The offsets are applied in HSL and then converted back, so the realised
    // gap is narrower than the nominal one. If it collapsed, the guard above
    // would still be green while the frame went flat again.
    for (const region of REGIONS) {
      const { warmL, coolL } = groundToneEnds(region.palette.stone);
      expect(warmL - coolL, `${region.id}: realised gap collapsed`).toBeGreaterThan(0.1);
    }
  });
});

describe('macro variation period', () => {
  it('outruns every island, so the map cannot repeat inside one', () => {
    // The macro field is sampled once per period. If an island were wide enough
    // to contain a whole period, the same patch of map would appear twice on the
    // same island and read as tiling — the exact failure the two-unit maps were
    // accepted not to have.
    const widest = Math.max(...REGIONS.map((r) => r.radius));
    expect(GROUND_MACRO_PERIOD).toBeGreaterThan(widest * 2);
  });

  it('stays inside the brightness range it multiplies', () => {
    // The shader applies `1 + amp * (map - 0.5) * 2` to diffuse colour. A map
    // that reaches either end of [0,1] sends that factor to 1 +/- amp, and past
    // 1.0 it clips the diffuse before the tone curve ever sees it.
    expect(GROUND_MACRO_AMPLITUDE).toBeGreaterThan(0);
    expect(GROUND_MACRO_AMPLITUDE).toBeLessThanOrEqual(1);
  });
});