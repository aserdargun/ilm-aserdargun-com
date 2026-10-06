/**
 * Playtime model.
 *
 * Produces an estimate for the main route, split into two parts that are
 * measured rather than guessed:
 *
 *   travel — computed from the real world coordinates of every stage console,
 *            divided by the real walk and sprint speeds
 *   puzzle — computed from the number of interactions the solver actually has
 *            to perform per system
 *
 * The per-interaction cost is a pacing assumption and is stated as such; the
 * travel figures are derived from the game's own geometry and movement code.
 */

import { STAGES } from '../../src/game/stages';
import { REGIONS } from '../../src/catalog/regions';
import { CROSS_STAGE_IDS, FINALE_STAGE_ID, OPENING_STAGE_ID } from '../../src/game/progression';
import { solveStage } from './solver';

const WALK_SPEED = 3.7; // world units per second, from Player.ts
const SPRINT_SPEED = 7.6;
const PLAYER_RADIUS = 0.55;

/** Seconds a player needs to read and think before acting on a puzzle. */
const READ_SECONDS = 6.5;
/** Seconds per discrete interaction (pick up, place, toggle, approve). */
const ACTION_SECONDS = 1.1;
/** Seconds spent walking from one console to the next before acting. */
const APPROACH_SECONDS = 1.2;

interface Anchor {
  x: number;
  z: number;
}

function regionAnchor(regionId: string): Anchor {
  const region = REGIONS.find((r) => r.id === regionId);
  return { x: region?.anchor[0] ?? 0, z: region?.anchor[2] ?? 0 };
}

export function stagePosition(stageId: string): Anchor {
  const stage = STAGES.find((s) => s.id === stageId);
  if (!stage) return { x: 0, z: 0 };
  const anchor = regionAnchor(stage.region);
  return { x: anchor.x + stage.offset[0], z: anchor.z + stage.offset[2] };
}

function distance(a: Anchor, b: Anchor): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Interactions the solver performs, counted from the solved state. */
function interactionsFor(stageId: string): number {
  const stage = STAGES.find((s) => s.id === stageId);
  if (!stage) return 0;
  const state = solveStage(stage);
  switch (stage.system) {
    case 'connection': {
      const pairs = Object.values(state.assignments).filter((v) => v.length > 0).length;
      return pairs * 2 + 1; // pick + drop per link, then apply
    }
    case 'placement': {
      const order = (state.assignments.order as string[] | undefined) ?? [];
      return order.length * 2 + 1; // move each step at least once, then apply
    }
    case 'allocation': {
      let placements = 0;
      for (const ids of Object.values(state.assignments)) placements += ids.length;
      return placements + 1;
    }
    case 'perception': {
      const marked = (state.assignments.__marked as string[] | undefined) ?? [];
      return marked.length + 4; // observe with each lens, then classify every cell
    }
    case 'evidence': {
      const packed = (state.packed ?? []).length;
      const corrected = (state.corrected ?? []).length;
      const flagged = (state.assignments.__flagged as string[] | undefined)?.length ?? 0;
      const sensors = (state.assignments.__sensors as string[] | undefined)?.length ?? 0;
      return packed + corrected + flagged + sensors + 1;
    }
    case 'prediction': {
      const marked = (state.assignments.__marked as string[] | undefined)?.length ?? 0;
      const sensors = (state.assignments.__sensors as string[] | undefined)?.length ?? 0;
      return (state.chosen ? 1 : 0) + (state.approved ? 1 : 0) + marked + sensors + 1;
    }
  }
}

export interface RouteReport {
  stageId: string;
  travelSeconds: number;
  puzzleSeconds: number;
}

export function mainRoute(): string[] {
  return [
    OPENING_STAGE_ID,
    ...STAGES.filter((s) => /^r[1-7]-/.test(s.id)).map((s) => s.id),
    ...CROSS_STAGE_IDS,
    FINALE_STAGE_ID,
  ];
}

export function buildReport(): RouteReport[] {
  const route = mainRoute();
  const start: Anchor = { x: 0, z: 19 }; // the Weaver's spawn point
  let previous = start;
  const report: RouteReport[] = [];

  for (const stageId of route) {
    const here = stagePosition(stageId);
    const gap = Math.max(0, distance(previous, here) - PLAYER_RADIUS * 2);
    // A real player mixes walking and sprinting; assume roughly a third of the
    // distance is covered at a jog and the rest walking.
    const travelSeconds = gap / (SPRINT_SPEED * 0.33 + WALK_SPEED * 0.67) + APPROACH_SECONDS;

    const puzzleSeconds =
      READ_SECONDS + interactionsFor(stageId) * ACTION_SECONDS;

    report.push({ stageId, travelSeconds, puzzleSeconds });
    previous = here;
  }
  return report;
}

export function summarise(): {
  travelMinutes: number;
  puzzleMinutes: number;
  totalMinutes: number;
  stages: number;
} {
  const report = buildReport();
  const travel = report.reduce((a, r) => a + r.travelSeconds, 0);
  const puzzle = report.reduce((a, r) => a + r.puzzleSeconds, 0);
  return {
    travelMinutes: Math.round((travel / 60) * 10) / 10,
    puzzleMinutes: Math.round((puzzle / 60) * 10) / 10,
    totalMinutes: Math.round(((travel + puzzle) / 60) * 10) / 10,
    stages: report.length,
  };
}

if (process.env.PLAYTIME_REPORT) {
  const report = buildReport();
  const summary = summarise();
  console.log('--- per stage (minutes) ---');
  for (const row of report) {
    console.log(
      `${row.stageId.padEnd(24)} travel ${(row.travelSeconds / 60).toFixed(2)}  puzzle ${(
        row.puzzleSeconds / 60
      ).toFixed(2)}`,
    );
  }
  console.log('--- totals ---');
  console.log(summary);
}