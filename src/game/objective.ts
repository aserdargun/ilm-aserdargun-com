import { STAGES, STAGE_BY_ID } from './stages';
import { REGIONS, REGION_BY_ID } from '../catalog/regions';
import {
  CROSS_STAGE_IDS,
  FINALE_STAGE_ID,
  isFinaleUnlocked,
  isRegionUnlocked,
  type ProgressionState,
} from './progression';

/**
 * One source of truth for "where should the player go next".
 *
 * The objective drives the HUD compass, the in-world beacon and the locked
 * stage reachability test, so it must not be derived in three places.
 */

export function isStageAvailable(state: ProgressionState, stageId: string): boolean {
  const stage = STAGE_BY_ID[stageId];
  if (!stage) return false;
  if (state.completedStages.includes(stageId)) return false;
  if (stageId === FINALE_STAGE_ID) return isFinaleUnlocked(state);
  if (stageId.startsWith('cross-')) {
    return ['r5-trail-routing', 'r6-lens-layers', 'r7-pump-diagnosis'].every((id) =>
      state.completedStages.includes(id),
    );
  }
  if (stageId.startsWith('r0-')) return true;
  return isRegionUnlocked(state, stage.region);
}

/** The next stage the player should head for, in world order. */
export function nextObjectiveStageId(state: ProgressionState): string | null {
  const order = [
    ...STAGES.filter((s) => /^r[0-7]-/.test(s.id)).map((s) => s.id),
    ...CROSS_STAGE_IDS,
    FINALE_STAGE_ID,
  ];
  for (const id of order) {
    if (isStageAvailable(state, id)) return id;
  }
  return null;
}

/** World position of a stage console. */
export function stageWorldPosition(stageId: string): { x: number; z: number } | null {
  const stage = STAGE_BY_ID[stageId];
  if (!stage) return null;
  const region = REGION_BY_ID[stage.region];
  return { x: region.anchor[0] + stage.offset[0], z: region.anchor[2] + stage.offset[2] };
}

/** World position of the current objective, or null when everything is done. */
export function objectivePosition(state: ProgressionState): {
  x: number;
  z: number;
  stageId: string;
} | null {
  const stageId = nextObjectiveStageId(state);
  if (!stageId) return null;
  const position = stageWorldPosition(stageId);
  if (!position) return null;
  return { ...position, stageId };
}

/** Region a world position sits in, for the HUD. */
export function regionAt(x: number, z: number): string {
  let best = REGIONS[0].id;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const region of REGIONS) {
    const distance = Math.hypot(x - region.anchor[0], z - region.anchor[2]);
    if (distance <= region.radius && distance < bestDistance) {
      best = region.id;
      bestDistance = distance;
    }
  }
  return best;
}