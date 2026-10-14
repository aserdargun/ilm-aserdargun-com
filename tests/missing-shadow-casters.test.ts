import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  GROUND_CASTER_BOTTOM_MAX,
  GROUND_CASTER_MIN_SIZE,
  findMissingShadowCasters,
} from '../src/world/scene-audit';

/**
 * The bridge rails, from the other side of `findOrphanShadowCasters`.
 *
 * That check asks whether a shadow lands somewhere the player cannot connect it to.
 * This one asks whether something the player is looking at is *not* attached to the
 * ground at all, because the tie is missing. Both are scene-graph facts, and both
 * were invisible to the eye until the frame was put side by side.
 *
 * The rails are twenty-eight boxes — fourteen turquoise and fourteen copper, two per
 * side of each of the seven bridges — and none of them had `castShadow`. The deck
 * beneath them did receive, so the frame was correctly lit and there was no
 * diagnostic anywhere: a turquoise rail that casts nothing is a stripe painted onto
 * the deck, not a thing standing on it.
 */

const box = (w: number, h: number, d: number, x: number, y: number, z: number, cast: boolean) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d));
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  return mesh;
};

/** One bridge rail pair as `Scene.tsx` builds them: turquoise at y 0.5, copper at 1.1. */
function railPair(): THREE.Group {
  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    group.add(box(0.3, 0.6, 110, side * 5.8, 0.5, 0, false));
    group.add(box(0.16, 0.7, 110, side * 5.8, 1.1, 0, false));
  }
  return group;
}

describe('findMissingShadowCasters', () => {
  it('reports the rails while they cast nothing', () => {
    const reports = findMissingShadowCasters(railPair());
    expect(reports).toHaveLength(4);
    expect(reports.every((r) => r.height > GROUND_CASTER_MIN_SIZE)).toBe(true);
  });

  it('is silent once the rails cast', () => {
    const group = railPair();
    group.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
    expect(findMissingShadowCasters(group)).toEqual([]);
  });

  it('ignores something floating well clear of the ground', () => {
    // An object three units up is the orphan-caster screen's business, not this one.
    const floating = box(2, 2, 2, 0, 4, 0, false);
    expect(findMissingShadowCasters(floating)).toEqual([]);
  });

  it('ignores something buried in the ground', () => {
    const buried = box(2, 2, 2, 0, -1.4, 0, false);
    expect(findMissingShadowCasters(buried)).toEqual([]);
  });

  it('ignores anything too small to read as attached or detached', () => {
    const pebble = box(0.2, 0.2, 0.2, 0, 0.1, 0, false);
    expect(findMissingShadowCasters(pebble)).toEqual([]);
  });

  it('still reports the seven bridge decks, which is a deliberate exception', () => {
    // They are half a unit thick over open sky with nothing underneath to receive a
    // shadow. The audit reports rather than judges, so this is what it should say.
    const decks = new THREE.Group();
    for (let i = 0; i < 7; i++) decks.add(box(12, 0.5, 100, i * 3, 0.6, 0, false));
    expect(findMissingShadowCasters(decks)).toHaveLength(7);
  });

  it('reports the resting point and the size it judged on', () => {
    const reports = findMissingShadowCasters(box(3, 0.8, 3, 12, 0.4, -4, false));
    expect(reports).toHaveLength(1);
    expect(reports[0].bottom).toBeCloseTo(0, 2);
    expect(reports[0].height).toBeCloseTo(0.8, 2);
    expect(reports[0].span).toBeCloseTo(3, 2);
  });

  it('uses the documented thresholds', () => {
    expect(GROUND_CASTER_BOTTOM_MAX).toBe(1);
    expect(GROUND_CASTER_MIN_SIZE).toBe(0.4);
  });

  it('reads world transforms, so a scaled or moved mesh is judged where it stands', () => {
    const group = new THREE.Group();
    group.position.set(200, 0, 0);
    const mesh = box(3, 0.8, 3, 0, 0.4, 0, false);
    mesh.scale.set(2, 1, 2);
    group.add(mesh);
    const reports = findMissingShadowCasters(group);
    expect(reports).toHaveLength(1);
    expect(reports[0].span).toBeCloseTo(6, 2);
  });

  it('returns an empty list for an empty scene', () => {
    expect(findMissingShadowCasters(new THREE.Group())).toEqual([]);
  });
});