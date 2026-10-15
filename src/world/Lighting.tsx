import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RIM_COLOR, SUN_COLOR, SUN_DIRECTION, createEnvironment } from './environment';
import type { Quality } from '../game/store';

/**
 * The lighting rig.
 *
 * Before this existed the scene had three lights and no shadow map at all:
 * `shadows` was enabled on the canvas but nothing was ever told to cast. Every
 * surface was lit purely by direction, so a boulder and a barrel of identical
 * size read identically wherever they stood, and nothing in the world touched
 * the ground. Depth had to be guessed from silhouettes.
 *
 * Three things fix that, in order of how much they matter:
 *
 * 1. **A shadow-casting sun.** The light is a directional one, so its shadow
 *    camera is a box. The world is ~900 units across, far too wide for a
 *    single useful shadow map, so the box follows the player and stays tight
 *    around them. Far away, shadow detail is invisible anyway; up close, it is
 *    the whole difference between standing on the ground and hovering above it.
 * 2. **Image-based lighting.** Metallic surfaces get their colour from what
 *    they reflect, so without a probe they render as flat dark shapes. See
 *    `environment.ts`.
 * 3. **Tone.** The hemisphere light stays at the authored level. It was assumed
 *    to be the "ambient balance the art direction was authored against"; measured,
 *    it is not the one that flattens the scene — moving it between 0.4 and 0.14
 *    changed shadowed ground by 0.4 luma. The environment probe is. See
 *    `SceneEnvironment`.
 */

/** Half-width of the shadow box before an island is known, in world units. */
export const SHADOW_FALLBACK_EXTENT = 46;
/** Depth of the shadow box along the light direction. */
const SHADOW_DEPTH = 220;

/**
 * How far past a shoreline the shadow box reaches.
 *
 * Bridges begin five units *inside* the rim (`hub.radius - 5`), so the part of
 * one that shades this island is already covered by a box fitted to the island.
 * The shoulder only catches the small return cast of the next few units of
 * deck, which lands back on the sand because the sun is low.
 *
 * The real defect was never the size, it was the centre. A box that followed
 * the player put its edge *inside* the island whenever they stood off-centre,
 * and the bridge's shadow stopped dead on open ground — measured at 26 units
 * off-centre, the far 6 units of shoreline were outside a ±54 box entirely. A
 * controlled A/B at one camera and one box size: island-centred, the hard
 * vertical cut in the bridge shadow disappears and the deck's shadow runs on
 * to the shore.
 *
 * Sizing it to the island also means texels-per-unit no longer depends on where
 * the player is standing. At 2048² this yields 23.3 texels/unit on the hub,
 * against 22.4 for the old player-following box — slightly *better* detail on
 * the island the player spends most of their time on.
 */
const SHADOW_SHOULDER = 10;

/**
 * The box the player walks with once they have left the island.
 *
 * Two thirds of every bridge is outside the island box — measured at 109 of 163
 * units, 29.5 seconds a crossing — and the box stays on the island because an
 * island is a closed shape the player cannot walk out of. That reasoning is sound
 * on an island and simply stops at the shoreline: measured on the hub, a player
 * standing on the bridge is **98 units from the box centre with a box of ±44**,
 * so there is no shadow at all rather than a soft one.
 *
 * The repair is not a wider box. Widening `SHADOW_SHOULDER` trades the island's
 * resolution for the ribbon of deck where the player spends a fraction of their
 * time, which is the wrong way round. Handing the box to the player *only once
 * they are off the island* costs nothing on the island, because an island the
 * player has left is one they cannot see the shadow detail of.
 *
 * The extent is small on purpose. At ±24 the box covers the twelve-unit deck,
 * its rails and the water either side, and buys **42.7 texels per unit** —
 * nearly double what the island's own ±44 gives. A player on a bridge is closer
 * to the ground than an island ever is, so a tighter box is the cheaper one.
 */
const SHADOW_TRAVEL_EXTENT = 24;

/**
 * Which box the sun draws, and where it is centred.
 *
 * Split out of the frame loop so the rule is a value that can be asserted rather
 * than a closure nobody can reach: an island the player cannot walk out of keeps
 * the box, and the moment they leave it the box goes with them.
 *
 * The boundary is inclusive on the island side — `radius + SHADOW_SHOULDER` is
 * the last point the island box reaches, so that point still belongs to it.
 */
