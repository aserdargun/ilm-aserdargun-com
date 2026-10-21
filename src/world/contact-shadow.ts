import * as THREE from 'three';

/**
 * A soft contact shadow: a patch of ground that is darker under an object
 * than beside it, fading to nothing at its rim.
 *
 * **Why this exists, and why it is not a shadow map.** The low tier drops the
 * shadow map, and with it goes the only thing that said a rock was resting
 * on the sand rather than hovering over it. The README measures the gap: the
 * character's own shadow is worth **6.08 luma** on the sand at the low tier,
 * and about thirty scattered rocks, tufts and pebbles sit on the sand
 * touching nothing.
 *
 * Turning the shadow map back on for the low tier is the one thing this
 * project cannot price: the tier drops shadows *because* a 2048 map on a
 * phone is not affordable, and nothing here can measure a phone's frame time.
 *
 * A contact shadow is not a shadow map. It is one instanced, blended quad
 * per object — no depth pass, no second render of the scene, no 2048×2048
 * buffer — so it costs a fraction of what the tier has already given up, and
 * it restores the one thing that giving it up broke.
 *
 * **It multiplies rather than covers.** Blending a black patch over the
 * ground makes a hole in it; a shadow is the ground with the sun taken out
 * of it, which is the ground's own colour at a fraction of the brightness.
 * So the patch is drawn with `MultiplyBlending` and its vertex colours carry
 * the *multiplier*, not an alpha: the rim is 1.0 — untouched ground — and
 * the centre is the measured fraction.
 */

/**
 * How much of the sun the contact shadow takes away at its centre.
 *
 * Measured against the high tier, which is the reference: the shadow map
 * there is the thing this is imitating, so the number comes from the same
 * spot on the same sand with the same sun.
 */
export const CONTACT_SHADOW_STRENGTH = 0.55;

/** How wide the patch is, as a multiple of the object casting it. */
export const CONTACT_SHADOW_SPREAD = 1.35;

/**
 * A unit patch in the XZ plane, its colour carrying a multiplier that falls
 * to 1.0 at the rim.
 *
 * Vertex colours rather than a texture: the patch is a quad, the falloff is a
 * function of the distance from its centre, and an eight-by-eight grid
 * interpolates it smoothly enough that the edge cannot be seen. A texture
 * would mean a file to ship and a seam to get wrong for no gain.
 */
export function contactShadowGeometry(segments = 8): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1, segments, segments);
  // The plane is built in XY; a contact shadow lies on the ground.
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 4);
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    // The plane is 1×1, so the rim is at a radius of 0.5.
    const r = Math.min(1, Math.hypot(x, z) * 2);
    // Smoothstep from the centre out: flat where it matters, soft at the edge.
    const falloff = r * r * (3 - 2 * r);
    const value = 1 - CONTACT_SHADOW_STRENGTH * (1 - falloff);
    colors[i * 4] = value;
    colors[i * 4 + 1] = value;
    colors[i * 4 + 2] = value;
    colors[i * 4 + 3] = 1;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  return geometry;
}

/**
 * The material a contact shadow is drawn with.
 *
 * `MultiplyBlending` is the point of the whole thing: the patch multiplies
 * the ground it lies on, so the ground keeps its own colour and loses only
 * the sun's share of it. It writes no depth, so it never occludes anything,
 * and it is drawn after the ground because it is transparent.
 */
export function contactShadowMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    blending: THREE.MultiplyBlending,
    // **Required, and not optional.** three.js refuses `MultiplyBlending`
    // without it and falls back to normal blending, loudly — in a console
    // error, repeated every frame, and easy to miss in a wall of warnings.
    // The symptom is a patch that renders as an opaque white square instead
    // of a darkening, because normal blending with a white source and an
    // alpha of one *is* an opaque white square.
    premultipliedAlpha: true,
    depthWrite: false,
    vertexColors: true,
  });
}
