import * as THREE from 'three';

/**
 * The Observer's Mirrors' materials.
 *
 * The panels are the whole point of the island, and they were a hole in the
 * frame. Three separate things had to be true for them to read as mirrors,
 * and all three were false:
 *
 * 1. **The lens has to be a metal.** The `glass` material in the GLB is 10%
 *    metallic, so 90% of its response is a diffuse term — and a diffuse term
 *    under a night sky is black. The specular lobe on a smooth dielectric is
 *    narrow, so there was almost nothing else to light it.
 * 2. **The lens has to be opaque.** At 42% alpha it was a smear over
 *    whatever stood behind it, and at 100% it is a surface.
 * 3. **The lens has to have something to reflect.** The scene's probe is the
 *    world's ambient fill, and it says the space below the islands is dark
 *    brown earth — which was true when the world had a flat blue void under
 *    it and is not true now that the islands hang over a sea of cloud. A
 *    mirror needs a probe of its own for that, and only for that: the scene
 *    probe is scaled to 0.6 of the exposure precisely because it is what
 *    flattens the world, and turning the mist on for the whole scene lifted
 *    the sand by 3.2%.
 *
 * Measured on the running build, the lens face went from 24.87 to 34.95 luma
 * with the sand unchanged at 120.79.
 *
 * The colour is the metal's own tint, and a mirror's tint is what it reflects
 * *through*, so it stays cool and nearly white.
 */

/** The frame's albedo. */
export const MIRROR_METAL_COLOR = '#aeb6c6';

/** The lens's albedo — the tint it reflects through. */
export const MIRROR_GLASS_COLOR = '#e6f2f4';

/** A polished surface. Lower is a sharper reflection. */
export const MIRROR_ROUGHNESS = 0.12;

/**
 * Make a mirror.
 *
 * Returns the material it was given, so a caller can chain it, and it is
 * deliberately tolerant of a material that is not a standard one: the landmark
 * loader hands back whatever the GLB carried.
 */
export function applyMirrorMaterial(
  material: THREE.MeshStandardMaterial,
  environment: THREE.Texture | null,
): THREE.MeshStandardMaterial {
  material.color.set(MIRROR_GLASS_COLOR);
  material.metalness = 1;
  material.roughness = MIRROR_ROUGHNESS;
  material.transparent = false;
  material.opacity = 1;
  if (environment) material.envMap = environment;
  material.needsUpdate = true;
  return material;
}

/**
 * Paint the frame.
 *
 * The frame is a dark metal, and it stays dark: it is the *edge* of the
 * mirror, and a bright edge would make the lens look like a sticker on a
 * board. Its albedo was raised from `#696f7e` because a dark material stays
 * dark however much light is aimed at it, and the frames are what hold the
 * lenses up.
 */
export function applyMirrorFrameMaterial(
  material: THREE.MeshStandardMaterial,
): THREE.MeshStandardMaterial {
  material.color.set(MIRROR_METAL_COLOR);
  material.needsUpdate = true;
  return material;
}
