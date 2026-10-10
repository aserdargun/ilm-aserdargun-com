import { useMemo } from 'react';
import * as THREE from 'three';
import { PALETTE } from './World';
import type { RegionDef } from '../catalog/regions';

/**
 * Sky and terrain colour.
 *
 * Both are colour-only changes on purpose. Walking is solved in two dimensions
 * against a flat plane (`navigation.ts` never reads a height), so terrain that
 * displaced its vertices would immediately disagree with where the player
 * actually stands. Vertex colours buy most of the visual gain for none of that
 * risk.
 */

/** Horizon tone. Fog is matched to this so distant land melts into the sky. */
export const HORIZON_COLOR = new THREE.Color('#253352');

/**
 * A vertical gradient dome.
 *
 * A flat background colour makes the world look like it is sitting inside a
 * box: the horizon becomes a hard line with nothing above it. A gradient gives
 * the sky depth, and gives the distant region discs something to fade into.
 *
 * `radius` must stay comfortably inside the camera's far plane (900, set in
 * `Scene.tsx`). A dome beyond it is not drawn at all, and the missing wedge
 * shows up as a hard dark triangle in the corner of the sky.
 */
export function SkyDome({ radius = 760 }: { radius?: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        // The dome is the backdrop. Fogging it would flatten the gradient back
        // to the fog colour and undo the whole point of it.
        fog: false,
        uniforms: {
          uZenith: { value: new THREE.Color(PALETTE.midnight) },
          uHorizon: { value: HORIZON_COLOR.clone() },
          uGlow: { value: new THREE.Color('#3f6a86') },
        },
        vertexShader: `
          varying float vHeight;
          void main() {
            // Direction from the camera, so the gradient stays anchored to the
            // horizon instead of sliding with the dome.
            vec4 world = modelMatrix * vec4(position, 1.0);
            vHeight = normalize(world.xyz - cameraPosition).y;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: `
          uniform vec3 uZenith;
          uniform vec3 uHorizon;
          uniform vec3 uGlow;
          varying float vHeight;
          void main() {
            float h = clamp(vHeight, -1.0, 1.0);
            // A tight band at the horizon with a slow falloff above it.
            float t = pow(clamp(1.0 - h, 0.0, 1.0), 5.0);
            vec3 colour = mix(uZenith, uHorizon, t);
            // A faint lift where the sky meets the land, so the sun has a
            // visible source instead of arriving from nowhere.
            colour += uGlow * pow(t, 3.0) * 0.3;
            gl_FragColor = vec4(colour, 1.0);
          }
        `,
      }),
    [],
  );

  return (
    <mesh material={material} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[radius, 32, 16]} />
    </mesh>
  );
}

/**
 * A ground disc with per-vertex tint.
 *
 * Two low-frequency noises drive the colour: a broad drift so no two regions
 * read as the same slab of paint, and a finer break-up so the surface still has
 * texture when the camera sits low. Both amplitudes are deliberately small —
 * enough to kill the flatness, not enough to compete with the landmark the
 * player is walking towards.
 */
export function TerrainDisc({ region }: { region: RegionDef }) {
  const geometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(region.radius, region.radius + 2.4, 1.2, 44);
    const positions = geo.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);

    // Each region gets its own seed, derived from its own name, so the tint is
    // stable across reloads without being identical between neighbours.
    const seed = [...region.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) * 0.017;

    const base = new THREE.Color(region.palette.stone);
    const warm = base.clone().offsetHSL(0.012, 0.04, 0.05);
    const cool = base.clone().offsetHSL(-0.02, -0.02, -0.07);
    const c = new THREE.Color();

    for (let i = 0; i < positions.count; i += 1) {
      // Local space: the disc is built at the origin and moved by its group.
      const x = positions.getX(i);
      const z = positions.getZ(i);

      const broad =
        Math.sin(x * 0.035 + seed) * Math.cos(z * 0.031 - seed * 0.7) +
        Math.sin((x + z) * 0.017 + seed * 1.3) * 0.6;
      const fine = Math.sin(x * 0.21 + seed * 2.1) * Math.sin(z * 0.19 - seed * 1.7) * 0.35;

      const t = THREE.MathUtils.clamp(0.5 + (broad + fine) * 0.22, 0, 1);
      c.copy(cool).lerp(warm, t);

      // Darken toward the rim. The edge of a disc is the one place a player
      // looks straight down, and a bright lip there reads as a wall of light.
      const distance = Math.hypot(x, z) / region.radius;
      c.multiplyScalar(1 - THREE.MathUtils.smoothstep(distance, 0.7, 1.0) * 0.34);

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [region.id, region.palette.stone, region.radius]);

  return (
    <mesh geometry={geometry} position={[0, -0.6, 0]} receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={0.96} metalness={0} />
    </mesh>
  );
}