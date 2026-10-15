import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REGIONS } from '../src/catalog/regions';
import {
  DECK_CENTER_Y,
  DECK_THICKNESS,
  DECK_TOP_Y,
  DECK_WIDTH,
  LANDING_PAD_RADIUS,
  buildBridgeSpans,
} from '../src/world/bridge';
import { BRIDGES, groundAt, registerBridges } from '../src/world/Player';
import { initNavigation, isWalkable } from '../src/world/navigation';

/**
 * The Weaver walked the length of every causeway buried to the waist.
 *
 * Nothing measured the deck. The scene drew a slab whose top surface sat at
 * 0.85, the span data handed to the ground query said the player stands at 0,
 * and the query itself was exported and never called — the controller held a
 * ref that nothing ever assigned, so the player's height was 0 for the whole
 * game. A 1.80-unit character standing 0.85 units too low is 47% of its body
 * inside the stone, which is what "the character stays under the bridge" looks
 * like from outside.
 *
 * The assertions below are about the contract between the places that used to
 * keep private copies of the same dimensions: the deck the renderer draws, the
 * height the ground query reports, and the ground the player may walk on.
 */

const SPANS = buildBridgeSpans();
const HUB = REGIONS.find((r) => r.id === 'hub')!;
const REGION_IDS = REGIONS.map((r) => r.id);

const GROUND_REGIONS = REGIONS.map((r) => ({
  id: r.id,
  x: r.anchor[0],
  z: r.anchor[2],
  radius: r.radius,
  y: r.anchor[1],
}));

/** The unit vector along a span's centre line, and its length. */
function axis(span: { from: [number, number]; to: [number, number] }) {
  const vx = span.to[0] - span.from[0];
  const vz = span.to[1] - span.from[1];
  const length = Math.hypot(vx, vz) || 1;
  return { vx, vz, length, ux: vx / length, uz: vz / length };
}

/** Distance from a point to the drawn deck, which runs shoreline to shoreline. */
function distanceToDeck(span: (typeof SPANS)[number], x: number, z: number): number {
  const { vx, vz, length } = axis(span);
  const along = ((x - span.from[0]) * vx + (z - span.from[1]) * vz) / length;
  const startLength = Math.hypot(span.start[0], span.start[1]);
  const endLength = Math.hypot(span.end[0], span.end[1]);
  if (along < startLength || along > endLength) return Number.POSITIVE_INFINITY;
  const perpendicular = Math.abs(vx * (z - span.from[1]) - vz * (x - span.from[0])) / length;
  return perpendicular;
}

/**
 * How far the island's stone actually reaches.
 *
 * The ground disc is built at `radius`, but the cliff profile's outermost ring
 * sits at 1.01 of it, so the drawn island overhangs its own disc by a third of
 * a unit. A landing pad that stops exactly at the disc edge is therefore still
 * standing on stone, and a check that says otherwise is measuring the disc
 * rather than the world.
 */
function islandStone(radius: number): number {
  return radius * 1.01;
}

/** Whether a point lies on drawn stone: an island top or a deck. */
function onDrawnGround(x: number, z: number): boolean {
  const onIsland = REGIONS.some(
    (r) => Math.hypot(x - r.anchor[0], z - r.anchor[2]) <= islandStone(r.radius),
  );
  if (onIsland) return true;
  return SPANS.some((s) => distanceToDeck(s, x, z) <= s.width / 2);
}

beforeAll(() => {
  registerBridges(SPANS);
  initNavigation(
    REGION_IDS,
    SPANS.map((s) => ({ to: s.to, width: s.width })),
  );
});

afterAll(() => {
  BRIDGES.length = 0;
});