export function shadowBoxFor(
  focus: { x: number; z: number },
  island: ShadowRegion | null,
): { cx: number; cz: number; extent: number } {
  const onIsland =
    island !== null &&
    Math.hypot(focus.x - island.x, focus.z - island.z) <= island.radius + SHADOW_SHOULDER;
  if (!onIsland || island === null) {
    return { cx: focus.x, cz: focus.z, extent: SHADOW_TRAVEL_EXTENT };
  }
  return { cx: island.x, cz: island.z, extent: island.radius + SHADOW_SHOULDER };
}

/** Centre and radius of the island the player is standing on. */
export interface ShadowRegion {
  x: number;
  z: number;
  radius: number;
}

export interface LightingProps {
  quality: Quality;
  /** Player world position, so the shadow box can trail behind them. */
  target: THREE.Vector3 | null;
  /** The island under the player; the box is fitted to it rather than to them. */
  region: RefObject<ShadowRegion> | null;
}

/**
 * Installs the pre-filtered environment probe on the scene.
 *
 * Deliberately not the background: the world's horizon is the region discs
 * seen against open sky, and swapping that for a visible probe would change
 * the art direction from "night field" to "studio backdrop".
 */
function SceneEnvironment() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const probe = createEnvironment(gl);
    const previous = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    scene.environment = probe;
    // How much the probe is allowed to fill in. At 1 the probe was supplying most
    // of the light on shadowed ground: measured at the hub with the sun off, the
    // ambient delivered 45-61% of the terrain's brightness on every island, and
    // switching the hemisphere light between 0.4 and 0.14 barely touched shadowed
    // ground at all (44.56 -> 44.94). The probe, not the hemisphere, was the flat
    // fill.
    //
    // At 0.6, with the sun raised to compensate so exposure stays where it was,
    // the ratio of lit to shadowed terrain rises from 2.72 to 2.92 and the
    // terrain's own spread from 38.6 to 41.1, for a frame mean that moves 1.2%.
    // Deeper shadows is what lets a faceted low-poly form read as a solid.
    // 0.35 was also measured and looks punchier still, but it darkens every
    // metallic surface in the game along with everything else, and that is a
    // worse trade than the last 5 points of contrast are worth.
    scene.environmentIntensity = 0.6;
    return () => {
      scene.environment = previous;
      scene.environmentIntensity = previousIntensity;
      probe.dispose();
    };
  }, [gl, scene]);

  return null;
}

/**
 * The key light.
 *
 * Shadow resolution scales with the quality tier because a phone rendering a
 * 1024 map over the same box is trading detail for frame rate whether it wants
 * to or not.
 */
