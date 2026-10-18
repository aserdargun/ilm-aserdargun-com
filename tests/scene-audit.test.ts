import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  findPiledModels,
  findUncoveredPlatforms,
  isGltfRoot,
  placedModels,
} from '../src/world/scene-audit';

/**
 * Twenty-eight puzzle consoles were drawing their authored plinth at a single
 * point beside the spawn, because drei hands every `<Asset>` asking for the same
 * file the same Object3D. Nothing threw, every mesh was still submitted, and
 * every frame count looked healthy — so no pixel test and no unit test on the
 * components would have caught it.
 *
 * What does catch it is a scene-graph fact: a model drawn N times must occupy N
 * places. These tests pin that, and they fail if the grouping is wrong in either
 * direction — a model wrongly reported as piled, and a piled model reported
 * clean.
 */

const at = (x: number, y: number, z: number): [number, number, number] => [x, y, z];

describe('findPiledModels', () => {
  it('reports nothing when every instance stands somewhere different', () => {
    const placed = [
      { signature: '657v/4m', position: at(0, 0, 0) },
      { signature: '657v/4m', position: at(-120, 0, -86) },
      { signature: '657v/4m', position: at(150, 0, 84) },
    ];
    expect(findPiledModels(placed)).toEqual([]);
  });

  it('reports the exact shape of the console bug: 28 instances, 1 place', () => {
    const piled = Array.from({ length: 28 }, () => ({ signature: '657v/4m', position: at(4, 0, 30) }));
    const reports = findPiledModels(piled);
    expect(reports).toHaveLength(1);
    expect(reports[0].instances).toBe(28);
    expect(reports[0].distinctPositions).toBe(1);
    expect(reports[0].signature).toBe('657v/4m');
  });

  it('ignores a single instance, which cannot be piled', () => {
    expect(findPiledModels([{ signature: '5666v/3m', position: at(0, 0, 0) }])).toEqual([]);
  });

  it('keeps models of different sizes apart', () => {
    // Two different GLBs that happen to sit on top of each other are not a bug.
    const placed = [
      { signature: '720v/2m', position: at(0, 0, 0) },
      { signature: '536v/4m', position: at(0, 0, 0) },
    ];
    expect(findPiledModels(placed)).toEqual([]);
  });

  it('treats positions within the tolerance as the same place', () => {
    const placed = [
      { signature: '657v/4m', position: at(4, 0, 30) },
      { signature: '657v/4m', position: at(4, 0, 30.005) },
    ];
    const reports = findPiledModels(placed, 0.01);
    expect(reports[0].distinctPositions).toBe(1);
    expect(findPiledModels(placed, 0.001)).toEqual([]);
  });

  it('sorts the most piled model first, so the worst one is not buried', () => {
    const many = Array.from({ length: 12 }, () => ({ signature: 'a', position: at(0, 0, 0) }));
    const few = Array.from({ length: 3 }, () => ({ signature: 'b', position: at(1, 0, 0) }));
    expect(findPiledModels([...few, ...many]).map((r) => r.signature)).toEqual(['a', 'b']);
  });
});

describe('placedModels', () => {
  /** A GLB root: `meshes` meshes sharing out a total of `totalVerts` vertices. */
  function gltf(name: string, meshes: number, totalVerts: number): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    const base = Math.floor(totalVerts / meshes);
    for (let i = 0; i < meshes; i += 1) {
      const count = i === meshes - 1 ? totalVerts - base * (meshes - 1) : base;
      const m = new THREE.Mesh(new THREE.BufferGeometry());
      m.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
      g.add(m);
    }
    return g;
  }

  it('counts GLB roots and ignores the groups that contain them', () => {
    // A console as the scene actually builds it: a host group holding the GLB
    // root holding its meshes. Counting the host too would make every model look
    // like it appears twice, which is exactly the mistake the first version of
    // this probe made.
    const root = new THREE.Group();
    const host = new THREE.Group();
    host.add(gltf('Scene', 4, 657));
    root.add(host);

    const placed = placedModels(root, isGltfRoot);
    expect(placed).toHaveLength(1);
    expect(placed[0].signature).toBe('657v/4m');
  });

  it('reads world position, not local, so a moved host is noticed', () => {
    const root = new THREE.Group();
    const host = new THREE.Group();
    host.position.set(0, 0, -86);
    host.add(gltf('Scene', 4, 657));
    root.add(host);

    const placed = placedModels(root, isGltfRoot);
    expect(placed[0].position).toEqual(at(0, 0, -86));
  });

  it('finds the real bug end to end through the graph', () => {
    const root = new THREE.Group();
    for (let i = 0; i < 28; i += 1) {
      const host = new THREE.Group();
      host.position.set(4, 0, 30); // every plinth stacked at one point
      host.add(gltf('Scene', 4, 657));
      root.add(host);
    }
    const reports = findPiledModels(placedModels(root, isGltfRoot));
    expect(reports).toHaveLength(1);
    expect(reports[0].instances).toBe(28);
    expect(reports[0].distinctPositions).toBe(1);
  });

  it('passes on a scene where every console has its own plinth', () => {
    const root = new THREE.Group();
    const anchors = [at(0, 0, 11), at(-146, 0, -90), at(-120, 0, -86), at(150, 0, 84)];
    for (const [x, , z] of anchors) {
      const host = new THREE.Group();
      host.position.set(x, 0, z);
      host.add(gltf('Scene', 4, 657));
      root.add(host);
    }
    expect(findPiledModels(placedModels(root, isGltfRoot))).toEqual([]);
  });
});
/**
 * A platform the player can stand inside.
 *
 * The character mesh reports `visible`, projects to a real screen position, and
 * the pixels there are bare ground. Nothing throws and every frame count is
 * healthy, so what catches it is the same kind of scene-graph fact as the piled
 * consoles above: geometry the player can occupy that no collider covers.
 *
 * These build the shapes rather than loading them, so the test says what the
 * audit is for without a GLB — and fails if the audit stops catching them.
 */

