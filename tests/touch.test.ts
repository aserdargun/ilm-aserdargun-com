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

  it('keeps the bottom HUD out of the middle of a phone screen', () => {
    // The row used to be lifted with ~17rem of bottom padding to clear the
    // action column, which parked the staff strip across the character on an
    // 844pt viewport. Lifting is only ever right when the target is above the
    // controls; a phone has no such row, so the lift has to be gone.
    const phone = css.slice(css.indexOf('@media (max-width: 680px)'));
    const block = phone.slice(phone.indexOf('.hud-bottom'), phone.indexOf('.prompt'));
    const lift = block.match(/padding-bottom:\s*([\d.]+)rem/);
    if (lift) expect(Number(lift[1])).toBeLessThan(4);
    expect(phone).toMatch(/\.hud\s*\{[^}]*justify-content:\s*flex-start/);
  });

  it('tucks the staff strip into the empty band above the stick', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 680px)'));
    const block = phone.slice(phone.indexOf('.hud-tools'), phone.indexOf('.tool {'));
    expect(block).toMatch(/position:\s*absolute/);
    // Clears the 128px stick and lands beside, never under, the action column.
    expect(block).toMatch(/bottom:\s*calc\([^;]*128px/);
    expect(block).toMatch(/grid-template-columns:\s*repeat\(2/);
    expect(block).toMatch(/width:\s*min\(/);
  });

  it('puts the HUD above the touch layer so its buttons take the tap', () => {
    // The look-drag surface is a full-height pointer target. If it sits above
    // the HUD it swallows every press meant for the staff strip, and the strip
    // still looks tappable.
    const zIndexOf = (selector: string) => {
      const at = css.indexOf(`${selector} {`);
      expect(at, `missing ${selector}`).toBeGreaterThan(-1);
      const rule = css.slice(at, css.indexOf('}', at));
      return Number(rule.match(/z-index:\s*(\d+)/)?.[1] ?? 0);
    };
    expect(zIndexOf('.hud')).toBeGreaterThan(zIndexOf('.touch-layer'));
    expect(zIndexOf('.hud')).toBeLessThan(zIndexOf('.screen'));
  });

  it('stops the look-drag surface above the on-screen controls', () => {
    const at = css.indexOf('.touch-look {');
    const rule = css.slice(at, css.indexOf('}', at));
    const top = Number(rule.match(/top:\s*(\d+)%/)?.[1] ?? 100);
    const height = Number(rule.match(/height:\s*(\d+)%/)?.[1] ?? 100);
    // Anything past ~70% of the layer reaches the control band.
    expect(top + height).toBeLessThanOrEqual(70);
  });

  it('tracks the iOS viewport so the canvas never outgrows the screen', () => {
    // Safari's collapsing address bar makes a plain 100% taller than what is
    // on screen, which pushes the home row under the URL bar.
    expect(css).toMatch(/@supports \(height:\s*100dvh\)/);
    expect(css).toMatch(/height:\s*100dvh/);
  });

  it('sends the bottom-right touch button home instead of cycling the tool', () => {
    const screens = readFileSync('src/ui/Screens.tsx', 'utf8');
    const from = screens.indexOf('className="touch-buttons"');
    const column = screens.slice(from, screens.indexOf('</div>\n  );', from));
    expect(column).toMatch(/input\.home\(\)/);
    expect(column).not.toMatch(/cycleTool/);
    // A desktop key still exists, and the spawn point is shared.
    expect(input).toMatch(/KeyH:\s*'home'/);
    expect(scene).toMatch(/const SPAWN/);
    expect(scene).toMatch(/createPlayerState\(new THREE\.Vector3\(\.\.\.SPAWN\)\)/);
  });

  it('does not strand the Weaver when a thumb slides off the stick', () => {
    // The stick is 128px across and thumbs are not. Without pointer capture a
    // drag that leaves the circle stops delivering moves, so the release never
    // reaches the element and the Weaver walks off on their own — and on iOS a
    // cancelled pointer (call, notification, app switcher) does the same.
    const screens = readFileSync('src/ui/Screens.tsx', 'utf8');
    expect(screens).toMatch(/setPointerCapture/);
    expect(screens).toMatch(/releasePointerCapture/);
    expect(screens.match(/onPointerCancel/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('gives the virtual stick visible travel feedback', () => {
    const screens = readFileSync('src/ui/Screens.tsx', 'utf8');
    expect(css).toMatch(/--knob-x/);
    expect(css).toMatch(/\.stick-knob\s*\{[^}]*transform:/);
    expect(screens).toMatch(/--knob-x/);
    expect(screens).toMatch(/--knob-y/);
  });
});
