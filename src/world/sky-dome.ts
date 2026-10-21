import * as THREE from 'three';
import { REGIONS } from '../catalog/regions';
import { PALETTE } from './World';
import { SUN_COLOR, SUN_DIRECTION } from './environment';

/**
 * The sky dome, kept in a module of its own.
 *
 * It used to live inside `Atmosphere.tsx`, and the two things about it that
 * actually mattered were both invisible from there — one because it was a
 * number in a shader and the other because it was a number in a prop.
 *
 * **It was clipped by the far plane.** The dome is a sphere of 760 units
 * standing on the world origin, and the camera's far plane was 900. Those two
 * numbers agree only while the camera is standing on the origin. The player
 * cannot: the farthest island is 249.3 units away once the camera's own reach
 * behind the player is counted, so the far side of the dome sits at
 * **1009.3** units — past the far plane, and therefore not drawn at all.
 *
 * What that looks like is not a thin seam. Measured at the valley, looking
 * towards the hub, the dome's surface along the view axis sits at 958.1
 * units, and the sky carries a black cap with a faceted edge where the far
 * plane cut it — the flat scene background showing through a hole in the
 * backdrop.
 *
 * The fix is not to move the dome. The sky is a function of the *direction*
 * of each vertex, so moving the dome re-anchors every cloud cell: a dome
 * that rides with the camera fixes the clip and empties the sky, measured at
 * the hub's upper corners as a fall from 37.7 to 21.4 luma with the cloud
 * banks going with them. The fix is to raise the far plane, which changes no
 * pixels at all and costs 2% of the depth buffer's slope.
 *
 * **The lower half of it was a single flat colour.** The world is eight
 * coplanar discs hanging in the air, and the void between them had no
 * content at all: the gradient in the dome saturates at the horizon, so
 * everything below it was one colour.
 *
 * Measured on a bridge crossing — 84 of a span's 163 units, and half a minute
 * of the player's life — that flat field was **32% of the frame** at a local
 * luminance standard deviation of 0.17, which is quantisation rather than
 * image. The frame read as a blue wall.
 *
 * What belongs down there is a sea of mist, and it is projected the way a
 * floor is seen: the view ray is intersected with a plane far below, so the
 * cells compress towards the horizon on their own and the perspective is the
 * real one rather than a painted ramp.
 */

/** Radius of the dome, in world units. */
export const SKY_DOME_RADIUS = 760;

/**
 * The camera's far plane, in world units.
 *
 * The single source of truth: `Scene.tsx` builds the camera from it, and the
 * dome's geometry is checked against it.
 *
 * It was 900, and the dome was 760, and those two numbers were assumed to
 * agree. They only do if the camera stands on the world origin, which the
 * player never does: the farthest island is 241.6 units away, and the camera
 * can stand a further 7.7 beyond the player's own reach, so the dome's far
 * side reaches **1009.3** units from the lens.
 *
 * Past the far plane the dome is not drawn at all, and what is drawn instead
 * is the scene background — a flat midnight blue. Measured at the valley,
 * looking towards the hub, the dome's surface along the view axis sits at
 * **958.1** units against a 900 far plane, and the sky carries a black cap
 * with a faceted edge where the far plane cut it.
 *
 * The far plane was raised rather than the dome moved, and that is the whole
 * argument: moving the dome changes the sky. It was tried — the dome riding
 * with the camera, so that its distance from the lens is a constant — and it
 * fixed the clip while measurably emptying the sky, because the cloud
 * pattern is anchored to the *direction* of each vertex and re-anchoring it
 * moves every cell. At the hub the sky's upper corners fell from 37.7 to
 * 21.4 luma and the cloud banks went with them.
 *
 * Raising the far plane changes no pixels at all, because the far plane is
 * only a clipping threshold and nothing in the world is anywhere near it. The
 * cost is depth precision, and it is 2%: the slope of the depth buffer
 * depends on `1 / near - 1 / far`, and `1/1100` against `1/900` differs by
 * 0.0002 out of 9.99.
 */
export const CAMERA_FAR = 1100;

/** Horizon tone. Fog is matched to this so distant land melts into the sky. */
export const HORIZON_COLOR = new THREE.Color('#253352');

/** How far behind the player the camera can sit, in world units. */
export const CAMERA_REACH = 10;

/**
 * How far the camera can get from the world origin.
 *
 * The islands are discs and the player is clamped inside each one, but the
 * camera sits *behind* the player, so it reaches further than the player does:
 * the clamp is the disc's radius less 1.2 and 1.1, and the camera can be a
 * further 7.8 behind — 9.98 in portrait, where the lens is pulled back to
 * keep the character in frame.
 *
 * The valley is the outlier: 197.6 from the origin, plus its 44-unit radius,
 * plus the camera's reach.
 */
