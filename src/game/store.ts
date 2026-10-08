import { useCallback, useSyncExternalStore } from 'react';
import { getLang, translate, type TranslationKey } from '../i18n';
import type { Lang, RegionId, ToolMode } from '../types/catalog';
import {
  clearSave,
  createSave,
  loadSave,
  reconcile,
  writeSave,
  type LoadOutcome,
  type SaveData,
} from './save';
import {
  emptyProgression,
  isCrossStageUnlocked,
  isFinaleUnlocked,
  isRegionUnlocked,
  isStageComplete,
  regionProgress,
  toolsForProgress,
  type ProgressionState,
} from './progression';
import { ALL_STAGE_IDS, STAGE_BY_ID, emptyStageState, type StageRuntimeState } from './stages';
import { evaluateStage, initialStageState } from './puzzleRuntime';
import { REGION_ORDER } from '../catalog/regions';
import { lineFor, regionRestoredLine, type SparkMoment } from './spark';

export type Screen = 'title' | 'playing' | 'paused' | 'journal' | 'settings' | 'ending';
export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  quality: Quality;
  reducedMotion: boolean;
  master: number;
  music: number;
  muted: boolean;
}

export interface GameState {
  screen: Screen;
  save: SaveData;
  progression: ProgressionState;
  /** Interaction state per stage, restored from save. */
  stageStates: Record<string, StageRuntimeState>;
  activeStageId: string | null;
  /** Stage the player is currently standing at, for HUD prompts. */
  targetedStageId: string | null;
  tool: ToolMode;
  settings: Settings;
  lang: Lang;
  hintTier: Record<string, number>;
  /** Transient message shown in the HUD. */
  notice: { key: TranslationKey; at: number } | null;
  /** Set when a save could not be loaded, so the UI can explain it. */
  loadWarning: 'corrupt' | 'version' | null;
  sparkLine: { text: string; at: number } | null;
  endingSeen: boolean;
  /**
   * Lines Spark still has to say.
   *
   * A queue rather than a single slot, because several of the moments this
   * replaces fired in the same beat — restoring the last stage of a region used
   * to overwrite the solved line before the player could read it. The bubble
   * drains one line at a time and the rest are simply held.
   */
  sparkQueue: string[];
  /** The region the player is standing in, for the arrival line. */
  currentRegion: RegionId | null;
}

const SETTINGS_KEY = 'ilm.settings.v1';

/**
 * Phones render three times as many pixels per CSS pixel, and iOS caps how
 * much memory a tab may hold. Both mean a device-class check has to happen
 * before the first frame rather than being left to the player.
 */
function isHandheld(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const narrow = Math.min(window.innerWidth, window.innerHeight) <= 480;
  const touchPoints = (navigator.maxTouchPoints ?? 0) > 1;
  return (coarse && narrow) || (touchPoints && narrow);
}

