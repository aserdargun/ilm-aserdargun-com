import { DEFAULT_LANG, type RegionId, type ToolMode } from '../types/catalog';
import { REGION_ORDER, isRegionId } from '../catalog/regions';
import {
  emptyProgression,
  regionProgress,
  isRegionRestored,
  type ProgressionState,
} from './progression';

/**
 * Versioned local save. The schema is validated on load: an unreadable or
 * outdated save degrades to a clean new game with a visible message rather
 * than crashing the world or silently discarding what it can recover.
 */

export const SAVE_VERSION = 3;
export const SAVE_STORAGE_KEY = `ilm.save.v${SAVE_VERSION}`;
const LEGACY_KEYS = ['ilm.save.v1', 'ilm.save.v2', 'ilm.save'];

export interface SaveData {
  version: number;
  savedAt: number;
  lang: 'tr' | 'en';
  player: {
    x: number;
    y: number;
    z: number;
    regionId: RegionId;
  };
  progression: ProgressionState;
  /** Serializable per-stage interaction state, keyed by stage id. */
  stageState: Record<string, unknown>;
  /** Stage the player was standing in, restored exactly. */
  activeStageId: string | null;
  /** Which journal entries have been written. */
  discoveredApps: string[];
  /** Hints already shown, stage id -> tier (1..3). */
  hintTier: Record<string, number>;
  /** Ending seen, so the credits are not replayed unprompted. */
  endingSeen: boolean;
  /** Monotonic play time in seconds. */
  playSeconds: number;
}

export type LoadOutcome =
  | { status: 'ok'; save: SaveData }
  | { status: 'empty' }
  | { status: 'corrupt' }
  | { status: 'version'; found: number };

export function createSave(lang: 'tr' | 'en' = DEFAULT_LANG): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    lang,
    player: { x: 0, y: 0, z: 19, regionId: 'hub' },
    progression: emptyProgression(),
    stageState: {},
    activeStageId: null,
    discoveredApps: [],
    hintTier: {},
    endingSeen: false,
    playSeconds: 0,
  };
}

const TOOL_MODES: ToolMode[] = ['connect', 'reveal', 'preview', 'decide'];

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isToolArray(value: unknown): value is ToolMode[] {
  return isStringArray(value) && value.every((v) => TOOL_MODES.includes(v as ToolMode));
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Structural validation. Anything that fails here is treated as corrupt — the
 * player is told, and gets a clean start rather than a half-loaded world.
 */
export function isValidSave(value: unknown): value is SaveData {
  if (typeof value !== 'object' || value === null) return false;
  const raw = value as Record<string, unknown>;
  if (typeof raw.version !== 'number') return false;
  if (!Number.isInteger(raw.version)) return false;

  const player = raw.player as Record<string, unknown> | undefined;
  if (!player || typeof player !== 'object') return false;
  if (!isRegionId(player.regionId)) return false;
  for (const axis of ['x', 'y', 'z'] as const) {
    if (typeof player[axis] !== 'number' || !Number.isFinite(player[axis])) return false;
  }

  const progression = raw.progression as Record<string, unknown> | undefined;
  if (!progression || typeof progression !== 'object') return false;
  if (!isStringArray(progression.completedStages)) return false;
  if (!isStringArray(progression.completedRegions)) return false;
  if (!progression.completedRegions.every(isRegionId)) return false;
  if (!isToolArray(progression.unlockedTools)) return false;
  if (!isStringArray(progression.discoveredApps)) return false;

  if (typeof raw.stageState !== 'object' || raw.stageState === null) return false;
  if (raw.activeStageId !== null && typeof raw.activeStageId !== 'string') return false;

  return true;
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function loadSave(): LoadOutcome {
  const raw = readStorage(SAVE_STORAGE_KEY);

  if (raw === null) {
    // A save from an older build is reported explicitly so the player is told
    // why their journey did not resume.
    for (const legacy of LEGACY_KEYS) {
      const legacyRaw = readStorage(legacy);
      if (legacyRaw === null) continue;
      try {
        const parsed: unknown = JSON.parse(legacyRaw);
        if (typeof parsed === 'object' && parsed !== null) {
          const version = (parsed as { version?: unknown }).version;
          if (typeof version === 'number') return { status: 'version', found: version };
        }
      } catch {
        /* ignore malformed legacy payload */
      }
    }
    return { status: 'empty' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupt' };
  }

  if (!isValidSave(parsed)) return { status: 'corrupt' };
  if (parsed.version !== SAVE_VERSION) return { status: 'version', found: parsed.version };

  return { status: 'ok', save: parsed as SaveData };
}

export function writeSave(save: SaveData): boolean {
  try {
    window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch {
    // Quota or blocked storage: the game keeps running, it just will not
    // resume. This is reported to the player rather than thrown.
    return false;
  }
}

export function clearSave(): void {
  try {
    window.localStorage.removeItem(SAVE_STORAGE_KEY);
    for (const legacy of LEGACY_KEYS) window.localStorage.removeItem(legacy);
  } catch {
    /* nothing to clear if storage is unavailable */
  }
}

/**
 * Rebuilds derived progression fields from the completed-stage list, so a save
 * edited by hand or written by an older build can never present an impossible
 * state (for example, a region marked restored with no stages completed).
 */
export function reconcile(save: SaveData, allStageIds: string[]): SaveData {
  const completed = save.progression.completedStages.filter((id) => allStageIds.includes(id));

  const completedRegions = REGION_ORDER.filter((regionId) =>
    isRegionRestored({ ...save.progression, completedStages: completed }, regionId, allStageIds),
  );

  const discovered = save.progression.discoveredApps.filter(
    (slug) => typeof slug === 'string' && slug.length > 0,
  );

  const validActive =
    save.activeStageId && allStageIds.includes(save.activeStageId) ? save.activeStageId : null;

  return {
    ...save,
    progression: {
      ...save.progression,
      completedStages: completed,
      completedRegions,
      discoveredApps: discovered,
      unlockedTools: save.progression.unlockedTools.filter((t) => TOOL_MODES.includes(t)),
    },
    activeStageId: validActive,
    playSeconds: finite(save.playSeconds, 0),
    hintTier: save.hintTier ?? {},
    stageState: save.stageState ?? {},
  };
}

export function summarize(save: SaveData, allStageIds: string[]) {
  const stagesDone = save.progression.completedStages.length;
  const regionsDone = save.progression.completedRegions.length;
  const next = REGION_ORDER.find(
    (r) => !save.progression.completedRegions.includes(r),
  );
  return {
    stagesDone,
    regionsDone,
    stagesTotal: allStageIds.length,
    nextRegion: next ?? null,
    current: next ? regionProgress(save.progression, next, allStageIds) : null,
  };
}