describe('the deck and the surface walked on it', () => {
  it('is level with every island top, so no shoreline is a step', () => {
    // The premise of the fix: a raised deck is a ledge with no step drawn on
    // it, and the controller snaps upward in one frame, so crossing onto it
    // teleports the Weaver up 0.85 units — 47% of a body — in a single frame.
    const tops = new Set(GROUND_REGIONS.map((r) => r.y));
    expect(tops.size).toBe(1);
    expect([...tops][0]).toBe(DECK_TOP_Y);
  });

  it('draws the deck so its top face is that same surface', () => {
    // The deck is a box of DECK_THICKNESS centred on DECK_CENTER_Y, so its top
    // is centre + half. This is the arithmetic that was wrong: the scene passed
    // a literal 0.6 and the top came out 0.85 above the ground.
    expect(DECK_CENTER_Y + DECK_THICKNESS / 2).toBe(DECK_TOP_Y);
    expect(groundAt(SPANS[0].mid[0], SPANS[0].mid[1], GROUND_REGIONS)).toBe(DECK_TOP_Y);
  });

  it('takes the deck height from the deck, not from a literal in the scene', () => {
    // The scene is JSX and cannot be rendered here, so the two places that used
    // to hold their own numbers are pinned as source instead.
    const scene = readFileSync('src/world/Scene.tsx', 'utf8');
    expect(scene).toMatch(/\[bridge\.mid\[0\], DECK_CENTER_Y, bridge\.mid\[1\]\]/);
    expect(scene).not.toMatch(/\[bridge\.mid\[0\], 0\.6, bridge\.mid\[1\]\]/);
  });

  it('lays the deck across the gap only, meeting each shore exactly', () => {
    // It ran five units *inside* each island before: a slab hovering above walk
    // ground, under which the player walked, because the ground query tests
    // islands first and the island owns that land.
    for (const span of SPANS) {
      expect(Math.hypot(span.start[0], span.start[1])).toBeCloseTo(HUB.radius, 6);
      const { length } = axis(span);
      const region = REGIONS.find(
        (r) => r.anchor[0] === span.to[0] && r.anchor[2] === span.to[1],
      )!;
      expect(Math.hypot(span.end[0] - span.to[0], span.end[1] - span.to[1])).toBeCloseTo(
        region.radius,
        6,
      );
      expect(span.span).toBeCloseTo(length - HUB.radius - region.radius, 6);
      expect(span.width).toBe(DECK_WIDTH);
    }
  });

  it('never lets the player walk where there is no stone under them', () => {
    // Sampled across every span and around every landing pad. The pads are the
    // part that can drift: centred inside the shore under a fixed radius they
    // reached past the island edge, which was covered by deck while the deck
    // overhung and is open sky once the deck is trimmed to the gap.
    for (let x = -220; x <= 220; x += 1.5) {
      for (let z = -200; z <= 200; z += 1.5) {
        if (!isWalkable(x, z)) continue;
        expect(onDrawnGround(x, z)).toBe(true);
      }
    }
  });

  it('keeps each landing pad on its own island', () => {
    for (const region of REGIONS.filter((r) => r.id !== 'hub')) {
      const { ux, uz } = axis({ from: [0, 0], to: [region.anchor[0], region.anchor[2]] });
      const cx = region.anchor[0] - ux * (region.radius - LANDING_PAD_RADIUS);
      const cz = region.anchor[2] - uz * (region.radius - LANDING_PAD_RADIUS);
      // Measured from the region's own anchor, which is where the shore is.
      expect(Math.hypot(cx - region.anchor[0], cz - region.anchor[2]) + LANDING_PAD_RADIUS).toBeCloseTo(
        region.radius,
        6,
      );
      for (let a = 0; a < 360; a += 5) {
        const angle = (a * Math.PI) / 180;
        const px = cx + Math.cos(angle) * LANDING_PAD_RADIUS;
        const pz = cz + Math.sin(angle) * LANDING_PAD_RADIUS;
        if (isWalkable(px, pz)) expect(onDrawnGround(px, pz)).toBe(true);
      }
    }
  });

  it('answers the ground query the controller actually asks', () => {
    // Both halves of this bug were source-level: the query was exported and
    // never called, and the controller held an unassigned ref whose default
    // answered 0 everywhere. No amount of correct geometry fixes that, so the
    // wiring is pinned too.
    const player = readFileSync('src/world/Player.ts', 'utf8');
    const scene = readFileSync('src/world/Scene.tsx', 'utf8');
    expect(player).toMatch(/ground:\s*\(x: number, z: number\) => number;/);
    expect(player).toMatch(/ground\(nextX, nextZ\)/);
    expect(player).not.toMatch(/useRef<\(x: number, z: number\) => number>\(\(\) => 0\)/);
    expect(scene).toMatch(/useGroundSampler\(groundRegions\)/);
    expect(scene).toMatch(/ground=\{ground\}/);
  });

  it('reads a span as a deck of its own half-width, not twice that', () => {
    // The ground query compared the distance from the centre line against the
    // full deck width, describing a deck twice as wide as the one drawn. With
    // every island at y=0 that difference is invisible in the shipped world, so
    // it is measured on a span raised to a height of its own: a walk surface
    // that reports itself has to be found, and one that does not must not.
    const raised = { from: [0, 0] as [number, number], to: [0, 200] as [number, number], width: 12, y: 3 };
    registerBridges([raised]);
    try {
      const lateral = (d: number) => groundAt(d, 100, []);
      expect(lateral(0)).toBe(3);
      expect(lateral(5.9)).toBe(3);
      expect(lateral(6.1)).toBe(0);
    } finally {
      registerBridges(SPANS);
    }
  });
});