import { useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { REGIONS, type RegionDef } from '../catalog/regions';
import { makeRng } from '../systems/types';
import { addCollider, clearColliders } from './collision';
import type { RegionId } from '../types/catalog';

/**
 * CC0 props adopted from KayKit Prototype Bits (see public/models/ATTRIBUTION.md).
 *
 * All fourteen props ship in one GLB sharing a single atlas, so each is turned
 * into an instanced mesh at load time: a hundred placed barrels still cost one
 * draw call.
 */

const PROP_SCALE = 0.62;

/** Which props belong to which region, and roughly how many of each. */
const REGION_DRESSING: Partial<Record<RegionId, Record<string, number>>> = {
  'memory-council-city': {
    Pillar_A: 8,
    Pillar_B: 6,
    Wall_Half: 5,
    Wall_Window_Open: 3,
    Primitive_Stairs: 2,
  },
  'cartographers-terrace': {
    Pillar_B: 6,
    Wall_Half: 4,
    Primitive_Stairs: 3,
    Box_A: 3,
  },
  'flow-foundry': {
    table_medium: 6,
    Primitive_Beam: 8,
    Box_C: 5,
    Box_B: 4,
    Barrel_C: 4,
  },
  'adaptation-cloud-harbor': {
    Barrel_A: 8,
    Barrel_C: 6,
    Box_A: 6,
    Box_B: 5,
    Pallet_Large: 4,
    Can_A: 5,
  },
  'collective-gardens': {
    Barrel_A: 4,
    Pallet_Large: 3,
    table_medium: 3,
    Can_A: 4,
  },
  'observers-mirrors': {
    Pillar_A: 7,
    Pillar_B: 5,
    Wall_Window_Open: 4,
  },
  'valley-living-machines': {
    Barrel_C: 6,
    Can_A: 5,
    Box_C: 6,
    Pallet_Large: 3,
    Box_A: 4,
  },
};

export function preloadProps(): void {
  try {
    useGLTF.preload('/models/props.glb');
  } catch {
    /* a missing props file simply places nothing */
  }
}

interface Placement {
  matrix: THREE.Matrix4;
  x: number;
  z: number;
  /** Horizontal footprint radius at this instance's scale. */
  radius: number;
}

/**
 * Deterministic positions per region: props form loose rings and clusters
 * around the landmark rather than a uniform grid, and the centre is left clear
 * so the landmark stays readable.
 */
function buildPlacements(
  meshes: Map<string, THREE.BufferGeometry>,
): Map<string, Placement[]> {
  const out = new Map<string, Placement[]>();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(PROP_SCALE, PROP_SCALE, PROP_SCALE);
  const euler = new THREE.Euler();

  REGIONS.forEach((region: RegionDef, regionIndex) => {
    const dressing = REGION_DRESSING[region.id];
    if (!dressing) return;

    const centreX = region.anchor[0];
    const centreZ = region.anchor[2];

    for (const [propName, count] of Object.entries(dressing)) {
      const geometry = meshes.get(propName);
      if (!geometry) continue;
      const list = out.get(propName) ?? [];

      for (let i = 0; i < count; i += 1) {
        const rng = makeRng(regionIndex * 7919 + propName.length * 131 + i * 37);
        const angle = rng() * Math.PI * 2;
        // Keep clear of the landmark in the middle of the disc.
        const distance = region.radius * (0.42 + rng() * 0.5);
        position.set(
          centreX + Math.cos(angle) * distance,
          0,
          centreZ + Math.sin(angle) * distance,
        );
        euler.set(0, rng() * Math.PI * 2, 0);
        quaternion.setFromEuler(euler);
        // A little size variation keeps rows from reading as stamped copies.
        const s = PROP_SCALE * (0.85 + rng() * 0.35);
        scale.set(s, s, s);
        matrix.compose(position, quaternion, scale);

        // Footprint: anything wide enough to be worth walking around blocks.
        const box = geometry?.boundingBox;
        let radius = 0.6;
        if (box) {
          const width = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5;
          radius = width * s;
        }
        list.push({ matrix: matrix.clone(), x: position.x, z: position.z, radius });
      }
      out.set(propName, list);
    }
  });

  return out;
}

export function PropScatter() {
  const gltf = useGLTF('/models/props.glb') as unknown as {
    scene: THREE.Group;
  };
  const group = useRef<THREE.Group>(null);

  /**
   * One shared geometry per named prop, each lifted so its base sits at y = 0.
   *
   * Several source models are authored centred on their origin and the glTF
   * exporter carries no offset through, so grounding happens here where it can
   * be verified rather than trusting the file.
   */
  const meshes = useMemo(() => {
    const found = new Map<string, THREE.BufferGeometry>();
    gltf.scene.traverse((child: unknown) => {
      const node = child as THREE.Mesh;
      if (!node?.isMesh || !node.name) return;
      const geometry = node.geometry.clone();
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (box) {
        const lift = -box.min.y;
        if (Math.abs(lift) > 1e-4) geometry.translate(0, lift, 0);
        // Sit the prop on its footprint rather than its axis.
        geometry.translate(-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2);
      }
      geometry.computeBoundingSphere();
      found.set(node.name, geometry);
    });
    return found;
  }, [gltf]);

  const placements = useMemo(() => buildPlacements(meshes), [meshes]);

  /**
   * Register the same placements as colliders. Small props are walk-through:
   * a crate you can step over is not an obstacle, a pillar is.
   */
  useLayoutEffect(() => {
    clearColliders('props');
    for (const [, list] of placements) {
      for (const placement of list) {
        // Anything wider than a hand's breadth would visibly clip the player,
        // so it blocks. Smaller flat pieces stay walkable.
        if (placement.radius < 0.14) continue;
        addCollider({
          x: placement.x,
          z: placement.z,
          radius: placement.radius,
          // KayKit props are authored around 4 units tall; scale them the same
          // way the instance matrix does.
          height: 4.0 * (PROP_SCALE * 0.62) * (placement.radius > 0.5 ? 1 : 0.5),
          owner: 'props',
        });
      }
    }
  }, [placements]);

  useLayoutEffect(() => {
    // The instanced meshes are created declaratively below; nothing to do.
  }, []);

  return (
    <group ref={group}>
      {[...placements.entries()].map(([name, list]) => {
        const geometry = meshes.get(name);
        if (!geometry) return null;
        return <PropInstances key={name} name={name} geometry={geometry} list={list} />;
      })}
    </group>
  );
}

function PropInstances({
  name,
  geometry,
  list,
}: {
  name: string;
  geometry: THREE.BufferGeometry;
  list: Placement[];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const gltf = useGLTF('/models/props.glb') as unknown as { scene: THREE.Group };

  // Reuse the material authored in the source file so the atlas still maps.
  const material = useMemo(() => {
    let found: THREE.Material | null = null;
    gltf.scene.traverse((child: unknown) => {
      const node = child as THREE.Mesh;
      if (!found && node?.isMesh && node.name === name && node.material) {
        found = node.material as THREE.Material;
      }
    });
    const resolved =
      found ?? new THREE.MeshStandardMaterial({ color: '#b9ac93', roughness: 0.9 });
    // Matched to the authored landmarks (see Models.tsx): the props are placed
    // right beside them, and at a different reflection strength the same
    // material reads as a different one.
    if ('envMapIntensity' in resolved) {
      (resolved as { envMapIntensity: number }).envMapIntensity = 1;
    }
    // Baked vertex AO. `adopt_props.py` ray-traces each prop in isolation —
    // necessary here, because these become instanced meshes, so any occlusion
    // from a neighbour at bake time would be repeated at every placement.
    // Gated on the attribute being present: a material that expects vertex
    // colours the geometry does not carry renders as undefined output rather
    // than falling back cleanly.
    if ('vertexColors' in resolved) {
      (resolved as { vertexColors: boolean }).vertexColors = Boolean(
        geometry.getAttribute('color'),
      );
    }
    return resolved;
  }, [gltf, name, geometry]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    list.forEach((placement, index) => {
      mesh.setMatrixAt(index, placement.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [list]);

  if (list.length === 0) return null;

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, list.length]}
      castShadow
      receiveShadow
      frustumCulled
    />
  );
}