import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Static checks for the iPhone-class experience. Browser behaviour is verified
 * manually in a mobile viewport; these guard the things that silently regress.
 */
const css = readFileSync('src/styles.css', 'utf8');
const shell = readFileSync('index.html', 'utf8');
const scene = readFileSync('src/world/Scene.tsx', 'utf8');
const input = readFileSync('src/game/input.ts', 'utf8');

describe('touch and mobile readiness', () => {
  it('disables browser gestures that fight a drag-controlled camera', () => {
    expect(css).toMatch(/canvas\s*\{[^}]*touch-action:\s*none/);
    expect(css).toMatch(/touch-layer[^}]*pointer-events:\s*none/);
  });

  it('covers the notch and home indicator with safe-area insets', () => {
    expect(css).toMatch(/safe-area-inset/);
    expect(shell).toMatch(/viewport-fit=cover/);
  });

  it('caps device pixel ratio so an iPhone does not render 3x', () => {
    expect(scene).toMatch(/dpr=\{\[[^\]]+\]\}/);
  });

  it('keeps audio behind a real user gesture', () => {
    expect(input).toMatch(/enabled/);
    // Audio must not be constructed at module load.
    expect(scene).not.toMatch(/new AudioContext/);
  });

  it('exposes a virtual stick and action buttons for touch play', () => {
    const screens = readFileSync('src/ui/Screens.tsx', 'utf8');
    expect(screens).toMatch(/className="stick"/);
    expect(screens).toMatch(/className="touch-btn"/);
  });

  it('never settles a HUD element on its hidden keyframe', () => {
    // `animation-direction: reverse` with fill `both` parks the element on the
    // `from` state, which is opacity 0. The strip and the prompt then stay
    // invisible while still laid out over the touch buttons.
    expect(css).not.toMatch(/animation:[^;]*reverse/);
  });

  it('fades the tool strip in from its own keyframe', () => {
    expect(css).toMatch(/@keyframes hud-in-end/);
    expect(css).toMatch(/\.hud-tools\s*\{[^}]*animation:\s*hud-in-end[^}]*\}/);
    expect(css).toMatch(/\.prompt\s*\{[^}]*animation:\s*hud-in-end[^}]*\}/);
  });

  it('lifts the bottom HUD clear of the touch-button column on phones', () => {
    // Three 72px buttons plus gaps and a 1.25rem inset need ~16rem of clearance;
    // at the old 9rem the strip overlapped the action button.
    const phone = css.slice(css.indexOf('@media (max-width: 680px)'));
    const block = phone.slice(phone.indexOf('.hud-bottom'), phone.indexOf('.prompt'));
    const padding = block.match(/padding-bottom:\s*([\d.]+)rem/);
    expect(padding).not.toBeNull();
    expect(Number(padding![1])).toBeGreaterThanOrEqual(16);
  });

  it('gives the virtual stick visible travel feedback', () => {
    const screens = readFileSync('src/ui/Screens.tsx', 'utf8');
    expect(css).toMatch(/--knob-x/);
    expect(css).toMatch(/\.stick-knob\s*\{[^}]*transform:/);
    expect(screens).toMatch(/--knob-x/);
    expect(screens).toMatch(/--knob-y/);
  });
});
