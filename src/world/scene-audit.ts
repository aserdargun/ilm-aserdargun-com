import type * as THREE from 'three';

/**
 * One placed model in the scene graph: enough to tell two instances of the same
 * GLB apart from two different models that happen to be the same size.
 */
export interface PlacedModel {
  /** Vertex/mesh counts of the loaded scene, e.g. `"657v/4m"`. */
  signature: string;
  /** World position of the loaded scene's root. */
  position: [number, number, number];
}

export interface PiledReport {
  signature: string;
  instances: number;
  distinctPositions: number;
  positions: [number, number, number][];
}

/**
 * Finds models that are drawn in more places than they occupy.
 *
 * drei's `useModel` is memoised by name, so every `<Asset>` asking for the same
 * file is handed the *same* Object3D. Rendering one three.js node from several
 * `<primitive>` elements asks for several parents, the last one to mount wins,
 * and the rest are drawn silently in the wrong place — no error, no warning, and
 * the meshes are all still submitted, so nothing looks wrong in a frame count.
 *
 * That is not hypothetical: all twenty-eight puzzle consoles were drawing their
 * plinth at one point beside the spawn, and not one console had a plinth where
 * the player stands. This is the check that catches it, and it is a scene-graph
 * fact rather than a pixel one: a model drawn N times must occupy N places.
 */
export function findPiledModels(placed: PlacedModel[], tolerance = 0.01): PiledReport[] {
  const bySignature = new Map<string, [number, number, number][]>();
  for (const item of placed) {
    const list = bySignature.get(item.signature);
    if (list) list.push(item.position);
    else bySignature.set(item.signature, [item.position]);
  }

  const reports: PiledReport[] = [];
  for (const [signature, positions] of bySignature) {
    if (positions.length < 2) continue;
    const distinct: [number, number, number][] = [];
    for (const p of positions) {
      const seen = distinct.some(
        (q) => Math.abs(q[0] - p[0]) <= tolerance
            && Math.abs(q[1] - p[1]) <= tolerance
            && Math.abs(q[2] - p[2]) <= tolerance,
      );
      if (!seen) distinct.push(p);
    }
    if (distinct.length !== positions.length) {
      reports.push({ signature, instances: positions.length, distinctPositions: distinct.length, positions });
    }
  }
  return reports.sort((a, b) => b.instances - a.instances);
}

/**
 * Walks a three.js scene and records the world position of every loaded GLB
 * root. Only roots are counted: drei names them `Scene`, and including their
 * ancestors would double-count every model against itself.
 */
export function placedModels(root: THREE.Object3D, isRoot: (o: THREE.Object3D) => boolean): PlacedModel[] {
  const out: PlacedModel[] = [];
  root.traverse((o) => {
    if (!isRoot(o)) return;
    let verts = 0;
    let meshes = 0;
    o.traverse((c) => {
      const mesh = c as THREE.Mesh;
      const pos = mesh.geometry?.getAttribute?.('position');
      if (mesh.isMesh && pos) {
        meshes += 1;
        verts += pos.count;
      }
    });
    if (verts === 0) return;
    const world = o.getWorldPosition(o.position.clone());
    out.push({ signature: `${verts}v/${meshes}m`, position: [world.x, world.y, world.z] });
  });
  return out;
}

/** drei names every loaded GLB's root node `Scene`. */
export function isGltfRoot(o: THREE.Object3D): boolean {
  // `isGroup` lives on Group, not on the Object3D base class in three r186.
  return (o as THREE.Group).isGroup === true && o.name === 'Scene';
}