import { describe, expect, it } from 'vitest';
import { REGIONS } from '../src/catalog/regions';
import {
  PANELS_PER_REGION,
  TAPESTRY_PANELS,
  isPanelLit,
  litTapestryPanels,
} from '../src/world/tapestry';

/** Regions the tapestry counts; the hub has nothing to weave. */
const REGION_COUNT = REGIONS.filter((r) => r.id !== 'hub').length;

describe('tapestry progression', () => {
  it('lights exactly one region worth of panels per region restored', () => {
    expect(litTapestryPanels(0)).toBe(0);
    expect(litTapestryPanels(1)).toBe(PANELS_PER_REGION);
    expect(litTapestryPanels(3)).toBe(3 * PANELS_PER_REGION);
    expect(litTapestryPanels(REGION_COUNT)).toBe(TAPESTRY_PANELS);
  });

  it('is proportional, never all-or-nothing', () => {
    // The failure this module exists to prevent: every intermediate state
    // produced the same number as the final one.
    const counts = [0, 1, 2, 3, 4, 5, 6, 7].map(litTapestryPanels);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(new Set(counts).size).toBe(REGION_COUNT + 1);
  });

  it('fills the whole tapestry when every region is back', () => {
    for (let i = 0; i < TAPESTRY_PANELS; i += 1) {
      expect(isPanelLit(i, REGION_COUNT)).toBe(true);
    }
    expect(isPanelLit(TAPESTRY_PANELS, REGION_COUNT)).toBe(false);
  });

  it('lights panels left to right', () => {
    const two = litTapestryPanels(2);
    expect(Array.from({ length: TAPESTRY_PANELS }, (_, i) => isPanelLit(i, 2))).toEqual(
      Array.from({ length: TAPESTRY_PANELS }, (_, i) => i < two),
    );
  });

  it('clamps a malformed progression', () => {
    expect(litTapestryPanels(-3)).toBe(0);
    expect(litTapestryPanels(REGION_COUNT + 10)).toBe(TAPESTRY_PANELS);
  });

  it('has a panel budget that divides evenly across the regions', () => {
    // Adding a region without adding its panels would leave the tapestry
    // permanently short of full, with no other symptom.
    expect(TAPESTRY_PANELS % PANELS_PER_REGION).toBe(0);
    expect(TAPESTRY_PANELS / PANELS_PER_REGION).toBe(REGION_COUNT);
  });
});