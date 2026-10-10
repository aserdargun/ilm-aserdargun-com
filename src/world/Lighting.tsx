import { useEffect, useRef } from 'react';
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
 * 3. **Tone.** The hemisphere light stays as a cheap sky/ground fill so the
 *    ambient balance the art direction was authored against does not shift.
 */

/** Half-width of the shadow box, in world units. */
const SHADOW_EXTENT = 46;
/** Depth of the shadow box along the light direction. */
const SHADOW_DEPTH = 220;

export interface LightingProps {
  quality: Quality;
  /** Player world position, so the shadow box can trail behind them. */
  target: THREE.Vector3 | null;
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
    scene.environment = probe;
    return () => {
      scene.environment = previous;
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
function Sun({ quality, target }: LightingProps) {
  const light = useRef<THREE.DirectionalLight>(null);
  const shadowsOn = quality !== 'low';
  const mapSize = quality === 'high' ? 2048 : 1024;

  useFrame(() => {
    const lamp = light.current;
    const focus = target;
    if (!lamp || !focus) return;
    // The light and its target both move, so the shadow box stays centred on
    // the player no matter how far they walk from the hub.
    lamp.position.set(
      focus.x + SUN_DIRECTION.x * SHADOW_DEPTH,
      focus.y + SUN_DIRECTION.y * SHADOW_DEPTH,
      focus.z + SUN_DIRECTION.z * SHADOW_DEPTH,
    );
    lamp.target.position.copy(focus);
    lamp.target.updateMatrixWorld();
  });

  return (
    <>
      <directionalLight
        ref={light}
        color={SUN_COLOR}
        intensity={2.1}
        castShadow={shadowsOn}
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-camera-near={1}
        shadow-camera-far={SHADOW_DEPTH * 2}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
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

export function Lighting({ quality, target }: LightingProps) {
  return (
    <>
      <SceneEnvironment />
      {/* Sky and ground fill. Kept at the authored level so the palette the
          regions were designed around survives the move to real lighting. */}
      <hemisphereLight args={['#9fc7ff', '#2a2417', 0.4]} />
      <Sun quality={quality} target={target} />
      <RimLight quality={quality} />
    </>
  );
}