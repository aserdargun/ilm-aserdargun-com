import { REGIONS } from '../catalog/regions';

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

function buildAreas(openRegionIds: Set<string>): WalkableArea[] {
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
      halfWidth: 5.6,
      margin: 0.4,
    });

    // Landing pads where each span meets an island. Without them the union of
    // a disc and a corridor has a concave corner, and a player walking
    // diagonally into it gets wedged against an invisible edge.
    const dx = region.anchor[0] - 0;
    const dz = region.anchor[2] - 0;
    const length = Math.hypot(dx, dz) || 1;
    const ux = dx / length;
    const uz = dz / length;
    const hub = REGIONS.find((r) => r.id === 'hub')!;

    list.push({
      kind: 'disc' as const,
      x: ux * (hub.radius - 5),
      z: uz * (hub.radius - 5),
      radius: 9,
      margin: 0.4,
    });
    list.push({
      kind: 'disc' as const,
      x: region.anchor[0] - ux * (region.radius - 5),
      z: region.anchor[2] - uz * (region.radius - 5),
      radius: 9,
      margin: 0.4,
    });
  }
  return list;
}

let openRegionSet = new Set<string>();

/** Rebuilt whenever a bridge is laid or a region is restored. */
export function initNavigation(openRegionIds: Iterable<string>): void {
  const next = new Set(openRegionIds);
  const signature = [...next].sort().join(',');
  if (signature === openRegions && areas.length > 0) return;
  openRegionSet = next;
  openRegions = signature;
  areas = buildAreas(openRegionSet);
}

function ensureAreas(): WalkableArea[] {
  if (areas.length === 0) areas = buildAreas(openRegionSet);
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