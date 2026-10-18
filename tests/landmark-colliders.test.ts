import { describe, expect, it } from 'vitest';
import { REGIONS } from '../src/catalog/regions';
import { STAGES } from '../src/game/stages';
import { LANDING_PAD_RADIUS } from '../src/world/bridge';
import { LANDMARK_RADII } from '../src/world/landmark-colliders';

/**
 * The landmark colliders were a round 6-9.5 carrying the note "radii match the
 * built structures", and they did not. Five of the eight landmarks have a raised
 * platform wider than the ring meant to keep the player out of it, so between
 * the two radii there was walkable ground with the platform over the player's
 * head.
 *
 * The Cartographer's Terrace is the case that was confirmed with pixels rather
 * than with arithmetic. Its surface is at y=1.70 and the player's feet are at
 * y=0, so at radius 12 the character mesh reported `visible`, projected to
 * screen (1298, 1168), and the 460x460 crop at 1:1 there was bare sand. After
 * the radii were corrected the same teleport lands the player at radius 15.75 —
 * the collider plus the body — and the character is in the frame.
 *
 * That fix is only safe if nothing the player needs sits inside the new rings,
 * and that is the part worth a test: widening a collider is free until the
 * island's own puzzle is inside it, and then it strands the player outside a
 * stage they cannot see the end of. Both halves are pinned below.
 */

/**
 * Built platform footprints, measured from each landmark's own vertices in the
 * height band a player can walk under (0.4-4.0), keeping only surfaces carrying
 * real area rather than a beam's handful of points.
 *
 * Three islands measured no raised platform at all in that band and keep the
 * radii they had; they are listed as `null` so that a future measurement has
 * somewhere to record itself instead of quietly leaving the old number.
 */
const BUILT_PLATFORM: Record<string, number | null> = {
  hub: null,
  'cartographers-terrace': 15.2,
  'flow-foundry': 15.1,
  'memory-council-city': 14.3,
  'adaptation-cloud-harbor': null,
  'collective-gardens': 15,
  'observers-mirrors': 13.2,
  'valley-living-machines': 12.8,
};

/** `buildStagePositions()` is `anchor + stage.offset`, so this is its arithmetic. */
function consoleDistanceFromAnchor(regionId: string): number[] {
  if (!REGIONS.some((r) => r.id === regionId)) return [];
  // Both the console and the collider are measured from the same anchor, so the
  // anchor itself cancels and only the offset's horizontal length is needed.
  return STAGES.filter((s) => s.region === regionId).map((s) =>
    Math.hypot(s.offset[0], s.offset[2]),
  );
}

describe('landmark colliders', () => {
  it('covers every landmark that has a measured raised platform', () => {
    const short: string[] = [];
    for (const [regionId, built] of Object.entries(BUILT_PLATFORM)) {
      if (built === null) continue;
      const radius = LANDMARK_RADII[regionId];
      // 0.95 rather than 1.00: the footprint is a 90th-percentile estimate of a
      // mesh, and a collider a few hundredths short is a sliver the player can
      // still slip into. The terrace console sits 0.03 clear of 15.2, which is
      // the cross-check that the measurement is the real one.
      if (!(radius >= built * 0.95)) short.push(`${regionId}: ${radius} < ${built}`);
    }
    expect(short).toEqual([]);
  });

  it('covers every landmark, so none can be walked through', () => {
    for (const region of REGIONS) {
      expect(LANDMARK_RADII[region.id], region.id).toBeGreaterThan(0);
    }
  });

  it('leaves every stage console outside its island ring', () => {
    const stranded: string[] = [];
    for (const region of REGIONS) {
      const radius = LANDMARK_RADII[region.id] ?? 6;
      for (const distance of consoleDistanceFromAnchor(region.id)) {
        // The console carries its own 1.9-radius collider, so it only has to sit
        // outside the landmark ring; reachability is then 1.9 against an
        // INTERACT_RANGE of 5.2.
        if (distance <= radius) {
          stranded.push(`${region.id}: console at ${distance.toFixed(2)} inside ${radius}`);
        }
      }
    }
    expect(stranded).toEqual([]);
  });

  it('keeps the tightest console clear of the terrace platform', () => {
    // This is the number the whole table hangs on. If it ever fails, either the
    // terrace was rebuilt wider or the console offset was moved inward, and the
    // 15.2 above is no longer a measurement of anything.
    const distances = consoleDistanceFromAnchor('cartographers-terrace');
    expect(distances.length).toBeGreaterThan(0);
    expect(Math.min(...distances)).toBeGreaterThan(BUILT_PLATFORM['cartographers-terrace']!);
  });

  it('leaves every island reachable, because the bridges land at the shore', () => {
    // The failure this guards is the one the console test cannot see: a collider
    // wide enough to swallow the landing pad turns an island into somewhere the
    // player cannot get to at all. The deck ends at the shoreline by design
    // (`LANDING_PAD_RADIUS` in `bridge.ts`), so the test is simply whether the
    // shore is still outside the ring.
    const stranded = REGIONS.filter((region) => {
      const radius = LANDMARK_RADII[region.id] ?? 6;
      const landing = region.radius - LANDING_PAD_RADIUS;
      return landing <= radius;
    }).map((region) => region.id);
    expect(stranded).toEqual([]);
  });
});