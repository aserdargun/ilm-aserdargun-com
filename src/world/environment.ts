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
 * sun disc is placed on `SUN_DIRECTION` — the same vector the key light in
 * `Lighting.tsx` comes from, so the ambient fill and the key agree on where
 * the light is.
 *
 * What the sun disc is *not* doing was measured rather than assumed. This file
 * used to claim that the shared direction is what puts a copper ring's specular
 * highlight on the sunlit side. It does not: switching the probe off entirely
 * moves those pixels by **+0.90** on average, against **+7.11** on the fill
 * around them. The highlight on a metalness 0.7 / roughness 0.5 ring is the
 * directional light's own specular, plus the sky — it is cooler than the sun
 * tint. The probe is an ambient term here, and the disc's energy lands in the
 * fill rather than in any reflection.
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

/** The colour of the sea of mist below the islands — the sky dome's `uGlow`. */
const MIST = new THREE.Color('#3f6a86');

/**
 * The mean of the sky dome's two mist terms.
 *
 * The dome adds `uGlow * 0.85 * bank * haze * 1.15` and
 * `uGlow * 0.30 * wisp * haze`, and the means of `bank` and `wisp` are both
 * about 0.5, so the mean lift is `uGlow * 0.638`.
 */
const MIST_LIFT = 0.638;

/**
 * How far below the horizon the mist reaches full strength, in view-direction
 * units. The same ramp the dome uses, so a probe and the sky agree.
 */
const MIST_HAZE_RAMP = 0.09;

/**
 * Radiance along a direction, in linear space and above 1.0 for the sun.
 *
 * Values are unbounded on purpose: an environment that clips at 1.0 cannot
 * produce a highlight, it can only produce a slightly brighter grey.
 *
 * `mist` adds the sea of cloud that the world now stands over. It is off by
 * default because this probe is the scene's *ambient fill*: the README's own
 * measurement is that the probe, not the hemisphere light, is what flattens
 * the world, and it is tuned to 0.6 of the exposure for exactly that reason.
 * Turning the mist on for the whole scene lifted the sand by 3.2% and the
 * frame by 4.3%, which is the wrong trade for a backdrop.
 *
 * It is turned on for one thing: the Observer's Mirrors. A polished panel
 * reflects the environment, and an environment that says the world below is
 * dark brown earth is lying to it — the islands hang over a luminous sea of
 * cloud now, and a mirror that cannot see the cloud is not a mirror.
 */
function skyRadiance(direction: THREE.Vector3, target: THREE.Color, mist: boolean): THREE.Color {
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
    if (mist) {
      // The sea of mist, brightest just under the horizon and present all the
      // way down, which is what the sky dome draws.
      const haze = THREE.MathUtils.smoothstep(-up, 0, MIST_HAZE_RAMP);
      target.r += MIST.r * MIST_LIFT * haze;
      target.g += MIST.g * MIST_LIFT * haze;
      target.b += MIST.b * MIST_LIFT * haze;
    }
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
function buildEquirect(width = 128, height = 64, mist = false): THREE.DataTexture {
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
      skyRadiance(direction, radiance, mist);

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
export function createEnvironment(
  renderer: THREE.WebGLRenderer,
  mist = false,
): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const equirect = buildEquirect(128, 64, mist);
  const target = pmrem.fromEquirectangular(equirect);
  equirect.dispose();
  pmrem.dispose();
  return target.texture;
}

/**
 * One mist-aware probe per renderer, for the Observer's Mirrors.
 *
 * Cached rather than built on demand because the app runs under StrictMode,
 * which renders every component twice: a probe built in a `useMemo` would be
 * built twice, and the first one would never be freed. The cache is keyed on
 * the renderer, so it goes away with it.
 */
const mistProbes = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

export function mistEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const existing = mistProbes.get(renderer);
  if (existing) return existing;
  const probe = createEnvironment(renderer, true);
  mistProbes.set(renderer, probe);
  return probe;
}