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

/**
 * A caster lifted far enough off the ground that its shadow lands somewhere the
 * player cannot connect to the thing casting it.
 *
 * The tapestry was the case in point: fourteen 3x4.6 panels and a 52-unit beam
 * between 15 and 20 units of altitude, dropping a hard band at half the ground's
 * brightness straight across the middle of the hub. Nothing was wrong with the
 * lighting, the albedo or the shadow map — the band was a correct shadow of a
 * real object. But at the resting camera the tapestry sits 57 degrees up, well
 * outside a 29-degree half-frame, so the band had nothing in frame to explain
 * it and read as a stain on the sand.
 *
 * The threshold is what separates that from ordinary scenery. Everything else
 * in the world that casts sits between 3.6 and 5.8 units up, and a shadow
 * thrown from there lands within a unit or two of its own caster, close enough
 * for the eye to connect them. Height is the only test: on the shipped world
 * nothing else clears eight, and a span rule was tried and dropped because it
 * hid the very meshes that drew the band — fourteen panels of 3.1 units across
 * are narrower than any mast-like cutoff worth having.
 *
 * This is a screen, not a verdict, and on the shipped world it reports one
 * caster: the synthesis tree's canopy, 20 metres across at 13 units, whose
 * shadow falls 11 units away onto a tree the player is looking straight at.
 * That one is accepted. It stayed in the list while the tapestry sat at the top
 * of it for years without anyone reading it, which is the argument for the
 * check existing and also for reading what it says.
 */
export const ORPHAN_CASTER_MIN_HEIGHT = 8;

export interface OrphanCasterReport {
  name: string;
  /** Lowest world-space point of the caster, in units above the ground. */
  baseHeight: number;
  /** Largest horizontal extent, in units — context for judging, not a test. */
  span: number;
}

/**
 * Lists shadow casters whose shadow is dropped on ground far from themselves.
 *
 * Returns `[]` on a sound scene, which is the point: this is a standing check,
 * not a one-off repair, so the next thing built at altitude is caught by the
 * same test that caught the tapestry.
 */
export function findOrphanShadowCasters(root: THREE.Object3D): OrphanCasterReport[] {
  const out: OrphanCasterReport[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !(mesh as unknown as { castShadow?: boolean }).castShadow) return;
    const geometry = mesh.geometry;
    if (!geometry?.getAttribute?.('position')) return;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return;
    const world = box.clone().applyMatrix4(o.matrixWorld);
    if (world.min.y < ORPHAN_CASTER_MIN_HEIGHT) return;
    const span = Math.max(world.max.x - world.min.x, world.max.z - world.min.z);
    out.push({ name: o.name || '(unnamed)', baseHeight: +world.min.y.toFixed(2), span: +span.toFixed(2) });
  });
  return out.sort((a, b) => b.baseHeight - a.baseHeight || b.span - a.span);
}