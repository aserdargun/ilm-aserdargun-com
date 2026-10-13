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
  // The box is fitted to an island whose radius can reach 46, so the map is
  // sized to hold at least the ~20 texels/unit the hub used to get. The old
  // fixed ±46 box never dropped below 11 texels/unit on medium either.
  const mapSize = quality === 'high' ? 2048 : 1280;

  useFrame(() => {
    const lamp = light.current;
    const focus = target;
    if (!lamp || !focus) return;

    // Read inside the frame, not during render: the ref is updated by the
    // scene's own frame loop and never triggers a React render, so a value
    // captured at render time would be one island stale.
    const island = region?.current ?? null;

    // The box is fitted to the island, not to the player. An island is a closed
    // shape the player cannot walk out of, so following them only ever slid the
    // boundary around inside ground they could already see — and pulled the
    // bridge casters at the shoreline further out of it the closer they got.
    const cx = island ? island.x : focus.x;
    const cz = island ? island.z : focus.z;
    const extent = island ? island.radius + SHADOW_SHOULDER : SHADOW_FALLBACK_EXTENT;

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
        shadow-radius={2.4}
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