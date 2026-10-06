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
  });
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
  });
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
    sparkLine: { text: stage.sparkLine[state.lang], at: Date.now() },
  });
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
  if (!evaluation.solved) return false;

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

  setState({
    progression,
    sparkLine: { text: translate(state.lang, 'spark.solved'), at: Date.now() },
    notice: { key: 'hud.regionRestored', at: Date.now() },
    endingSeen: finaleNowUnlocked ? state.endingSeen : state.endingSeen,
  });
  saveNow();

  if (stageId === 'finale-synthesis-tree') {
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
    notice: { key: 'spark.reset', at: Date.now() },
  });
  saveNow();
}

export function raiseHint(stageId: string): void {
  const tier = Math.min(3, (state.hintTier[stageId] ?? 0) + 1);
  setState({ hintTier: { ...state.hintTier, [stageId]: tier } });
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
}

export function recordPlaySeconds(seconds: number): void {
  setState({ save: { ...state.save, playSeconds: state.save.playSeconds + seconds } });
}

export function clearNotice(): void {
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