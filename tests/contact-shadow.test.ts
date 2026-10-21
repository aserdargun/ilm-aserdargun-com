import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CONTACT_SHADOW_CORE,
  CONTACT_SHADOW_SPREAD,
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
 *
 * Three things about it were measured, and each of them is pinned here
 * because each of them was a defect first:
 *
 *  - **The rim has to be a true no-op.** A multiplier of one has to reach the
 *    framebuffer as one. Tone mapping stood in the way: a linear one came out
 *    of the curve at 0.80 and landed as 225 of 255, so every patch darkened
 *    its whole square by nine per cent and stopped dead at the square's
 *    border — **12 to 14 luma** of hard edge, measured.
 *  - **The falloff cannot live in vertex colours.** The dark part of a
 *    contact shadow is a plateau, and a plateau with a ramp needs more rings
 *    of vertices than an eight-by-eight grid has. On that grid the ramp fell
 *    across one and a third of a segment and the colours came out
 *    non-monotonic — a zigzag ring around every object, 3,851 hard edges
 *    across the rock field.
 *  - **The patch has to be wider than the object.** A patch narrower than the
 *    thing it shadows is invisible: the boulders' patches darkened no pixel
 *    by more than four luma, and the boulders sat on bare sand.
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

  it('is not tone-mapped, so its rim reaches the framebuffer as exactly one', () => {
    // **This is the one that broke the second time.** A shader's output is
    // not tone-mapped or colour-converted unless the shader asks for it, and
    // the rim has to arrive as exactly 1.0: a multiplier of one is a no-op,
    // and a patch that ends in a no-op has no edge.
    expect(contactShadowMaterial().toneMapped).toBe(false);
  });

  it('carries no vertex colours, so the falloff cannot be quantised into a ring', () => {
    // The falloff is a number per pixel. On the vertex grid it used to live
    // on, the ramp fell across one and a third of a segment and the colours
    // came out non-monotonic.
    const geometry = contactShadowGeometry();
    expect(geometry.getAttribute('color')).toBeUndefined();
    expect(geometry.getAttribute('position').count).toBe(4);
  });

  it('lies on the ground rather than standing up', () => {
    const geometry = contactShadowGeometry();
    const positions = geometry.getAttribute('position');
    let tallest = 0;
    let widest = 0;
    for (let i = 0; i < positions.count; i += 1) {
      tallest = Math.max(tallest, positions.getY(i));
      widest = Math.max(widest, Math.abs(positions.getX(i)), Math.abs(positions.getZ(i)));
    }
    expect(tallest).toBeCloseTo(0, 5);
    // A unit patch: the spread and the core are read off its radius.
    expect(widest).toBeCloseTo(0.5, 5);
  });

  it('holds its darkness out to the object, and not past it', () => {
    // The plateau's radius is the object's own edge as a fraction of the
    // patch's radius, and the two are one decision: the patch's half-width
    // is the spread, and the object ends at one spread's worth of it.
    expect(CONTACT_SHADOW_CORE).toBeCloseTo(1 / CONTACT_SHADOW_SPREAD, 6);
    expect(CONTACT_SHADOW_CORE).toBeLessThan(1);
    // And the spread has to be more than one, or the patch is narrower than
    // the object and there is nothing left to see.
    expect(CONTACT_SHADOW_SPREAD).toBeGreaterThan(1);
  });

  it('takes the sun out of the ground rather than putting black on it', () => {
    const material = contactShadowMaterial();
    expect(material.uniforms.uStrength.value).toBe(CONTACT_SHADOW_STRENGTH);
    expect(material.uniforms.uCore.value).toBe(CONTACT_SHADOW_CORE);
    // The rim is exactly one, which is the whole point of the shape: the
    // darkest value is the plateau, the rim is untouched ground.
    expect(1 - CONTACT_SHADOW_STRENGTH).toBeCloseTo(0.45, 5);
  });
});
