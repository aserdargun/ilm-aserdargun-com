import { describe, expect, it } from 'vitest';
import { REGIONS } from '../src/catalog/regions';
import { GROUND_TONE_GAP, groundToneEnds } from '../src/world/ground-tone';

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