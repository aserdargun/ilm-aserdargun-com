import { REGIONS } from '../catalog/regions';
import { DECK_WIDTH, LANDING_PAD_RADIUS } from './bridge';

/**
 * Walking is confined to the islands and the spans between them.
 *
 * The regions are separate discs with open sky between, so without this the
 * player simply walks off the edge into nothing. Every position is tested
 * against the union of the region discs and the bridge corridors, and anything
 * outside is pulled back to the nearest point inside.
 */

export interface WalkableArea {
  kind: 'disc' | 'bridge';
  x: number;
  z: number;
  radius: number;
  /** Bridges are rectangles, expressed as half-width plus both endpoints. */
  x2?: number;
  z2?: number;
  halfWidth?: number;
  /**
   * How far inside the area the player is kept. A disc keeps a wide margin so
   * nobody walks off a cliff edge; a bridge keeps almost none, because you are
   * meant to be able to stand at its edge and look down.
   */
  margin?: number;
}

let areas: WalkableArea[] = [];
let openRegions = '';

/** Deck width assumed when a caller does not say how wide it built the span. */
const DEFAULT_BRIDGE_WIDTH = DECK_WIDTH;

/** What a caller passes so the corridor can follow the deck it drew. */
export interface BridgeSpan {
  to: [number, number];
  width: number;
}

function buildAreas(openRegionIds: Set<string>, spans: BridgeSpan[]): WalkableArea[] {
  const spansByTarget = new Map(spans.map((s) => [`${s.to[0]},${s.to[1]}`, s]));
  const list: WalkableArea[] = REGIONS.map((region) => ({
    kind: 'disc' as const,
    x: region.anchor[0],
    z: region.anchor[2],
    // Inset slightly so the visual rim of the terrain is walkable, not the
    // very edge of it.
    radius: region.radius - 1.2,
    margin: 1.1,
  }));

  // Only spans that are actually built are walkable: an invisible bridge is
  // not a road, and walking on one would break the promise that the world can
  // only be crossed where the world has been restored.
  for (const region of REGIONS) {
    if (region.id === 'hub') continue;
    if (!openRegionIds.has(region.id)) continue;

    // The corridor is derived from the deck that was actually built, rather
    // than carrying its own copy of the number. It used to hold a literal 5.6
    // while the deck was drawn from `Bridge.width`, so the two were correct by
    // coincidence and unrelated by construction — the same shape of drift that
    // left the opening bridge walkable with nothing drawn on it. A 12-wide
    // deck still gives 5.6 here and a 5.2 lane after the margin.
    const span = spansByTarget.get(`${region.anchor[0]},${region.anchor[2]}`);
    const deckHalfWidth = (span?.width ?? DEFAULT_BRIDGE_WIDTH) / 2;

    list.push({
      kind: 'bridge' as const,
      x: 0,
      z: 0,
      radius: 0,
      x2: region.anchor[0],
      z2: region.anchor[2],
      // Matches the drawn causeway. The corridor is generous on purpose:
      // camera-relative walking drifts, and a narrow span would leave players
      // pinned against an invisible wall instead of on the bridge.
      halfWidth: deckHalfWidth - 0.4,
      margin: 0.4,
    });

    // Landing pads where each span meets an island. Without them the union of
    // a disc and a corridor has a concave corner, and a player walking
    // diagonally into it gets wedged against an invisible edge.
    //
    // The centre is placed by the pad's own radius, so the pad stops exactly at
    // the shoreline. It used to be centred five units inside the shore under a
    // fixed nine-unit radius, which put a four-unit apron of walkable ground
    // past the island's edge — harmless while the deck overhung that far and
    // covered it, and a place to walk on thin air once the deck was trimmed to
    // the gap it actually crosses.
    const dx = region.anchor[0] - 0;
    const dz = region.anchor[2] - 0;
    const length = Math.hypot(dx, dz) || 1;
    const ux = dx / length;
    const uz = dz / length;
    const hub = REGIONS.find((r) => r.id === 'hub')!;

    list.push({
      kind: 'disc' as const,
      x: ux * (hub.radius - LANDING_PAD_RADIUS),
      z: uz * (hub.radius - LANDING_PAD_RADIUS),
      radius: LANDING_PAD_RADIUS,
      margin: 0.4,
    });
    list.push({
      kind: 'disc' as const,
      x: region.anchor[0] - ux * (region.radius - LANDING_PAD_RADIUS),
      z: region.anchor[2] - uz * (region.radius - LANDING_PAD_RADIUS),
      radius: LANDING_PAD_RADIUS,
      margin: 0.4,
    });
  }
  return list;
}

