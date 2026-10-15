import { REGIONS, type RegionDef } from '../catalog/regions';

/**
 * Where a span is drawn, and where it is walked on.
 *
 * These numbers used to live in three places that only agreed by accident: the
 * deck's height was a literal `0.6` in the scene graph, its thickness another
 * literal in a `boxGeometry` call, and the height the player stands at a third
 * one (`y: 0`) in the span data handed to the ground query. Nothing measured
 * the deck, so nothing noticed that its top surface sat 0.85 units above the
 * ground the player was told to stand on — the Weaver walked the length of
 * every causeway buried to the waist, under a slab it was supposed to be
 * standing on.
 *
 * They are here instead, in one pure module with no React in it, so a test can
 * assert the drawn deck and the walked deck are the same surface.
 */

/** Drawn width across the deck. Navigation derives its corridor from this. */
export const DECK_WIDTH = 12;

/** How thick the slab is. Its underside hangs below the walking surface. */
export const DECK_THICKNESS = 0.5;

/**
 * The surface the Weaver's boots rest on.
 *
 * Zero, level with the island tops: every island's ground disc is built flat at
 * y=0, so a deck whose top sat above that was a ledge at both shorelines with
 * no step drawn, and a player stepping onto it was teleported up 0.85 units —
 * 47% of a 1.80-unit character — in a single frame. The causeway and the
 * islands now share one continuous walking surface.
 */
export const DECK_TOP_Y = 0;

/**
 * The group origin for a drawn deck: its centre, not its top.
 *
 * The runner and the rails are positioned relative to the deck's local origin
 * (the runner rests on the deck top at local 0.25), so moving the group by
 * this and nothing else carries all of them down together.
 */
export const DECK_CENTER_Y = DECK_TOP_Y - DECK_THICKNESS / 2;

/**
 * Radius of the landing pad at each end of a span.
 *
 * A disc and a corridor meet at a concave corner, and a player walking
 * diagonally into it gets wedged against an invisible edge. The pad fills the
 * corner — and its radius is what places its centre, so the pad ends exactly at
 * the shoreline instead of reaching past it onto the gap, where there is no
 * deck under it and the player would be walking on air.
 */
export const LANDING_PAD_RADIUS = 9;

export interface BridgeSpan {
  /** Hub end of the centre line. */
  from: [number, number];
  /** Destination anchor, at the centre of its island. */
  to: [number, number];
  width: number;
  /** The height the player stands at on this span. */
  y: number;
  /** Heading of the span, for the drawn group. */
  angle: number;
  /** Length of the drawn deck. */
  span: number;
  /** Midpoint of the drawn deck. */
  mid: [number, number];
  /** Where the deck meets the hub shoreline. */
  start: [number, number];
  /** Where the deck meets the destination shoreline. */
  end: [number, number];
}

/**
 * Every span, laid from the hub to each region.
 *
 * The deck now starts and ends exactly at the two shorelines. It used to begin
 * five units *inside* each island, which meant five units of slab hovering 0.85
 * above walkable ground — the span literally arched over the sand, and the
 * ground query, which tests the islands first, reported the island's height
 * there, so the Weaver walked underneath the part of the bridge that was drawn
 * over land it could already stand on.
 */
export function buildBridgeSpans(regions: RegionDef[] = REGIONS): BridgeSpan[] {
  const hub = regions.find((r) => r.id === 'hub');
  if (!hub) return [];

  return regions
    .filter((r) => r.id !== 'hub')
    .map((region) => {
      const dx = region.anchor[0];
      const dz = region.anchor[2];
      const length = Math.hypot(dx, dz) || 1;
      const ux = dx / length;
      const uz = dz / length;
      // The two shorelines: the deck covers the gap between the islands and
      // nothing else.
      const start = hub.radius;
      const end = length - region.radius;
      const span = Math.max(end - start, 1);
      const middle = (start + end) / 2;
      return {
        from: [0, 0] as [number, number],
        to: [dx, dz] as [number, number],
        width: DECK_WIDTH,
        y: DECK_TOP_Y,
        angle: Math.atan2(dx, dz),
        span,
        mid: [ux * middle, uz * middle] as [number, number],
        start: [ux * start, uz * start] as [number, number],
        end: [ux * end, uz * end] as [number, number],
      };
    });
}