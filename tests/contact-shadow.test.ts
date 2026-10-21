import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CONTACT_SHADOW_STRENGTH,
  contactShadowGeometry,
  contactShadowMaterial,
} from '../src/world/contact-shadow';

/**
 * The low tier drops the shadow map, and with it goes the only thing that
 * said a rock was resting on the sand rather than hovering over it. A contact
 * patch puts that back for a fraction of what the tier gave up.
 *
 * The patch is drawn by multiplying the ground by a fraction of its
 * brightness, which is what a shadow is: the ground with the sun taken out of
 * it, not a black shape on top of it.
 */
describe('the contact shadow', () => {
  it('multiplies the ground rather than covering it', () => {
    // A black patch over the ground is a hole in the ground. Multiplying
    // keeps the ground's own colour and takes away only the sun's share.
    const material = contactShadowMaterial();
    expect(material.blending).toBe(THREE.MultiplyBlending);
    expect(material.transparent).toBe(true);
  });

  it('is premultiplied, which the multiply blend requires', () => {
    // **This is the one that broke.** three.js refuses `MultiplyBlending`
    // without `premultipliedAlpha` and falls back to normal blending, loudly
    // — in a console error, repeated every frame, and easy to miss in a wall
    // of warnings. The symptom is a patch that renders as an opaque white
    // square, because normal blending with a white source and an alpha of one
    // *is* an opaque white square.
    expect(contactShadowMaterial().premultipliedAlpha).toBe(true);
  });

  it('writes no depth, so it cannot occlude what it lies on', () => {
    expect(contactShadowMaterial().depthWrite).toBe(false);
  });

  it('takes the sun out of the ground rather than putting black on it', () => {
    const geometry = contactShadowGeometry();
    const colors = geometry.getAttribute('color');
    expect(colors.itemSize).toBe(4);

    // The centre of the patch is the darkest point, and the rim is the
    // ground untouched: a multiplier of exactly 1.0.
    let darkest = 2;
    let rim = 0;
    for (let i = 0; i < colors.count; i += 1) {
      const value = colors.getX(i);
      darkest = Math.min(darkest, value);
      const x = geometry.getAttribute('position').getX(i);
      const z = geometry.getAttribute('position').getZ(i);
      if (Math.hypot(x, z) > 0.49) rim = Math.max(rim, Math.abs(value - 1));
    }
    expect(darkest).toBeCloseTo(1 - CONTACT_SHADOW_STRENGTH, 3);
    expect(rim).toBeLessThan(0.001);
  });

  it('lies on the ground rather than standing up', () => {
    const geometry = contactShadowGeometry();
    const positions = geometry.getAttribute('position');
    let tallest = 0;
    for (let i = 0; i < positions.count; i += 1) tallest = Math.max(tallest, positions.getY(i));
    expect(tallest).toBeCloseTo(0, 5);
  });
});
