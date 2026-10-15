import { describe, expect, it } from 'vitest';
import { shadowBoxFor, type ShadowRegion } from '../src/world/Lighting';

/**
 * The shadow box used to be fitted to the island and nothing else, which left
 * two thirds of every bridge with no shadow at all: measured on the hub, a
 * player standing on the bridge is **98 units from the box centre with a box of
 * ±44**, so there is no shadow there rather than a soft one.
 *
 * These pin the rule the fix rests on: the island keeps the box while the player
 * is on it, and the box goes with the player once they are not. Getting either
 * half wrong is silent — the box still renders, the world still looks lit, and
 * the only symptom is a character floating.
 */

const HUB: ShadowRegion = { x: 0, z: 0, radius: 34 };
const SHOULDER = 10;
/** 2048 is the shipped map size on both tiers that render shadows. */
const MAP = 2048;

describe('the box the sun draws', () => {
  it('stays on the island while the player is inside it', () => {
    const box = shadowBoxFor({ x: 0, z: 0 }, HUB);
    expect(box).toEqual({ cx: 0, cz: 0, extent: 44 });
  });

  it('treats the last reachable point as still the island', () => {
    // radius + shoulder is exactly where the island box reaches, so inclusive
    // is the only boundary that does not hand the box over one step early.
    const box = shadowBoxFor({ x: 0, z: 44 }, HUB);
    expect(box.extent).toBe(44);
    expect(box.cz).toBe(0);
  });

  it('goes with the player one step past it', () => {
    const box = shadowBoxFor({ x: 0, z: 45 }, HUB);
    expect(box).toEqual({ cx: 0, cz: 45, extent: 24 });
  });

  it('follows the player out on a diagonal, not on the axis', () => {
    const box = shadowBoxFor({ x: 60, z: 60 }, HUB);
    expect(box.cx).toBe(60);
    expect(box.cz).toBe(60);
    expect(box.extent).toBe(24);
  });

  it('centres on the player when there is no island to fit to', () => {
    const box = shadowBoxFor({ x: -79, z: -58 }, null);
    expect(box).toEqual({ cx: -79, cz: -58, extent: 24 });
  });

  it('hands the box over past the shoulder, not at the rim', () => {
    // The island's own rim is at 34 and the box reaches 44 — the shoulder is
    // the ten units of return cast that bridges cross, and it belongs to the
    // island too. The hand-over is therefore at 44, not at the shoreline.
    expect(shadowBoxFor({ x: 34, z: 0 }, HUB).extent).toBe(44);
    expect(shadowBoxFor({ x: 43, z: 0 }, HUB).extent).toBe(44);
    expect(shadowBoxFor({ x: 45, z: 0 }, HUB).extent).toBe(24);
  });

  it('buys the player more shadow detail than the island ever gave them', () => {
    const island = shadowBoxFor({ x: 0, z: 0 }, HUB);
    const travel = shadowBoxFor({ x: 0, z: 80 }, HUB);
    const islandTexels = MAP / (2 * island.extent);
    const travelTexels = MAP / (2 * travel.extent);
    // 23.27 on the hub against 42.67 on a bridge: a player mid-crossing is
    // closer to the ground than an island ever is, so the tighter box is the
    // cheaper one. This is the whole argument for not widening the shoulder.
    expect(islandTexels).toBeCloseTo(23.27, 1);
    expect(travelTexels).toBeCloseTo(42.67, 1);
    expect(travelTexels).toBeGreaterThan(islandTexels);
  });

  it('never draws a box the player is standing outside of', () => {
    // The regression this exists to prevent, stated as a property: whatever the
    // player is doing, they are inside the box that is drawn for them.
    for (const [x, z] of [
      [0, 0],
      [0, 44],
      [0, 45],
      [-79, -58],
      [138, -84],
      [150, 84],
    ] as const) {
      const box = shadowBoxFor({ x, z }, HUB);
      const d = Math.hypot(x - box.cx, z - box.cz);
      expect(d).toBeLessThanOrEqual(box.extent);
    }
  });
});