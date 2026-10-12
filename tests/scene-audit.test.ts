import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { findPiledModels, isGltfRoot, placedModels } from '../src/world/scene-audit';

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