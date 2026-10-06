import { describe, expect, it } from 'vitest';
import { clampToWalkable, initNavigation, isWalkable, distanceToWalkable } from '../src/world/navigation';
import { REGIONS } from '../src/catalog/regions';

const ALL_REGIONS = REGIONS.map((r) => r.id);

describe('walkable containment', () => {
  it('treats island centres as walkable', () => {
    initNavigation(ALL_REGIONS);
    expect(isWalkable(0, 0)).toBe(true);
    expect(isWalkable(138, -84)).toBe(true);
  });

  it('treats open sky far from any path as not walkable', () => {
    initNavigation(ALL_REGIONS);
    // Far out in every direction, well clear of any bridge corridor.
    expect(isWalkable(-260, -260)).toBe(false);
    expect(isWalkable(400, 400)).toBe(false);
    expect(isWalkable(0, 340)).toBe(false);
  });

  it('keeps a point on a built span walkable', () => {
    initNavigation(ALL_REGIONS);
    // This lies on the span between the hub and the council city.
    expect(isWalkable(70, -40)).toBe(true);
  });

  it('withholds a span that has not been built yet', () => {
    // With nothing restored, only the islands themselves are walkable.
    initNavigation([]);
    expect(isWalkable(70, -40)).toBe(false);
    expect(isWalkable(0, 0)).toBe(true);
    expect(isWalkable(0, 80)).toBe(false);
  });

  it('always produces a walkable result, whichever area is nearest', () => {
    initNavigation(ALL_REGIONS);
    const out = { x: 0, z: 0 };
    for (const [x, z] of [
      [60, 0], [-60, 0], [0, 200], [0, -200],
      [400, 400], [-300, 120], [260, -180],
    ]) {
      clampToWalkable(x, z, out);
      expect(isWalkable(out.x, out.z), `clamp(${x},${z})`).toBe(true);
    }
  });

  it('pulls a player back onto land rather than leaving them in the sky', () => {
    initNavigation(ALL_REGIONS);
    const out = { x: 0, z: 0 };
    clampToWalkable(-60, 0, out);
    expect(isWalkable(out.x, out.z)).toBe(true);
  });

  it('never leaves the player further from land than the margin allows', () => {
    initNavigation([]);
    const out = { x: 0, z: 0 };
    // With no spans built, everything off the islands must come back onto one.
    for (const [x, z] of [[-60, 0], [0, 200], [0, -200], [250, 0], [-250, -250]]) {
      clampToWalkable(x, z, out);
      expect(isWalkable(out.x, out.z), `(${x},${z})`).toBe(true);
    }
  });

  it('keeps the bridge corridor walkable', () => {
    initNavigation(ALL_REGIONS);
    const mid = { x: 69, z: -42 };
    expect(distanceToWalkable(mid.x, mid.z)).toBeLessThan(3.2);
  });
});
