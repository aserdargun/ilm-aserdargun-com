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
});