function Sun({ quality, target, region }: LightingProps) {
  const light = useRef<THREE.DirectionalLight>(null);
  const fitted = useRef<number>(-1);
  const shadowsOn = quality !== 'low';
  // 2048 on both tiers that render shadows at all, up from 2048 on high and
  // 1280 on medium. The tier-scaling comment this replaces was true when low
  // still drew a 1024 map; it no longer does — `shadowsOn` is false there, so
  // the medium tier was the only one left paying for a smaller map with nothing
  // bought in return.
  //
  // The box is fitted to an island whose radius can reach 46, so this puts the
  // hub at 23.3 texels per world unit and the council at 18.3, against 14.5 and
  // 11.4 at 1280. The shadow map's texel is also the unit `shadow.radius` is
  // counted in, so a smaller map silently widens the penumbra as well as the
  // stair-steps.
  //
  // Measured on the medium tier itself, not extrapolated: 1280 -> 2048 moves
  // 1.70% of the frame past 4/255 against a 0.39% same-setting control, 1.85x
  // the noise floor — the same ratio the high tier shows for the same step
  // (1.9x). It is free there: three samples each measured 112.4 FPS at 1280 and
  // 110.2 at 2048, with the two ranges almost entirely overlapping. Going the
  // other way is not — 4096 costs 11.2% of the frame rate on high, which is why
  // this stops at 2048.
  const mapSize = 2048;

  useFrame(() => {
    const lamp = light.current;
    const focus = target;
    if (!lamp || !focus) return;

    // Read inside the frame, not during render: the ref is updated by the
    // scene's own frame loop and never triggers a React render, so a value
    // captured at render time would be one island stale.
    //
    // On an island a closed shape cannot be walked out of, so the box stays on
    // it; off it, the alternative is a box whose centre is 98 units away and a
    // character with no shadow at all. `shadowBoxFor` holds the rule.
    const { cx, cz, extent } = shadowBoxFor(focus, region?.current ?? null);

    lamp.position.set(
      cx + SUN_DIRECTION.x * SHADOW_DEPTH,
      SUN_DIRECTION.y * SHADOW_DEPTH,
      cz + SUN_DIRECTION.z * SHADOW_DEPTH,
    );
    lamp.target.position.set(cx, focus.y, cz);
    lamp.target.updateMatrixWorld();

    // Resizing the orthographic box every frame would re-derive the projection
    // matrix for nothing; the extent only changes when the player crosses to
    // another island.
    if (fitted.current !== extent) {
      fitted.current = extent;
      const cam = lamp.shadow.camera;
      cam.left = -extent;
      cam.right = extent;
      cam.top = extent;
      cam.bottom = -extent;
      cam.updateProjectionMatrix();
    }
  });

  return (
    <>
      <directionalLight
        ref={light}
        color={SUN_COLOR}
        // Raised from 2.1 with the probe pulled back to 0.6, so that moving light
        // from the ambient fill onto the key is a change of balance rather than a
        // change of exposure: frame mean 75.94 -> 76.87, lit-over-shadowed terrain
        // 2.72 -> 2.92.
        intensity={2.4}
        castShadow={shadowsOn}
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-camera-near={1}
        shadow-camera-far={SHADOW_DEPTH * 2}
        shadow-camera-left={-SHADOW_FALLBACK_EXTENT}
        shadow-camera-right={SHADOW_FALLBACK_EXTENT}
        shadow-camera-top={SHADOW_FALLBACK_EXTENT}
        shadow-camera-bottom={-SHADOW_FALLBACK_EXTENT}
        // A tight box concentrates the whole map onto the area the player can
        // actually see. Without these the depth precision is spent on the far
        // side of the frustum and the shadows acne or detach from their
        // objects.
        shadow-bias={-0.0006}
        shadow-normalBias={0.035}
        // 0.5, down from 2.4, and 2.4 was not a choice so much as a guess nobody
        // could check. Worth knowing what this number is even doing: R3F's
        // `shadows={true}` asks for `PCFSoftShadowMap`, three.js has removed that
        // type and silently substitutes `PCFShadowMap` with a console warning, and
        // only `PCFShadowMap` and `VSMShadowMap` read `shadow.radius` at all. So
        // the value is live, and the shader spends it as
        // `radius * texelSize` over a five-tap Vogel disc — 2.4 on a 2048 map
        // covering 88 world units is a sampling disc **0.10 units across**, a
        // tenth of the player's height.
        //
        // Measured at the hub with a same-setting control pair: at 2.4 the
        // player's shadow on the sand is a smudge whose caster you cannot name,
        // and 0.5 makes the hat, the brim and the edge of it legible. The frame
        // moves 0.587 mean absolute luminance against a 0.375 control, with 3.10%
        // of pixels past 4/255 against 0.77% — four times the noise. The same
        // change at Memory Council City is 1.238 against 0.695, the weaker of the
        // two because that frame animates more.
        //
        // Free: five samples at 2.4 and at 0.5 measured 99.65 and 100.4 FPS
        // across two and three runs, inside the 98-104 spread of a single
        // setting. A single pair of readings had suggested a 5.7% gain, which
        // was drift.
        //
        // 0.5 rather than 0.25 because 0.25 is indistinguishable from it — 0.335
        // mean against a 0.375 control, i.e. below noise — while 0.5 keeps a
        // margin over the point where the sampling disc drops under one shadow
        // texel and the shadow goes hard. And 2.4 was already the most softness
        // this map can deliver: raising it to 6.0 changes nothing past the noise
        // floor, because the disc is wider than the texels it samples.
        shadow-radius={0.5}
      />
    </>
  );
}

/**
 * Cool rim from the opposite side of the key.
 *
 * No shadow map: its whole job is to separate silhouettes from the background,
 * which it can do as a direction-only term, and a second shadow pass is the
 * most expensive thing on the tier it would otherwise cost.
 */
function RimLight({ quality }: { quality: Quality }) {
  return (
    <directionalLight
      position={[-60, 34, -70]}
      intensity={quality === 'low' ? 0.34 : 0.62}
      color={RIM_COLOR}
    />
  );
}

export function Lighting({ quality, target, region }: LightingProps) {
  return (
    <>
      <SceneEnvironment />
      {/* Sky and ground fill. Kept at the authored level so the palette the
          regions were designed around survives the move to real lighting. */}
      <hemisphereLight args={['#9fc7ff', '#2a2417', 0.4]} />
      <Sun quality={quality} target={target} region={region} />
      <RimLight quality={quality} />
    </>
  );
}