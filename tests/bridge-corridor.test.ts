import { describe, expect, it } from 'vitest';
import { REGIONS } from '../src/catalog/regions';
import { initNavigation, isWalkable } from '../src/world/navigation';
import { registerBridges, BRIDGES } from '../src/world/Player';

/**
 * Nothing tested the bridges: `tests/nav.test.ts` never mentions them, and a
 * playthrough drives progression state directly without walking one.
 *
 * This pins the one number that matters — how far across the deck a player may
 * stray — and pins it against the geometry the renderer actually draws, so the
 * corridor and the causeway cannot drift apart the way the invisible opening
 * bridge did.
 */

const REGION_IDS = REGIONS.map((r) => r.id);

interface Span {
  hub: [number, number];
  region: [number, number];
  middle: [number, number];
  perpendicular: [number, number];
  width: number;
}

function spanFor(regionId: string, width = 12): Span {
  const hub = REGIONS.find((r) => r.id === 'hub')!;
  const region = REGIONS.find((r) => r.id === regionId)!;
  const dx = region.anchor[0];
  const dz = region.anchor[2];
  const length = Math.hypot(dx, dz);
  const ux = dx / length;
  const uz = dz / length;
  const start = hub.radius - 5;
  const end = length - (region.radius - 5);
  const middle = (start + end) / 2;
  return {
    hub: [0, 0],
    region: [dx, dz],
    middle: [ux * middle, uz * middle],
    perpendicular: [-uz, ux],
    width,
  };
}

function layBridge(regionId: string, width = 12): Span {
  const s = spanFor(regionId, width);
  registerBridges([{ from: s.hub, to: s.region, width, y: 0 }]);
  initNavigation(REGION_IDS, [{ to: s.region, width }]);
  return s;
}

function walkableOffset(s: Span, limit = 12, step = 0.05): number {
  let last = 0;
  for (let d = 0; d <= limit; d += step) {
    if (isWalkable(s.middle[0] + s.perpendicular[0] * d, s.middle[1] + s.perpendicular[1] * d)) {
      last = d;
    }
  }
  return last;
}

describe('bridge walkable corridor', () => {
  it('keeps the player inside the drawn deck on every side of the span', () => {
    // navigation builds the corridor as halfWidth 5.6 minus a 0.4 margin, and
    // the deck is 12 across, so the boundary should land at 5.2.
    const s = layBridge('cartographers-terrace');
    const edge = walkableOffset(s);
    expect(edge).toBeGreaterThan(5.0);
    expect(edge).toBeLessThan(5.3);
    expect(edge).toBeLessThan(s.width / 2);      // never past the drawn deck
    expect(edge).toBeLessThan(s.width / 2 - 0.2); // and never past the railings
  });

  it('measures across the span, not along world X', () => {
    // The spans are diagonal, so the walkable band is perpendicular to the
    // bridge. Probing along X instead reads a completely different number,
    // which is how this was first mis-measured. `flow-foundry` is excluded
    // because it runs straight down -z, where the two axes coincide.
    const s = layBridge('cartographers-terrace');
    const diagX = Math.abs(s.perpendicular[0]);
    expect(diagX).toBeLessThan(0.9);
    expect(diagX).toBeGreaterThan(0.2);
    const perpEdge = walkableOffset(s);
    // Projecting onto X makes the same physical distance look shorter.
    expect(perpEdge / diagX).toBeGreaterThan(perpEdge);
  });

  it('leaves both sides symmetric about the centre line', () => {
    const s = layBridge('memory-council-city');
    const right = walkableOffset(s);
    const left = walkableOffset({ ...s, perpendicular: [-s.perpendicular[0], -s.perpendicular[1]] });
    expect(left).toBeCloseTo(right, 1);
  });

  it('scales the corridor with the deck it was built from', () => {
    const narrow = walkableOffset(layBridge('observers-mirrors', 8));
    const wide = walkableOffset(layBridge('observers-mirrors', 12));
    expect(wide).toBeGreaterThan(narrow + 1);
  });

  it('is symmetric about the span for a real diagonal bridge', () => {
    const s = layBridge('adaptation-cloud-harbor');
    const onCentre = isWalkable(s.middle[0], s.middle[1]);
    expect(onCentre).toBe(true);
  });

  BRIDGES.length = 0;
});