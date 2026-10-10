import { useTexture } from '@react-three/drei';
import { useEffect } from 'react';
import * as THREE from 'three';

/**
 * Triplanar surface detail for the Blender-authored landmarks.
 *
 * Why not just assign a normal map the way the terrain disc does: the landmark
 * meshes are exported with **no UVs at all**. `tools/blender/common.py` builds
 * everything from lofted cross-sections and raw vertex lists, so `export_glb`
 * writes COLOR_0 and NORMAL and nothing else. A conventional `normalMap` reads
 * `vNormalMapUv`, which without a `uv` attribute arrives as (0, 0) for every
 * fragment — the texture loads, the material compiles, the parameter is set,
 * and the surface looks exactly as it did before.
 *
 * Triplanar projection needs no UVs. It samples the map three times, once per
 * world axis, and blends by how much the surface faces each one. The other
 * thing it buys is *world-space* texel density: one tile covers the same number
 * of units on a thirty-metre terrace and on a hand-sized console, so the grain
 * never stretches to fit the object.
 */

const DETAIL_MAP_URL = '/textures/stone_normal.png';

/**
 * World units covered by one tile.
 *
 * Landmarks are read from ten to thirty units away, so a fine map is invisible
 * on them and a coarse one turns the terraces into visual static. 1.8 keeps
 * roughly six tiles across the widest terrace step.
 */
const DETAIL_TILE = 1.8;

/**
 * How far the map is allowed to tilt the surface normal.
 *
 * This is a relief *hint* under a faceted low-poly model, not the primary
 * lighting. Past about 0.5 the stone stops reading as stone and starts
 * shimmering along every silhouette edge.
 */
const DETAIL_STRENGTH = 0.42;

const PATCH_FLAG = 'ilmekSurfaceDetail';

/** Set on materials that must stay smooth: the player character and its spark. */
export const NO_DETAIL_FLAG = 'ilmekNoDetail';

/**
 * Fragment body spliced in after `normal_fragment_maps`.
 *
 * Each projection samples with its own tangent basis, and the blend is done in
 * world space because that is the only space all three of them share:
 *
 * | projection | U -> | V -> | N -> | tangent (x, y, z) becomes |
 * |------------|-------|-------|-------|---------------------------|
 * | `.zy`      | Z     | Y     | X     | `(z, y, x)`               |
 * | `.xz`      | X     | Z     | Y     | `(x, z, y)`               |
 * | `.xy`      | X     | Y     | Z     | `(x, y, z)`               |
 *
 * Getting one of those swaps wrong is silent: the grain still appears, it just
 * leans the wrong way on one axis and the stone looks subtly wind-blown.
 *
 * `vDetailNrm` is derived from the raw `normal` attribute rather than
 * `objectNormal`, which does not exist when a material is flat-shaded and would
 * fail the shader compile outright.
 */
const TRIPLANAR_FRAGMENT = /* glsl */ `
  {
    vec3 axis = normalize(vDetailNrm);
    // Weight each axis by how squarely the surface faces it. Raising to the
    // fourth power keeps the blend hard: a smooth lerp would smear the map
    // across the 45-degree corners of every box in the set.
    vec3 w = abs(axis);
    w *= w;
    w *= w;
    w /= max(w.x + w.y + w.z, 1e-4);

    float scale = 1.0 / uDetailTile;
    vec3 nx = texture2D(uDetailNormal, vDetailPos.zy * scale).xyz * 2.0 - 1.0;
    vec3 ny = texture2D(uDetailNormal, vDetailPos.xz * scale).xyz * 2.0 - 1.0;
    vec3 nz = texture2D(uDetailNormal, vDetailPos.xy * scale).xyz * 2.0 - 1.0;
    nx.xy *= uDetailStrength;
    ny.xy *= uDetailStrength;
    nz.xy *= uDetailStrength;

    vec3 world = w.x * nx.zyx + w.y * ny.xzy + w.z * nz.xyz;
    world = normalize(world) * (gl_FrontFacing ? 1.0 : -1.0);
    normal = normalize((viewMatrix * vec4(world, 0.0)).xyz);
  }
`;