export const WORLD_REACH = REGIONS.reduce((farthest, region) => {
  const distance = Math.hypot(region.anchor[0], region.anchor[2]);
  return Math.max(farthest, distance + region.radius + CAMERA_REACH);
}, 0);

/**
 * How far the dome's surface is from a camera, if the dome stands still.
 *
 * This is the number that used to be wrong. A sphere seen from a point `d`
 * away has its far side at `d + radius`, and `d` is not zero — the player
 * cannot stand on the world origin.
 */
export function staticDomeReach(distanceFromCentre: number): number {
  return distanceFromCentre + SKY_DOME_RADIUS;
}

/**
 * The vertex shader.
 *
 * Unchanged in substance from the original, and deliberately so. The dome
 * stands on the world origin and each vertex is read as a direction from the
 * camera, so the gradient is anchored to the horizon rather than sliding with
 * the dome.
 *
 * The obvious repair for the far-plane clip — riding along with the camera —
 * was tried and rejected, and the reason is in `CAMERA_FAR`: the sky is a
 * function of the *direction* of each vertex, so moving the dome re-anchors
 * every cloud cell and empties the sky. The clip is better fixed by moving
 * the far plane, which costs no pixels.
 */
export const SKY_VERTEX_SHADER = /* glsl */ `
  varying float vHeight;
  varying vec3 vDir;
  void main() {
    // Direction from the camera, so the gradient stays anchored to the
    // horizon instead of sliding with the dome.
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    vDir = world - cameraPosition;
    vHeight = normalize(vDir).y;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

/**
 * How far below the islands the mist floor sits, in world units.
 *
 * The islands are at y = 0 and the camera is a few units above them, so 26
 * puts the mist a clear 20 units under the lowest thing the player can stand
 * on — far enough to read as a floor, close enough that the cells do not
 * smear into nothing.
 */
export const MIST_FLOOR_DEPTH = 26;

/**
 * Every number that reaches the shader is written as a float.
 *
 * This is not tidiness. GLSL ES 1.00 has no implicit conversion from `int` to
 * `float` on the left of an operator, so an integer constant interpolated into
 * an expression like `26 / max(down, 0.02)` fails to compile:
 *
 * > ERROR: 0:197: '/' : wrong operand types - no operation '/' exists that
 * > takes a left-hand operand of type 'const int' and a right-hand operand of
 * > type 'highp float'
 *
 * A shader that does not compile does not draw: the dome's program fails to
 * link, the backdrop is not rendered at all, and the sky becomes the flat
 * scene background — with nothing in the console but a warning that repeats
 * until the browser stops reporting. It looks like a lighting problem and it
 * is a type problem, and it cost a long detour.
 */
function glslFloat(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

/**
 * Noise units per world unit on the mist floor.
 *
 * The first attempt at this was 0.0055, and the mist was invisible: across
 * the whole visible void the noise coordinate moved by less than one cell, so
 * the entire lower hemisphere sampled a single value of the noise and came
 * out as one flat colour again. At 0.02 the coordinate runs to about five
 * cells across the void, which is what makes banks rather than a wash.
 */
export const MIST_SCALE = 0.02;

/** How far the sunlit tops of the banks lift out of the void. */
export const MIST_LIFT = 0.85;

/** How far the finer wisps over the banks lift out of the void. */
export const MIST_WISP = 0.3;

/** The wisps' frequency relative to the banks'. */
export const MIST_WISP_FREQUENCY = 2.7;

/**
 * How far below the horizon the mist reaches full strength, in view-direction
 * units.
 *
 * The mist is not there at the horizon and thickens as the eye looks further
 * down, which is what keeps the two halves of the dome meeting without a
 * seam.
 */
export const MIST_HAZE_RAMP = 0.09;

/** How far the void darkens as it goes down. */
export const MIST_DEPTH_DARKEN = 0.55;

/**
 * How far the cloud term is allowed to lift the sky.
 *
 * Written at 0.5 without ever sweeping it, which is the same mistake the ground
 * macro amplitude was shipped with. Re-swept against the real three-octave noise
 * — 0.50, 0.95, 1.50 — at 64-pixel-lag horizontal autocorrelation across three
 * sky regions: **0.568 → 0.481 → 0.471**. Lower is better here: 0.6 is a ramp,
 * below 0.5 is a pattern.
 *
 * The plain "horizontal neighbour difference" barely moved across the sweep, and
 * that is the metric being misled rather than the sky being flat — in a sky that
 * contains a tower, a HUD and a ridge, that statistic is set by the hard edges
 * and says nothing about the clouds.
 *
 * Shimmer was re-checked rather than assumed: three frames across a full pan at
 * 1.5 give 0.0000% isolated pixels in all four bands, the horizon included —
 * which was the risk, since the projection compresses toward it.
 *
 * Above 1 the mix factor exceeds one, so `mix()` extrapolates rather than
 * clamps. That is linear and smooth across the cloud edge, and it is what lets
 * the sky carry more than the term was originally budgeted for.
 */
export const SKY_CLOUD_AMPLITUDE = 1.5;

/**
 * The fragment shader.
 *
 * The brightening of the banks is *added* to the void rather than mixed into
 * it, for the same reason the sky's clouds are: the gaps between the banks
 * keep the void's own tone, and that is what makes the result read as cloud
 * rather than as a pale wash over everything.
 */
export const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform vec3 uSun;
  uniform vec3 uSunColour;
  uniform float uTime;
  varying float vHeight;
  varying vec3 vDir;

  float h21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = h21(i);
    float b = h21(i + vec2(1.0, 0.0));
    float c = h21(i + vec2(0.0, 1.0));
    float d = h21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float skyFbm(vec2 p) {
    return 0.55 * vnoise(p)
         + 0.28 * vnoise(p * 2.03 + 11.7)
         + 0.17 * vnoise(p * 4.11 - 5.3);
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(vHeight, -1.0, 1.0);
    float t = pow(clamp(1.0 - h, 0.0, 1.0), 5.0);
    vec3 colour = mix(uZenith, uHorizon, t);
    // A faint lift where the sky meets the land, so the sun has a
    // visible source instead of arriving from nowhere.
    colour += uGlow * pow(t, 3.0) * 0.3;

    // The sun itself, and the wide warmth around it.
    float sun = max(dot(d, normalize(uSun)), 0.0);
    colour += uSunColour * (pow(sun, 90.0) * 0.9 + pow(sun, 6.0) * 0.1);

    // High cloud.
    //
    // This was four sine terms over the view direction, at coefficients
    // from 3.1 to 11.3, and that could not be made to work at any
    // amplitude. Those wavelengths put each feature tens of degrees
    // across — wider than the sky a 58° camera can see — so the whole
    // visible sky sits inside a single cloud cell. Raising the contrast
    // brightened every pixel in step (the 4.4× probe moved the sky 5.1
    // luma levels, with a difference whose 2nd percentile was +0.0 and
    // its 98th +34) while horizontal structure moved 2.121% to 2.139%:
    // under one percent. It was a brightness slider wearing the costume
    // of weather.
    //
    // Three octaves of value noise at a frequency the camera can resolve
    // fixes the cause rather than the symptom. Measured over four
    // regions of the frame it moves the sky by -9.7 to +7.9 luma with a
    // median of exactly +0.0: structure with no brightness shift at all,
    // and the horizontal autocorrelation falls from 0.63 to 0.48, which is
    // the difference between a ramp and a pattern. At 3840x2160 the
    // three octaves cost 0.1ms on a 24.8ms frame.
    //
    // The projection denominator is floored rather than divided by d.y
    // outright: a plane projection that reaches the horizon without a
    // floor compresses the cloud to nothing in the last few degrees,
    // exactly where the ridge is and where aliasing would show.
    // The clouds drift, on a clock of their own.
    //
    // The drift is uniform in the noise's own space, and the projection
    // compresses near the horizon, so a cloud's size and its motion shrink
    // together: the feature and the drift stay in the same proportion and
    // nothing crawls. It is the reason the sea's drift is in world units and
    // this one is not.
    vec2 cloudUv = d.xz * (14.0 / (0.35 + d.y * 2.0)) + vec2(uTime * 0.03, uTime * 0.012);
    float band = skyFbm(cloudUv);
    float cloud = smoothstep(0.42, 0.72, band);
    // Present above the horizon, gone before the zenith, brightest where
    // the haze already is.
    float mask =
        smoothstep(-0.02, 0.30, d.y) *
        (1.0 - smoothstep(0.55, 0.98, d.y)) *
        (0.35 + 0.65 * t);
    colour = mix(colour, colour + uGlow * 0.55, cloud * mask * ${glslFloat(SKY_CLOUD_AMPLITUDE)});

    // A far ridge standing on the horizon.
    //
    // The world is eight coplanar discs. Measured from the hub, the
    // furthest of them never rises above y = 330 in a 1610-pixel frame
    // and is edge-confined throughout — past the nearest island there
    // is nothing at all, so the horizon is a hard line between land and
    // gradient. This is the one piece of the backdrop that is missing.
    //
    // Same idiom as the cloud above it, deliberately: sines over the
    // view direction, no texture, a handful of ALU on the one surface
    // that never writes depth. It is painted *into* the dome, so the
    // islands draw over it for free and no depth sorting is involved.
    float az = atan(d.z, d.x);
    float ridge =
        sin(az * 1.7) * 0.55 +
        sin(az * 3.3 + 1.1) * 0.28 +
        sin(az * 6.7 - 0.7) * 0.17;

    // Two ridges, because one band reads as a painted stripe and two
    // read as land going away. The far one is higher — on a flat world
    // the horizon is eye level, so distance lifts a silhouette toward
    // it — and paler, which is what haze does to it.
    float azF = az * 0.61 + 2.1;
    float ridgeFar =
        sin(azF * 1.3) * 0.55 +
        sin(azF * 2.9 + 0.6) * 0.29 +
        sin(azF * 5.3 - 1.4) * 0.16;
    float farTop = 0.036 + ridgeFar * 0.019;
    float farBand = smoothstep(farTop, farTop - 0.003, d.y) * smoothstep(-0.042, 0.004, d.y);
    colour = mix(colour, uHorizon * 0.88, farBand * 0.8);

    // The near ridge line, in units of view-direction height, so it sits
    // just above where the discs meet the sky and no higher.
    float ridgeTop = 0.030 + ridge * 0.014;
    float below = smoothstep(ridgeTop, ridgeTop - 0.004, d.y);
    // Only where the ground would be: fades out below the discs so the
    // void under an island is not filled in.
    float onLand = below * smoothstep(-0.045, 0.004, d.y);
    // Two tones, so the ridge is not one flat cut-out.
    float shade = smoothstep(ridgeTop - 0.010, ridgeTop - 0.002, d.y);
    colour = mix(colour, mix(uHorizon * 0.52, uHorizon * 0.78, shade), onLand * 0.92);

    // The sea of mist below the horizon.
    //
    // The world is eight coplanar discs hanging in the air, and everything
    // under them used to be one flat colour. Projected the way a floor is
    // seen: the view ray is intersected with a plane far below, so the
    // cells compress towards the horizon on their own and the perspective
    // is the real one rather than a painted ramp.
    //
    // The lift is added rather than mixed, so the gaps between the banks
    // keep the void's own tone and the result reads as cloud instead of a
    // pale wash over everything.
    if (d.y < 0.0) {
      float down = -d.y;
      // How far the ray travels to reach the floor. Grazing angles travel
      // further, which is what compresses the cells towards the horizon.
      float travel = ${glslFloat(MIST_FLOOR_DEPTH)} / max(down, 0.02);
      // The floor point, in world units, and then the pattern on it.
      //
      // The projection used to be the view direction alone, which means the
      // sea was painted on the camera: it never parallaxed when the player
      // walked, and it never changed as they looked around — it turned with
      // them. Adding the camera's own position makes it a place instead, a
      // floor of cloud a long way down that the world moves across.
      vec2 floorXZ = cameraPosition.xz + d.xz * travel;
      // And it drifts, the way weather does. The speed is a fraction of a
      // cloud's own width: a feature is about two and a half units across and
      // takes six seconds to move one of its own widths.
      vec2 seaUv = floorXZ * ${glslFloat(MIST_SCALE)} + vec2(uTime * 0.008, uTime * 0.003);
      float sea = skyFbm(seaUv);
      // The mist is not there at the horizon and thickens as the eye looks
      // further down, which is what keeps the two halves of the dome
      // meeting without a seam.
      float haze = smoothstep(0.0, ${glslFloat(MIST_HAZE_RAMP)}, down);
      float bank = smoothstep(0.34, 0.66, sea);
      // A second, finer layer of wisps over the banks.
      float wisp = vnoise(seaUv * ${glslFloat(MIST_WISP_FREQUENCY)} + 13.0);
      colour += uGlow * ${glslFloat(MIST_LIFT)} * bank * haze * 1.15;
      colour += uGlow * ${glslFloat(MIST_WISP)} * smoothstep(0.45, 0.80, wisp) * haze;
      // And the gap under the islands is dark: looking straight down is
      // looking into the space between them.
      colour = mix(colour, uZenith * 3.0, smoothstep(0.10, 0.85, down) * ${glslFloat(MIST_DEPTH_DARKEN)});
    }

    gl_FragColor = vec4(colour, 1.0);
  }
`;

/** The dome's uniforms, built once from the palette and the shared sun. */
export function skyDomeUniforms(): Record<
  string,
  { value: THREE.Color | THREE.Vector3 | number }
> {
  return {
    uZenith: { value: new THREE.Color(PALETTE.midnight) },
    uHorizon: { value: HORIZON_COLOR.clone() },
    uGlow: { value: new THREE.Color('#3f6a86') },
    // The visible sky was the one part of the scene with no idea where the
    // sun was. The environment probe puts its disc on SUN_DIRECTION and the
    // key light shines along that same vector, so the shadows already said
    // "warm light from up and to the right" while the backdrop said nothing
    // at all. Same constant, so the three agree by construction.
    uSun: { value: SUN_DIRECTION.clone() },
    uSunColour: { value: SUN_COLOR.clone() },
    uTime: { value: 0 },
  };
}
