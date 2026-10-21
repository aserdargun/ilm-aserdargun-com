import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  RESTORATION_WAVE_REACH,
  RESTORATION_WAVE_SECONDS,
  advanceRestorationWave,
  patchRestorationWave,
  setRestorationWave,
} from '../src/world/restoration';

/**
 * The catalogue's language is about process, not switches: light *spreads*
 * along a branch, routes *draw* as light across a map, the council light
 * becomes a *steady ring*. A lamp that comes on all at once says the region
 * was switched on; a wave that travels across it says the region woke up.
 *
 * The wave is one for all seven regions, because none of them needed a
 * different one, and a ring spreading out from the middle of the island is
 * the shape all seven of them describe.
 */
describe('the restoration wave', () => {
  const material = () => new THREE.MeshStandardMaterial({ color: '#ffffff' });

  it('starts at the centre and ends at the reach', () => {
    const wave = patchRestorationWave(material(), new THREE.Vector2(0, 0));
    setRestorationWave(wave, true, true);
    expect(wave.front).toBe(0);
    expect(wave.target).toBe(RESTORATION_WAVE_REACH);
  });

  it('crosses the landmark in the time it is given', () => {
    const wave = patchRestorationWave(material(), new THREE.Vector2(0, 0));
    setRestorationWave(wave, true, true);
    // One second of a 2.2-second crossing, in steps.
    let elapsed = 0;
    while (elapsed < 1) {
      advanceRestorationWave(wave, 1 / 60);
      elapsed += 1 / 60;
    }
    const expected = RESTORATION_WAVE_REACH * (1 / RESTORATION_WAVE_SECONDS);
    expect(wave.front).toBeGreaterThan(expected * 0.9);
    expect(wave.front).toBeLessThan(expected * 1.1);
  });

  it('never travels past its target', () => {
    const wave = patchRestorationWave(material(), new THREE.Vector2(0, 0));
    setRestorationWave(wave, true, true);
    for (let i = 0; i < 600; i += 1) advanceRestorationWave(wave, 1 / 60);
    expect(wave.front).toBe(RESTORATION_WAVE_REACH);
  });

  it('does not jump when a backgrounded tab comes back', () => {
    // A tab that was hidden for a minute hands the frame loop one enormous
    // delta, and a wave that took that at face value would arrive in a
    // single frame.
    const wave = patchRestorationWave(material(), new THREE.Vector2(0, 0));
    setRestorationWave(wave, true, true);
    advanceRestorationWave(wave, 60);
    expect(wave.front).toBeLessThan(RESTORATION_WAVE_REACH / 2);
  });

  it('leaves a material that is not restored exactly as it was', () => {
    // The gardens' coral is already emissive at 0.252, and a region that has
    // not been restored must look exactly as it did. The front at its reach
    // means the mask is one everywhere, so the material's own light is
    // untouched.
    const wave = patchRestorationWave(material(), new THREE.Vector2(0, 0));
    setRestorationWave(wave, false, false);
    expect(wave.front).toBe(RESTORATION_WAVE_REACH);
    expect(wave.target).toBe(RESTORATION_WAVE_REACH);
  });

  it('is installed once per material, however many times it is asked for', () => {
    const target = material();
    const first = patchRestorationWave(target, new THREE.Vector2(1, 2));
    const second = patchRestorationWave(target, new THREE.Vector2(3, 4));
    expect(second).toBe(first);
    // And the origin follows the region it belongs to.
    expect(second.origin.x).toBe(3);
    expect(second.originUniform.value.x).toBe(3);
  });
});