function patchMaterial(material: THREE.MeshStandardMaterial, map: THREE.Texture): void {
  material.userData[PATCH_FLAG] = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetailNormal = { value: map };
    shader.uniforms.uDetailTile = { value: DETAIL_TILE };
    shader.uniforms.uDetailStrength = { value: DETAIL_STRENGTH };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vDetailPos;
varying vec3 vDetailNrm;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vDetailPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vDetailNrm = normalize(mat3(modelMatrix) * normal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uDetailNormal;
uniform float uDetailTile;
uniform float uDetailStrength;
varying vec3 vDetailPos;
varying vec3 vDetailNrm;`,
      )
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${TRIPLANAR_FRAGMENT}`);
  };
  material.needsUpdate = true;
}

/**
 * Patch every stone-like material under `root`.
 *
 * Called once per landmark asset, and once for the whole scene so the
 * procedural geometry — the bridge decks, the aqueduct — is not left as the
 * only untextured surfaces in the world. `useGLTF` caches and hands back the
 * *same* scene for a given URL, so this walks shared materials repeatedly;
 * patching is guarded by a flag on the material, because injecting the varyings
 * twice would declare them twice and the program would fail to link.
 *
 * The exclusions are all cases where the map would be wrong rather than merely
 * unhelpful:
 *
 * * **Instanced meshes** put the per-instance transform in `instanceMatrix`,
 *   which `project_vertex` applies to `mvPosition` only. `modelMatrix` does not
 *   contain it, so a world-space projection would sample the same spot for
 *   every copy of a rock and the grain would visibly repeat across the field.
 * * **Flat-shaded materials** take their normal from screen-space derivatives,
 *   not from the attribute. The patch overwrites `normal` wholesale, so it
 *   would replace faceting with the mesh's smooth normals — the island cliff
 *   would stop looking like rock.
 * * **Materials that already have a `normalMap`** are textured with planar UVs
 *   that tile correctly (the terrain disc). Adding a second projection on top
 *   just fights the first.
 * * **Glass and self-lit parts** are not stone. Grain on a transparent surface
 *   reads as dirt on the lens, and on an emissive one it does nothing, since
 *   emission is added after the lighting.
 *
 * Returns how many materials were patched, so a caller can poll until the
 * scene stops offering new ones.
 */
export function applySurfaceDetail(root: THREE.Object3D, map: THREE.Texture): number {
  let patched = 0;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh & { isInstancedMesh?: boolean };
    if (!mesh.isMesh || mesh.isInstancedMesh) return;
    const material = mesh.material as THREE.MeshStandardMaterial | undefined;
    if (!material || !material.isMeshStandardMaterial) return;
    if (material.flatShading || material.normalMap) return;
    if (material.transparent || material.opacity < 1) return;
    const emissive = material.emissive;
    if (emissive && emissive.r + emissive.g + emissive.b > 0.001) return;
    if (material.userData[PATCH_FLAG] || material.userData[NO_DETAIL_FLAG]) return;
    patchMaterial(material, map);
    patched += 1;
  });
  return patched;
}

/** Warms the detail map so the first landmark does not flash untextured. */
export function preloadSurfaceDetail(): void {
  try {
    useTexture.preload(DETAIL_MAP_URL);
  } catch {
    /* a missing map simply leaves the landmarks untextured */
  }
}

/** Configures the shared texture and returns it for `applySurfaceDetail`. */
export function useSurfaceDetailMap(): THREE.Texture {
  const map = useTexture(DETAIL_MAP_URL);
  useEffect(() => {
    // A three.js `Texture` is a mutable description of a GPU upload, not React
    // state — every drei consumer configures it exactly this way, and the
    // terrain disc in `Atmosphere.tsx` does the same. The lint rule reads the
    // assignment as state mutation; that reading does not apply here.
    // oxlint-disable-next-line react/immutability
    map.colorSpace = THREE.NoColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 8;
    map.needsUpdate = true;
  }, [map]);
  return map;
}