/** A squat cylinder resting on the ground: base 0, top `top`. */
function platform(name: string, radius: number, top: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, top, 24));
  mesh.name = name;
  // A cylinder is built about its own centre, so it has to be lifted by half its
  // height to *stand on* the floor rather than straddle it.
  mesh.position.y = top / 2;
  mesh.updateMatrixWorld(true);
  return mesh;
}

/** A beam high enough that the player walks under it. */
function overhead(name: string, radius: number, bottom: number, top: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 2, top - bottom, radius * 2),
  );
  mesh.name = name;
  mesh.position.y = (bottom + top) / 2;
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('findUncoveredPlatforms', () => {
  it('passes on a platform a collider reaches past the edge of', () => {
    const root = new THREE.Group();
    root.add(platform('terrace', 15, 1.7));
    const colliders = [{ x: 0, z: 0, radius: 15.2 }];
    expect(findUncoveredPlatforms(root, colliders)).toEqual([]);
  });

  it('reports the canal: a 15-unit slab behind a 7-unit ring', () => {
    const root = new THREE.Group();
    root.add(platform('beam_low_3', 15, 0.7));
    const reports = findUncoveredPlatforms(root, [{ x: 0, z: 0, radius: 7 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0].name).toBe('beam_low_3');
    expect(reports[0].radius).toBeCloseTo(15, 1);
    expect(reports[0].uncoveredBy).toBeCloseTo(8, 1);
  });

  it('ignores something the player walks under, not into', () => {
    // The loom's beams are wider than the canal and would flood the report if
    // height from the floor were not part of the test.
    const root = new THREE.Group();
    root.add(overhead('beam_low_1', 10, 5.8, 8));
    expect(findUncoveredPlatforms(root, [{ x: 0, z: 0, radius: 7 }])).toEqual([]);
  });

  it('ignores a kerb the player steps over', () => {
    const root = new THREE.Group();
    root.add(platform('lip', 3.5, 0.4));
    expect(findUncoveredPlatforms(root, [])).toEqual([]);
  });

  it('ignores the ground disc itself', () => {
    const root = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(42, 42, 0.4, 32));
    ground.name = 'island';
    ground.updateMatrixWorld(true);
    root.add(ground);
    expect(findUncoveredPlatforms(root, [])).toEqual([]);
  });

  it('sorts the worst hole first, so it cannot be buried in the list', () => {
    const root = new THREE.Group();
    root.add(platform('small', 2, 1));
    root.add(platform('huge', 15, 0.7));
    // A ring this small leaves both uncovered: a radius-2 platform is *inside* a
    // radius-3 collider, which is the point of the other test.
    const reports = findUncoveredPlatforms(root, [{ x: 0, z: 0, radius: 0.6 }]);
    expect(reports.map((r) => r.name)).toEqual(['huge', 'small']);
  });

  it('reports a platform whose collider sits on the right island but the wrong spot', () => {
    // A collider 10 units away does not cover a platform even at the same radius.
    const root = new THREE.Group();
    root.add(platform('off', 5, 1));
    const reports = findUncoveredPlatforms(root, [{ x: 10, z: 0, radius: 5 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0].uncoveredBy).toBeCloseTo(10, 1);
  });
});
