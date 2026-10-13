import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ORPHAN_CASTER_MIN_HEIGHT, findOrphanShadowCasters } from '../src/world/scene-audit';

/**
 * The hub's tapestry was fourteen 3x4.6 panels and a 52-unit beam between 15 and
 * 20 units of altitude, and it cast a shadow. Nothing was wrong with the light,
 * the albedo or the shadow map — the band that crossed the middle of the island
 * was a correct shadow of a real object, at half the ground's brightness, with a
 * three-sample edge. The defect was that at the resting camera the tapestry sits
 * 57 degrees up and out of frame, so the band had nothing above it to explain it
 * and read as a stain.
 *
 * No unit test on a component would have caught that, because nothing throws and
 * nothing is malformed. What catches it is a scene-graph fact: a caster more than
 * eight units off the ground drops its shadow too far away to be read as its own.
 */

/** The tapestry exactly as `UnfinishedTapestry` builds it in `World.tsx`. */
function tapestry(): THREE.Group {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.BoxGeometry(52, 0.7, 0.7));
  beam.position.set(0, 20.4, 0);
  beam.castShadow = true;
  group.add(beam);

  for (let i = 0; i < 14; i++) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.1, 4.6, 0.09));
    panel.position.set((i - 6.5) * 3.4, 17.5, 0);
    panel.castShadow = true;
    group.add(panel);
  }

  const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 10, 8));
  frame.position.set(26, 16.5, 0);
  frame.rotation.z = Math.PI / 2;
  frame.castShadow = true;
  group.add(frame);

  return group;
}

const setCasting = (root: THREE.Object3D, on: boolean) => {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = on;
  });
};

describe('findOrphanShadowCasters', () => {
  it('names every mesh that made the band: 14 panels, a beam and a frame', () => {
    const reports = findOrphanShadowCasters(tapestry());
    expect(reports).toHaveLength(16);
    expect(Math.min(...reports.map((r) => r.baseHeight))).toBeCloseTo(15.2, 1);
  });

  it('puts the 52-unit beam at the top of the list', () => {
    const reports = findOrphanShadowCasters(tapestry());
    expect(reports[0].span).toBeCloseTo(52, 1);
    expect(reports[0].baseHeight).toBeCloseTo(20.05, 2);
  });

  it('comes back empty once the tapestry stops casting — the fix', () => {
    const group = tapestry();
    expect(findOrphanShadowCasters(group)).not.toEqual([]);
    setCasting(group, false);
    expect(findOrphanShadowCasters(group)).toEqual([]);
  });

  it('leaves ordinary scenery alone', () => {
    // The tallest things that cast anywhere else in the world, at the heights
    // measured in the scene: a terrace edge at 3.6, a trunk at 4.1, a beam at 5.8.
    const scene = new THREE.Group();
    for (const [y, span] of [[3.6, 19.9], [4.1, 14.7], [5.8, 19.7]] as const) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(span, 0.5, span));
      mesh.position.y = y;
      mesh.castShadow = true;
      scene.add(mesh);
    }
    expect(findOrphanShadowCasters(scene)).toEqual([]);
  });

  it('ignores a wide, low caster — which is why span is not the test', () => {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(400, 0.2, 400));
    slab.position.y = 0.1;
    slab.castShadow = true;
    expect(findOrphanShadowCasters(slab)).toEqual([]);
  });

  it('ignores anything that is not flagged as a caster', () => {
    const group = tapestry();
    setCasting(group, false);
    const watcher = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4));
    watcher.position.y = 40;
    group.add(watcher);
    expect(findOrphanShadowCasters(group)).toEqual([]);
  });

  it('measures the world box, so a parent transform cannot hide a caster', () => {
    const parent = new THREE.Group();
    parent.position.set(100, 3, -40);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.1, 4.6, 0.09));
    panel.position.y = 12;
    panel.castShadow = true;
    parent.add(panel);

    const reports = findOrphanShadowCasters(parent);
    expect(reports).toHaveLength(1);
    // Local floor is 12 - 2.3; the parent lifts the whole thing by 3.
    expect(reports[0].baseHeight).toBeCloseTo(12.7, 2);
  });

  it('reports nothing for an empty scene', () => {
    expect(findOrphanShadowCasters(new THREE.Group())).toEqual([]);
  });

  it('keeps the threshold at the height the measurement justified', () => {
    // 5.8 was the tallest legitimate caster in the world; 15.2 the tapestry's
    // lowest panel. Eight sits between them with room on both sides.
    expect(ORPHAN_CASTER_MIN_HEIGHT).toBeGreaterThan(5.8);
    expect(ORPHAN_CASTER_MIN_HEIGHT).toBeLessThan(15.2);
  });
});