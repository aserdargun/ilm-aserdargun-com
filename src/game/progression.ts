import type { RegionId, ToolMode } from '../types/catalog';
import { REGION_ORDER } from '../catalog/regions';

/**
 * Progression rules live here as pure functions so they can be asserted in
 * tests. Nothing in this file touches React, storage or rendering.
 */

export const CROSS_STAGE_IDS = ['cross-x1', 'cross-x2', 'cross-x3'] as const;
export const FINALE_STAGE_ID = 'finale-synthesis-tree';
export const OPENING_STAGE_ID = 'r0-opening';

export interface ProgressionState {
  /** Stage ids the player has completed. */
  completedStages: string[];
  /** Regions whose stages are all complete. */
  completedRegions: RegionId[];
  /** Staff modes the player has learned. */
  unlockedTools: ToolMode[];
  /** Application slugs discovered so far. */
  discoveredApps: string[];
}

export function emptyProgression(): ProgressionState {
  return {
    completedStages: [],
    completedRegions: [],
    unlockedTools: ['connect'],
    discoveredApps: [],
  };
}

export function isStageComplete(state: ProgressionState, stageId: string): boolean {
  return state.completedStages.includes(stageId);
}

/**
 * Regions unlock in order. The first region is granted by the opening puzzle
 * (`r0-opening`), so the world opens within the first ninety seconds rather
 * than being walkable from the very first frame.
 */
export function isRegionUnlocked(state: ProgressionState, regionId: RegionId): boolean {
  if (regionId === 'hub') return true;
  const index = REGION_ORDER.indexOf(regionId);
  if (index < 0) return false;
  if (index === 0) return state.completedStages.includes(OPENING_STAGE_ID);
  const previous = REGION_ORDER[index - 1];
  return state.completedRegions.includes(previous);
}

export function nextLockedRegion(state: ProgressionState): RegionId | null {
  for (const regionId of REGION_ORDER) {
    if (!isRegionUnlocked(state, regionId)) return regionId;
    if (!state.completedRegions.includes(regionId)) return regionId;
  }
  return null;
}

/** A region is restored once every one of its stages is complete. */
export function isRegionRestored(
  state: ProgressionState,
  regionId: RegionId,
  stageIds: string[],
): boolean {
  const own = stageIds.filter((id) => belongsToRegion(id, regionId, stageIds));
  if (own.length === 0) return false;
  return own.every((id) => state.completedStages.includes(id));
}

export function regionProgress(
  state: ProgressionState,
  regionId: RegionId,
  stageIds: string[],
): { done: number; total: number } {
  const own = stageIds.filter((id) => belongsToRegion(id, regionId, stageIds));
  const done = own.filter((id) => state.completedStages.includes(id)).length;
  return { done, total: own.length };
}

/**
 * Stage ids are namespaced by region prefix (`r0-` for the hub's opening,
 * `r1-`..`r7-` for the regions, `cross-` for cross-region puzzles, `finale-`
 * for the ending), so ownership is derived from the id rather than duplicated.
 */
export function belongsToRegion(stageId: string, regionId: RegionId, _all: string[]): boolean {
  if (regionId === 'hub') {
    return (
      stageId.startsWith('r0-') || stageId.startsWith('cross-') || stageId === FINALE_STAGE_ID
    );
  }
  const index = REGION_ORDER.indexOf(regionId);
  return stageId.startsWith(`r${index + 1}-`);
}

/** Cross-region puzzles gate on real progress, not on flags. */
export function areCrossStagesUnlocked(state: ProgressionState): boolean {
  const completed = new Set(state.completedStages);
  return (
    completed.has('r5-trail-routing') &&
    completed.has('r6-lens-layers') &&
    completed.has('r7-pump-diagnosis')
  );
}

export function isCrossStageUnlocked(state: ProgressionState, stageId: string): boolean {
  if (!CROSS_STAGE_IDS.includes(stageId as (typeof CROSS_STAGE_IDS)[number])) return true;
  return areCrossStagesUnlocked(state);
}

/**
 * The finale requires every region restored and every cross-region puzzle done.
 * It must never be reachable while anything is outstanding.
 */
export function isFinaleUnlocked(state: ProgressionState): boolean {
  const allRegions = REGION_ORDER.every((r) => state.completedRegions.includes(r));
  const allCross = CROSS_STAGE_IDS.every((id) => state.completedStages.includes(id));
  return allRegions && allCross;
}

export function isFinaleComplete(state: ProgressionState): boolean {
  return state.completedStages.includes(FINALE_STAGE_ID);
}

/** Total restored connections, used for the end screen and the hub tree. */
export function restoredCount(state: ProgressionState): number {
  return state.completedStages.length;
}

/**
 * Tool unlocks are tied to real progression so REVEAL / PREVIEW / DECIDE each
 * arrive at the moment the world first has something to reveal, preview or
 * decide about — a tool is never handed over unused.
 */
export function toolsForProgress(completedStages: string[]): ToolMode[] {
  const done = new Set(completedStages);
  const tools: ToolMode[] = ['connect'];
  if (done.has('r1-equivalent-bridges')) tools.push('reveal');
  if (done.has('r2-loom-distribution')) tools.push('preview');
  if (done.has('r3-junction-choice')) tools.push('decide');
  return tools;
}