function loadSettings(): Settings {
  const handheld = isHandheld();
  const fallback: Settings = {
    quality: handheld ? 'low' : 'high',
    reducedMotion:
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    master: 0.5,
    music: 0.35,
    muted: false,
  };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    const p = parsed as Partial<Settings>;
    return {
      // A handheld that once stored "high" keeps it: an explicit choice wins.
      quality: p.quality === 'low' || p.quality === 'high' || p.quality === 'medium'
        ? p.quality
        : fallback.quality,
      reducedMotion: typeof p.reducedMotion === 'boolean' ? p.reducedMotion : fallback.reducedMotion,
      master: typeof p.master === 'number' ? clamp01(p.master) : fallback.master,
      music: typeof p.music === 'number' ? clamp01(p.music) : fallback.music,
      muted: typeof p.muted === 'boolean' ? p.muted : fallback.muted,
    };
  } catch {
    return fallback;
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// ---------------------------------------------------------------------------

let state: GameState = {
  screen: 'title',
  save: createSave(),
  progression: emptyProgression(),
  stageStates: {},
  activeStageId: null,
  targetedStageId: null,
  tool: 'connect',
  settings: loadSettings(),
  lang: getLang(),
  hintTier: {},
  notice: null,
  loadWarning: null,
  sparkLine: null,
  endingSeen: false,
  sparkQueue: [],
  currentRegion: null,
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setState(next: Partial<GameState>): void {
  state = { ...state, ...next };
  emit();
}

export function getState(): GameState {
  return state;
}

export function useGame(): GameState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/**
 * Translation bound to the current language. Reading `lang` from the reactive
 * store means a language change re-renders every consumer immediately, without
 * touching progression or puzzle state.
 */
export function useT() {
  const lang = useGame().lang;
  return useCallback((key: TranslationKey) => translate(lang, key), [lang]);
}

// ---------------------------------------------------------------------------
// Spark's voice
// ---------------------------------------------------------------------------

/**
 * How long a line stays up before the next one takes its place.
 *
 * Read time, not a fixed feel: the longest line in `spark.ts` is around 90
 * characters, which is roughly five seconds to read slowly, and the shortest is
 * two. A fixed window either truncates the long ones or makes the short ones
 * feel stuck on screen.
 */
const SPEECH_MS_PER_CHAR = 34;
const SPEECH_MIN_MS = 2600;
const SPEECH_MAX_MS = 9000;

/**
 * How many times each moment has been spoken.
 *
 * Not saved: a repeated visit should vary from the last one in this sitting,
 * and a reload resetting the rotation is harmless.
 */
const sparkVisits: Partial<Record<SparkMoment, number>> = {};

/**
 * Say a line.
 *
 * Two rules, both of which came from watching the old single-slot version
 * misbehave:
 *
 *  1. A line already on screen is not repeated verbatim. If the same moment
 *     fires while its own line is still up, the new one is dropped rather than
 *     stacked — otherwise resetting a puzzle twice in a row fills the queue with
 *     the same sentence.
 *  2. A line spoken moments ago is not repeated immediately either. Walking
 *     back and forth over a region boundary must not produce a stutter.
 */
function say(moment: SparkMoment, options: { region?: RegionId } = {}): void {
  const lang = state.lang;
  const text =
    moment === 'regionRestored' && options.region
      ? regionRestoredLine(options.region, lang)
      : lineFor(moment, lang, sparkVisits[moment] ?? 0);

  if (!text) return;

  sparkVisits[moment] = (sparkVisits[moment] ?? 0) + 1;

  const current = state.sparkLine;
  const now = Date.now();
  if (current && current.text === text && now - current.at < SPEECH_MAX_MS) return;

  const queue = state.sparkQueue.includes(text) ? state.sparkQueue : [...state.sparkQueue, text];

  if (!current || now - current.at >= speechDuration(current.text)) {
    // The bubble is free: show the first queued line straight away.
    const [next, ...rest] = queue;
    setState({ sparkLine: { text: next, at: now }, sparkQueue: rest });
  } else {
    setState({ sparkQueue: queue });
  }
}

function speechDuration(text: string): number {
  return Math.min(SPEECH_MAX_MS, Math.max(SPEECH_MIN_MS, text.length * SPEECH_MS_PER_CHAR));
}

/**
 * Show the next queued line, if the current one has had its time.
 *
 * Called from the HUD's timer rather than from a store subscription, so a
 * bubble that is already on screen does not restart when unrelated state
 * changes.
 */
export function advanceSpark(): void {
  const current = state.sparkLine;
  if (!current) return;
  if (Date.now() - current.at < speechDuration(current.text)) return;
  const [next, ...rest] = state.sparkQueue;
  if (next) setState({ sparkLine: { text: next, at: Date.now() }, sparkQueue: rest });
  else setState({ sparkLine: null });
}

/** Test seam: forget which variants have already been spoken. */
export function __resetSparkVisitsForTests(): void {
  for (const key of Object.keys(sparkVisits) as SparkMoment[]) delete sparkVisits[key];
}

/**
 * Test seam: treat the visible line as finished.
 *
 * The bubble advances on a read-time timer, so a test cannot wait it out. This
 * backdates the visible line instead of reaching into the store's state, which
 * keeps `sparkQueue` — the thing actually under test — reachable through the
 * same public path the interface uses.
 */
export function __finishSparkForTests(): void {
  const current = state.sparkLine;
  if (current) state.sparkLine = { ...current, at: 0 };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function persistSettings(): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch {
    /* settings simply will not persist */
  }
}

function saveNow(): void {
  const next: SaveData = {
    ...state.save,
    savedAt: Date.now(),
    lang: state.lang,
    progression: state.progression,
    stageState: state.stageStates,
    activeStageId: state.activeStageId,
    hintTier: state.hintTier,
    discoveredApps: state.progression.discoveredApps,
    endingSeen: state.endingSeen,
  };
  writeSave(next);
  setState({ save: next });
}

export function startNewGame(): void {
  clearSave();
  const fresh = createSave(state.lang);
  setState({
    screen: 'playing',
    save: fresh,
    progression: emptyProgression(),
    stageStates: {},
    activeStageId: null,
    targetedStageId: null,
    tool: 'connect',
    hintTier: {},
    endingSeen: false,
    loadWarning: null,
    sparkLine: null,
    sparkQueue: [],
    currentRegion: null,
  });
  visitedRegions.clear();
  __resetSparkVisitsForTests();
  // First contact. It used to exist as two written lines and no call site.
  say('intro');
  saveNow();
}

export function continueGame(): void {
  const outcome: LoadOutcome = loadSave();
  if (outcome.status !== 'ok') {
    setState({ loadWarning: outcome.status === 'version' ? 'version' : 'corrupt' });
    startNewGame();
    return;
  }
  const reconciled = reconcile(outcome.save, ALL_STAGE_IDS);
  const tools = toolsForProgress(reconciled.progression.completedStages);
  setState({
    screen: 'playing',
    save: reconciled,
    progression: reconciled.progression,
    stageStates: (reconciled.stageState ?? {}) as Record<string, StageRuntimeState>,
    activeStageId: reconciled.activeStageId,
    targetedStageId: null,
    tool: tools[tools.length - 1] ?? 'connect',
    hintTier: reconciled.hintTier ?? {},
    endingSeen: reconciled.endingSeen,
    loadWarning: null,
    sparkLine: null,
    sparkQueue: [],
    // A restored save has already been through its opening, so the hub counts
    // as visited and the player is not greeted for it a second time.
    currentRegion: null,
  });
  visitedRegions.add(reconciled.player.regionId);
  say('intro');
}

export function hasSave(): boolean {
  return loadSave().status === 'ok';
}

export function setScreen(screen: Screen): void {
  if (screen === 'playing') saveNow();
  setState({ screen });
}

export function updateSettings(patch: Partial<Settings>): void {
  setState({ settings: { ...state.settings, ...patch } });
  persistSettings();
}

export function setLanguage(lang: Lang): void {
  setState({ lang });
}

export function setTool(tool: ToolMode): void {
  setState({ tool });
}

export function cycleTool(): void {
  const unlocked = toolsForProgress(state.progression.completedStages);
  if (unlocked.length === 0) return;
  const index = unlocked.indexOf(state.tool);
  const next = unlocked[(index + 1) % unlocked.length];
  setState({ tool: next });
}

export function enterStage(stageId: string): void {
  const stage = STAGE_BY_ID[stageId];
  if (!stage) return;
  if (!isStageReachable(stageId)) {
    setState({ notice: { key: 'tool.locked', at: Date.now() } });
    return;
  }
  const existing = state.stageStates[stageId];
  const stageStates = {
    ...state.stageStates,
    [stageId]: existing ?? initialStageState(stage),
  };
  setState({
    activeStageId: stageId,
    stageStates,
    // The stage's own opening line comes first, because it is the one written
    // for this exact puzzle; Spark's general remark follows it in the queue
    // rather than replacing it.
    sparkLine: { text: stage.sparkLine[state.lang], at: Date.now() },
  });
  say('stageOpen');
  saveNow();
}

/** Leaves the console without discarding in-progress work on it. */
export function closeStage(): void {
  if (state.activeStageId === null) return;
  setState({ activeStageId: null });
  saveNow();
}

export function isStageReachable(stageId: string): boolean {
  const stage = STAGE_BY_ID[stageId];
  if (!stage) return false;
  if (isStageComplete(state.progression, stageId)) return true;
  if (stageId === 'finale-synthesis-tree') return isFinaleUnlocked(state.progression);
  if (stageId.startsWith('cross-')) return isCrossStageUnlocked(state.progression, stageId);
  if (stageId.startsWith('r0-')) return true;
  return isRegionUnlocked(state.progression, stage.region);
}

export function patchStageState(stageId: string, patch: Partial<StageRuntimeState>): void {
  const current = state.stageStates[stageId] ?? emptyStageState();
  setState({
    stageStates: { ...state.stageStates, [stageId]: { ...current, ...patch } },
  });
}

/** Re-evaluates a stage and, when solved, records the progression consequences. */
export function commitStage(stageId: string): boolean {
  const stage = STAGE_BY_ID[stageId];
  if (!stage) return false;
  const stageState = state.stageStates[stageId] ?? initialStageState(stage);
  const evaluation = evaluateStage(stage, stageState);
  if (!evaluation.solved) {
    // A rejected commit is the one moment the game can honestly say it does not
    // know. It was silent here before: the panel showed a failure line and
    // nothing else, which reads as the puzzle blaming the player.
    say('wrongAttempt');
    return false;
  }

  const completedStages = state.progression.completedStages.includes(stageId)
    ? state.progression.completedStages
    : [...state.progression.completedStages, stageId];

  const discovered = [...new Set([...state.progression.discoveredApps, ...codesToSlugs(evaluation.satisfiedCodes)])];

  const provisional: ProgressionState = {
    ...state.progression,
    completedStages,
    discoveredApps: discovered,
  };

  const completedRegions = REGION_ORDER.filter((r) =>
    isRegionFullyComplete(provisional, r),
  );

  const progression: ProgressionState = {
    ...provisional,
    completedRegions,
    unlockedTools: toolsForProgress(completedStages),
  };

  const finaleNowUnlocked = isFinaleUnlocked(progression);

  // Which regions are newly complete, as opposed to merely still complete.
  // The notice used to fire on every single solved stage, which told the player
  // a region had been restored twenty-eight times over.
  const newlyRestored = completedRegions.filter((r) => !state.progression.completedRegions.includes(r));

  setState({
    progression,
    notice: newlyRestored.length > 0 ? { key: 'hud.regionRestored', at: Date.now() } : null,
    endingSeen: state.endingSeen,
  });

  say('solved');
  for (const region of newlyRestored) say('regionRestored', { region });
  if (finaleNowUnlocked && !state.progression.completedStages.includes('finale-synthesis-tree')) {
    say('finaleOpen');
  }
  saveNow();

  if (stageId === 'finale-synthesis-tree') {
    say('ending');
    setState({ endingSeen: true, screen: 'ending' });
    saveNow();
  }
  return true;
}

function isRegionFullyComplete(progression: ProgressionState, regionId: RegionId): boolean {
  const { done, total } = regionProgress(progression, regionId, ALL_STAGE_IDS);
  return total > 0 && done === total;
}

function codesToSlugs(codes: string[]): string[] {
  return codes.map((c) => c.toLowerCase());
}

export function resetStage(stageId: string): void {
  const stage = STAGE_BY_ID[stageId];
  if (!stage) return;
  setState({
    stageStates: { ...state.stageStates, [stageId]: initialStageState(stage) },
  });
  say('reset');
  saveNow();
}

export function raiseHint(stageId: string): void {
  const tier = Math.min(3, (state.hintTier[stageId] ?? 0) + 1);
  setState({ hintTier: { ...state.hintTier, [stageId]: tier } });
  // The last tier is where the game stops pretending it has more to give.
  // Without a line here the player simply runs out of help in silence, which
  // reads as a bug rather than as the end of the hints.
  if (tier >= 3) say('outOfHints');
  saveNow();
}

export function dismissHint(stageId: string): void {
  const next = { ...state.hintTier };
  delete next[stageId];
  setState({ hintTier: next });
}

export function setTargetedStage(stageId: string | null): void {
  if (state.targetedStageId === stageId) return;
  setState({ targetedStageId: stageId });
}

export function updatePlayerPosition(x: number, y: number, z: number, regionId: RegionId): void {
  const next: SaveData = {
    ...state.save,
    player: { x, y, z, regionId },
  };
  setState({ save: next });
  // First time standing in a region, Spark says something. Tracked by region id
  // rather than by unlock state so re-entering a place already visited stays
  // quiet: a line on every crossing would make the bubble a permanent fixture.
  if (state.currentRegion !== regionId) {
    const firstVisit = !visitedRegions.has(regionId);
    setState({ currentRegion: regionId });
    if (firstVisit) {
      visitedRegions.add(regionId);
      say('regionArrival');
    }
  }
}

/**
 * Regions the player has stood in during this run.
 *
 * Session-scoped on purpose: a returning player is not greeted for the hub
 * again, which is the correct behaviour and costs nothing to persist.
 */
const visitedRegions = new Set<RegionId>();

export function recordPlaySeconds(seconds: number): void {
  setState({ save: { ...state.save, playSeconds: state.save.playSeconds + seconds } });
}

export function clearNotice(): void {
  if (state.notice === null) return;
  setState({ notice: null });
}

export function markEndingSeen(): void {
  setState({ endingSeen: true });
  saveNow();
}

/** Test seam. */
export function __setStateForTests(next: Partial<GameState>): void {
  state = { ...state, ...next };
  emit();
}