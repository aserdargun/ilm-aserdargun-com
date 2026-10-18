import { describe, expect, it } from 'vitest';
import { REGIONS } from '../src/catalog/regions';
import { STAGES } from '../src/game/stages';
import {
  PLAYER_RADIUS,
  findUnreachableConsoles,
  initNavigation,
} from '../src/world/navigation';
import { LANDMARK_RADII } from '../src/world/landmark-colliders';
import { buildBridgeSpans } from '../src/world/bridge';

/**
 * A stage the player cannot start.
 *
 * Interaction needs a standing point within `INTERACT_RANGE` of the console that
 * is on walkable ground and outside every collider by the width of the player's
 * own body. Widen one landmark ring past its console and that stops being true —
 * and the stage it holds cannot be opened at all.
 *
 * These drive the real collider table and the real stage offsets, because the
 * failure is precisely that those two are written in different files and nothing
 * compares them.
 */

const INTERACT_RANGE = 5.2;
const CONSOLE_RADIUS = 1.9;

function allConsoles() {
  const anchors = new Map(REGIONS.map((r) => [r.id, r.anchor as [number, number, number]]));
  return STAGES.map((stage) => {
    const a = anchors.get(stage.region)!;
    return {
      id: stage.id,
      x: a[0] + stage.offset[0],
      z: a[2] + stage.offset[2],
      radius: CONSOLE_RADIUS,
    };
  });
}

/** The landmark rings only — the props and rocks are derived and not the risk. */
function landmarkColliders() {
  return REGIONS.map((r) => ({
    x: r.anchor[0],
    z: r.anchor[2],
    radius: LANDMARK_RADII[r.id] ?? 6,
    owner: 'landmarks',
  }));
}

describe('stage reachability', () => {
  it('leaves every stage in the shipped world reachable', () => {
    initNavigation(new Set(REGIONS.map((r) => r.id)), buildBridgeSpans());
    expect(findUnreachableConsoles(allConsoles(), landmarkColliders(), INTERACT_RANGE)).toEqual([]);
  });

  it('reports a console swallowed by a ring widened past it', () => {
    initNavigation(new Set(REGIONS.map((r) => r.id)), buildBridgeSpans());
    const foundry = REGIONS.find((r) => r.id === 'flow-foundry')!;
    // The Flow Foundry's consoles sit at 18.44 and 18.87 from its centre, so a
    // ring of 24 puts the player at 24.55 at its nearest and 6.11 from the
    // console — outside INTERACT_RANGE, with no other way round.
    const widened = landmarkColliders().map((c) =>
      c.owner === 'landmarks' && c.x === foundry.anchor[0] && c.z === foundry.anchor[2]
        ? { ...c, radius: 24 }
        : c,
    );
    const reports = findUnreachableConsoles(allConsoles(), widened, INTERACT_RANGE);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.map((r) => r.id).sort()).toEqual(
      STAGES.filter((s) => s.region === 'flow-foundry').map((s) => s.id).sort(),
    );
    for (const r of reports) expect(r.blockedByColliders).toBe(true);
  });

  it('blames the ring, not the sky, when a console is unreachable', () => {
    initNavigation(new Set(REGIONS.map((r) => r.id)), buildBridgeSpans());
    const reports = findUnreachableConsoles(allConsoles(), [], INTERACT_RANGE);
    // With no colliders at all, every console sits on its own island and is
    // reachable — the islands are walkable and the consoles are on them.
    expect(reports).toEqual([]);
  });

  it('uses the player body width, so a ring is not judged by its bare radius', () => {
    // A console exactly touching a ring edge is still approachable: the player
    // stands off by their own radius and that is enough room.
    initNavigation(new Set(REGIONS.map((r) => r.id)), buildBridgeSpans());
    const hub = REGIONS.find((r) => r.id === 'hub')!;
    const console_ = { id: 'probe', x: hub.anchor[0] + 10, z: hub.anchor[2], radius: CONSOLE_RADIUS };
    const colliders = [{ x: hub.anchor[0], z: hub.anchor[2], radius: 10 - CONSOLE_RADIUS - PLAYER_RADIUS, owner: 'landmarks' }];
    expect(findUnreachableConsoles([console_], colliders, INTERACT_RANGE)).toEqual([]);
  });

});