let openRegionSet = new Set<string>();

/** Rebuilt whenever a bridge is laid or a region is restored. */
export function initNavigation(
  openRegionIds: Iterable<string>,
  spans: BridgeSpan[] = [],
): void {
  const next = new Set(openRegionIds);
  // The signature covers the spans as well as the regions. Keyed on the
  // regions alone, a rebuild with different deck widths was skipped as
  // "unchanged" while the areas kept the widths they were first built with —
  // the same shape as guarding `setColorAt` on `instanceColor` being non-null.
  const signature = `${[...next].sort().join(',')}|${spans
    .map((s) => `${s.to[0]},${s.to[1]},${s.width}`)
    .sort()
    .join(';')}`;
  if (signature === openRegions && areas.length > 0) return;
  openRegionSet = next;
  openRegions = signature;
  areas = buildAreas(openRegionSet, spans);
}

function ensureAreas(): WalkableArea[] {
  if (areas.length === 0) areas = buildAreas(openRegionSet, []);
  return areas;
}

export function isWalkable(x: number, z: number): boolean {
  for (const area of ensureAreas()) {
    if (area.kind === 'disc') {
      const dx = x - area.x;
      const dz = z - area.z;
      if (dx * dx + dz * dz <= area.radius * area.radius) return true;
    } else {
      const t = nearestOnSegment(x, z, area);
      if (t.distance <= area.halfWidth! - (area.margin ?? 0.2)) return true;
    }
  }
  return false;
}

/** Distance from a point to a bridge's centre line, and the parameter along it. */
function nearestOnSegment(
  x: number,
  z: number,
  area: WalkableArea,
): { distance: number; px: number; pz: number } {
  const ax = area.x;
  const az = area.z;
  const dx = area.x2! - ax;
  const dz = area.z2! - az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 1e-6) return { distance: Math.hypot(x - ax, z - az), px: ax, pz: az };
  let t = ((x - ax) * dx + (z - az) * dz) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const px = ax + dx * t;
  const pz = az + dz * t;
  return { distance: Math.hypot(x - px, z - pz), px, pz };
}

/**
 * Pulls a position back onto the walkable set. Returns the nearest valid point,
 * so running at the edge slides the player along it instead of stopping dead.
 */
export function clampToWalkable(
  x: number,
  z: number,
  out: { x: number; z: number },
): { x: number; z: number } {
  if (isWalkable(x, z)) {
    out.x = x;
    out.z = z;
    return out;
  }

  let bestX = x;
  let bestZ = z;
  let bestDistance = Number.POSITIVE_INFINITY;
  // Land a hair inside the boundary: pushing to the exact limit and then
  // re-testing can round a hair outside it, which would leave the player
  // permanently pinned against the edge.
  const INSET = 0.03;

  for (const area of ensureAreas()) {
    let cx: number;
    let cz: number;
    let distance: number;

    if (area.kind === 'disc') {
      const dx = x - area.x;
      const dz = z - area.z;
      const d = Math.hypot(dx, dz);
      const target = Math.max(0, area.radius - (area.margin ?? 1.1) - INSET);
      if (d <= 1e-4) {
        cx = area.x;
        cz = area.z;
        distance = target;
      } else {
        cx = area.x + (dx / d) * target;
        cz = area.z + (dz / d) * target;
        distance = d - target;
      }
    } else {
      const near = nearestOnSegment(x, z, area);
      const limit = area.halfWidth! - (area.margin ?? 0.2) - INSET;
      if (near.distance > limit) {
        const ux = (x - near.px) / near.distance;
        const uz = (z - near.pz) / near.distance;
        cx = near.px + ux * limit;
        cz = near.pz + uz * limit;
        distance = near.distance - limit;
      } else {
        cx = near.px;
        cz = near.pz;
        distance = 0;
      }
    }

    if (distance < bestDistance) {
      bestDistance = distance;
      bestX = cx;
      bestZ = cz;
    }
  }

  out.x = bestX;
  out.z = bestZ;
  return out;
}

