/**
 * The tapestry's progression rule, kept free of React and three.js so it can be
 * tested directly.
 *
 * This is here as a module in its own right because the rule was wrong for a
 * long time and nothing noticed. `UnfinishedTapestry` computed
 * `i / panels.length < restoredCount / 7` — a ratio against the region total
 * rather than a count — and the only caller passed `restored ? 14 : 0`, so the
 * tapestry could only ever be fully lit or fully dark. On top of that the drawn
 * version was a GLB: one mesh, two materials, no emissive channel, so even a
 * correct count had nowhere to go.
 */

/** Woven panels hanging from the crossbeam. */
export const TAPESTRY_PANELS = 14;

/** Panels lit per region brought back. */
export const PANELS_PER_REGION = 2;

/**
 * How many panels are lit once `regionsRestored` regions are back.
 *
 * Clamped at both ends so a malformed progression cannot light panels that do
 * not exist or leave a negative number for the renderer to index with.
 */
export function litTapestryPanels(regionsRestored: number): number {
  return Math.min(TAPESTRY_PANELS, Math.max(0, regionsRestored * PANELS_PER_REGION));
}

/** Whether the panel at `index` is woven through rather than blank. */
export function isPanelLit(index: number, regionsRestored: number): boolean {
  return index < litTapestryPanels(regionsRestored);
}