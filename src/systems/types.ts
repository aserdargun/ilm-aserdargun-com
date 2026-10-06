import type { LocalizedText } from '../types/catalog';

/** Port/resource categories. Three kinds keeps compatibility rules legible. */
export type PortKind = 'energy' | 'information' | 'resource';

export const PORT_KINDS: readonly PortKind[] = ['energy', 'information', 'resource'] as const;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function toVec3(t: readonly [number, number, number]): Vec3 {
  return { x: t[0], y: t[1], z: t[2] };
}

/**
 * Deterministic hash-based PRNG. Used wherever reproducibility matters so a
 * puzzle always produces the same layout and outcome for a given seed.
 */
export function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

export interface SystemOutcome {
  /** True when the player's current configuration satisfies the puzzle goal. */
  solved: boolean;
  /** Player-readable reasons the configuration does not yet satisfy the goal. */
  failures: SystemFailure[];
  /** Applications whose observable effect just became true in this update. */
  satisfiedIds: string[];
}

export interface SystemFailure {
  /** Stable code for tests and for hint progression. */
  code: string;
  /** Which node / step / lane / cell the failure belongs to. */
  subjectId?: string;
  /** Optional interpolated detail for UI, already in the active language. */
  detail?: LocalizedText;
}