/** Distance to the nearest walkable point, used by the tests. */
export function distanceToWalkable(x: number, z: number): number {
  if (isWalkable(x, z)) return 0;
  const probe = { x: 0, z: 0 };
  clampToWalkable(x, z, probe);
  return Math.hypot(probe.x - x, probe.z - z);
}
/**
 * A stage console the player cannot walk up to.
 *
 * The landmark colliders were widened twice in one session — the terrace, the
 * canal — and both times the widened ring was checked against the consoles by
 * hand and found clear. That is a per-island reading of a per-island number, and
 * the check existed nowhere: nothing would have failed if a radius had swallowed
 * the console on the next island along.
 *
 * The question is narrow and decidable. Interaction needs the player within
 * `INTERACT_RANGE` of the console, standing on walkable ground and outside every
 * collider by the width of their own body. If no such point exists, the stage is
 * unreachable — not hard, not awkward, **unreachable**, and the puzzle it holds
 * cannot be started.
 */
export const PLAYER_RADIUS = 0.55;

/** Angles tried around a console at each radius. Even, so no gap is missed twice. */
export const REACH_ANGLES = 48;

export interface UnreachableConsoleReport {
  id: string;
  x: number;
  z: number;
  /** The console's own collider radius, which the ring starts outside of. */
  consoleRadius: number;
  /** Every collider within `interactRange` of it, and how far short each falls. */
  blockers: { owner: string; radius: number; shortfall: number }[];
  /** True when the ring is blocked by colliders rather than by open sky. */
  blockedByColliders: boolean;
}

/** Distance from a point to a collider's edge, positive outside. */
function colliderGap(
  x: number,
  z: number,
  colliders: readonly { x: number; z: number; radius: number; owner?: string }[],
): { gap: number; owner: string; radius: number } | null {
  let best: { gap: number; owner: string; radius: number } | null = null;
  for (const c of colliders) {
    const gap = Math.hypot(x - c.x, z - c.z) - c.radius - PLAYER_RADIUS;
    if (!best || gap < best.gap) best = { gap, owner: c.owner ?? '?', radius: c.radius };
  }
  return best;
}

/**
 * Lists the consoles with no reachable standing point inside `interactRange`.
 *
 * Returns `[]` on a sound world, which is the point: it is a standing check, so
 * the next collider that is widened past a stage says so on the day it lands.
 */
export function findUnreachableConsoles(
  consoles: readonly { id: string; x: number; z: number; radius: number }[],
  colliders: readonly { x: number; z: number; radius: number; owner?: string }[],
  interactRange: number,
): UnreachableConsoleReport[] {
  const out: UnreachableConsoleReport[] = [];

  for (const console_ of consoles) {
    const from = console_.radius + PLAYER_RADIUS + 0.05;
    let reachable = false;

    for (let r = from; r <= interactRange && !reachable; r += 0.15) {
      for (let a = 0; a < REACH_ANGLES; a += 1) {
        const t = (a / REACH_ANGLES) * Math.PI * 2;
        const x = console_.x + Math.cos(t) * r;
        const z = console_.z + Math.sin(t) * r;
        const near = colliderGap(x, z, colliders);
        if (near && near.gap < 0) continue;   // inside something
        if (!isWalkable(x, z)) continue;        // off the islands and the spans
        reachable = true;
        break;
      }
    }
    if (reachable) continue;

    // Nothing free inside the range: say what is sitting there instead.
    //
    // `blockedByColliders` has to be decided against each collider's **own**
    // position. Measuring from the world origin — which is what the first
    // version did — says a console 163 units from the origin is inside anything
    // it is near, and the flag came out false for a console a ring had plainly
    // swallowed.
    const near = colliders
      .map((c) => ({ c, shortfall: Math.hypot(console_.x - c.x, console_.z - c.z) - c.radius }))
      .filter((e) => e.shortfall < interactRange)
      .sort((a, b) => a.shortfall - b.shortfall);

    const blockers = near.map((e) => ({
      owner: e.c.owner ?? '?',
      radius: e.c.radius,
      shortfall: Math.round(e.shortfall * 100) / 100,
    }));

    const openSky = near.length === 0;

    out.push({
      id: console_.id,
      x: console_.x,
      z: console_.z,
      consoleRadius: console_.radius,
      blockers,
      blockedByColliders: !openSky,
    });
  }

  return out;
}
