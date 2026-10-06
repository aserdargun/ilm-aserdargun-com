/**
 * ILMEK — core domain types.
 *
 * Gameplay logic never reads translated text. Every player-facing string in
 * this file is bilingual *data* (a catalog record), while runtime UI copy lives
 * in `src/i18n` under stable keys. Systems in `src/systems` are pure and only
 * ever manipulate ids and numbers.
 */

export type Lang = 'tr' | 'en';
export const LANGS: readonly Lang[] = ['tr', 'en'] as const;
export const DEFAULT_LANG: Lang = 'tr';

export type LocalizedText = Record<Lang, string>;

export type RegionId =
  | 'hub'
  | 'cartographers-terrace'
  | 'flow-foundry'
  | 'memory-council-city'
  | 'adaptation-cloud-harbor'
  | 'collective-gardens'
  | 'observers-mirrors'
  | 'valley-living-machines';

/** The four primary staff actions, unlocked progressively. */
export type ToolMode = 'connect' | 'reveal' | 'preview' | 'decide';

/**
 * Six reusable puzzle systems. Thirty-three applications are expressed by
 * varying the rules, layout and combination of these — not by building thirty
 * separate engines.
 */
export type PuzzleSystemId =
  | 'connection'
  | 'placement'
  | 'perception'
  | 'evidence'
  | 'allocation'
  | 'prediction';

/** Virtual game units. Never real currency, benchmark or training cost. */
export type GameUnit = number;

export interface ApplicationEntry {
  /** Stable uppercase code, e.g. `AIA`. Brand and codes are never translated. */
  code: string;
  /** Lowercase slug, used in save data and internal ids. */
  slug: string;
  /** Display name in both languages. */
  name: LocalizedText;
  /** One-line concept as the player will understand it in-world. */
  shortConcept: LocalizedText;
  /** Description of the real source application, both languages. */
  description: LocalizedText;
  /** Verified production URL of the source application. */
  sourceUrl: string;
  region: RegionId;
  /** Which reusable system implements this application's stage. */
  system: PuzzleSystemId;
  /** The in-world stage this application contributes to. */
  stageId: string;
  /** How the concept becomes a player action. */
  mechanic: LocalizedText;
  /** Journal discovery line, written after the player completes the stage. */
  discovery: LocalizedText;
  /** Related quest / interaction ids owned by this application. */
  questIds: string[];
  /** What the player must observe for this application to count as covered. */
  completionCondition: LocalizedText;
}