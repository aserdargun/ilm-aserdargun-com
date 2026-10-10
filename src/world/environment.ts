import * as THREE from 'three';

/**
 * Procedural image-based lighting.
 *
 * The scene has no HDRI file to load, and every material in it is
 * `meshStandardMaterial` — which is a PBR shader that derives its specular
 * response entirely from what it can reflect. With nothing to reflect, copper
 * and glass collapse to flat dark shapes: the previous look was not "unlit",
 * it was unreflective. So the environment here is the missing half of the
 * lighting rig, and it is generated on the CPU at load time rather than
 * shipped as a multi-megabyte `.hdr`.
 *
 * The gradient is authored to the same palette as the rest of the world
 * (`PALETTE.midnight` at the zenith, warm sandstone at the horizon), and the
 * sun disc is placed on `SUN_DIRECTION` — the exact vector the key light in
 * `Lighting.tsx` comes from. That shared direction is what makes the specular
 * highlight on a copper ring land on the side the sun is actually on.
 */

/** Shared key-light direction. Norm of the original light at [70, 90, 40]. */
export const SUN_DIRECTION = new THREE.Vector3(0.579, 0.745, 0.331).normalize();

/** Warm key colour, matching the existing directional light. */
export const SUN_COLOR = new THREE.Color('#ffe9c4');

/** Cool bounce from the opposite side, for the rim. */
export const RIM_COLOR = new THREE.Color('#4fd6d0');

const ZENITH = new THREE.Color('#0e1730');
const HORIZON = new THREE.Color('#3d4a63');
const GROUND = new THREE.Color('#241d16');
const SUN_TINT = new THREE.Color('#fff0d2');

/**
 * Radiance along a direction, in linear space and above 1.0 for the sun.
 *
 * Values are unbounded on purpose: an environment that clips at 1.0 cannot
 * produce a highlight, it can only produce a slightly brighter grey.
 */
function skyRadiance(direction: THREE.Vector3, target: THREE.Color): THREE.Color {
  const up = direction.y;

  if (up >= 0) {
    // Sky: zenith down to horizon, with a soft horizon band so the
    // transition reads as atmosphere rather than a hard seam.
    const t = Math.pow(THREE.MathUtils.clamp(1 - up, 0, 1), 2.2);
    target.copy(ZENITH).lerp(HORIZON, t);
  } else {
    // Below the horizon: dim warm bounce off the ground, not black. A black
    // lower hemisphere makes every downward-facing normal read as a hole.
    const t = THREE.MathUtils.clamp(-up * 3.2, 0, 1);
    target.copy(HORIZON).lerp(GROUND, t);
  }

  // Sun disc plus its bloom halo.
  const alignment = direction.dot(SUN_DIRECTION);
  if (alignment > 0) {
    // The disc is deliberately soft and modest. A tight, intense disc is what
    // produces a blown-out white streak across any surface angled toward the
    // sun; a broad one reads as a highlight instead of a clipping artefact.
    const disc = Math.pow(THREE.MathUtils.clamp((alignment - 0.988) / 0.012, 0, 1), 0.9);
    const halo = Math.pow(alignment, 90) * 0.5 + Math.pow(alignment, 10) * 0.1;
    const energy = disc * 2.6 + halo;
    target.r += SUN_TINT.r * energy;
    target.g += SUN_TINT.g * energy;
    target.b += SUN_TINT.b * energy;
  }

  return target;
}

/**
 * Equirectangular HDR probe, generated on the CPU.
 *
 * Float rather than byte data because the sun has to be able to exceed 1.0 —
 * that surplus is exactly what a rough metal surface samples to produce its
 * glint, and clamping it away is what makes procedural environments look
 * plastic.
 */
function buildEquirect(width = 128, height = 64): THREE.DataTexture {
  const data = new Float32Array(width * height * 4);
  const direction = new THREE.Vector3();
  const radiance = new THREE.Color();

  for (let y = 0; y < height; y += 1) {
    // v = 0 at the top of the image maps to +Y.
    const phi = (0.5 - (y + 0.5) / height) * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    for (let x = 0; x < width; x += 1) {
      const theta = ((x + 0.5) / width - 0.5) * Math.PI * 2;
      direction.set(Math.sin(theta) * cosPhi, sinPhi, Math.cos(theta) * cosPhi);
      skyRadiance(direction, radiance);

      const i = (y * width + x) * 4;
      data[i] = radiance.r;
      data[i + 1] = radiance.g;
      data[i + 2] = radiance.b;
      data[i + 3] = 1;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Builds the pre-filtered probe and returns the renderer's `scene.environment`.
 *
 * PMREM does the roughness pre-filtering, so a single blurred probe serves
 * smooth glass and rough stone alike — the player gets correct specular at
 * every roughness for the cost of one 128x64 source image.
 */
export function createEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const equirect = buildEquirect();
  const target = pmrem.fromEquirectangular(equirect);
  equirect.dispose();
  pmrem.dispose();
  return target.texture;
}