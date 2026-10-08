import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  input as inputState,
  rescaleDeadZone,
  STICK_DEAD_ZONE,
} from '../src/game/input';

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
    expect(screens).toMatch(/className="stick stick-move"/);
    expect(screens).toMatch(/className="touch-btn/);
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

  it('turns the camera from a stick instead of a bare drag surface', () => {
    // The drag rectangle that used to occupy the upper right gave no feedback
    // and swallowed taps meant for the HUD. A visible ring reports how far the
    // camera is being pushed, and reports it in both axes.
    const screens = readFileSync('src/ui/Screens.tsx', 'utf8');
    expect(screens).toMatch(/className="stick stick-look"/);
    expect(screens).toMatch(/input\.setLookStick\(x, y\)/);
    expect(css).toMatch(/\.stick-look\s*\{[^}]*right:\s*max\(1\.25rem/);
    expect(screens).not.toMatch(/className="touch-look"/);
    expect(css).not.toMatch(/\.touch-look\s*\{/);
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

describe('thumb controls', () => {
  const screens = readFileSync('src/ui/Screens.tsx', 'utf8');
  const player = readFileSync('src/world/Player.ts', 'utf8');

  it('offers a sprint control that is held, not pressed', () => {
    // Sprint used to be Shift-only, which left no way to run on a touchscreen.
    // It has to be a held state so letting go drops straight back to a walk.
    expect(screens).toMatch(/className=\{`touch-btn sprint-btn/);
    expect(screens).toMatch(/input\.setSprint\(true\)/);
    expect(inputState.sprinting).toBe(false);
    inputState.setSprint(true);
    expect(inputState.sprinting).toBe(true);
    inputState.setSprint(false);
    expect(inputState.sprinting).toBe(false);
  });

  it('puts sprint in the empty band between the two sticks', () => {
    // Same row as both rings, so the walking thumb can hold it without
    // covering either control it needs to keep touching.
    const sprint = css.slice(css.indexOf('.sprint-btn'), css.indexOf('.touch-buttons'));
    expect(sprint).toMatch(/position:\s*absolute/);
    expect(sprint).toMatch(/left:\s*calc\([^;]*128px/);
    expect(sprint).toMatch(/bottom:\s*max\(1\.25rem/);
  });

  it('turns the camera on both axes from the right stick', () => {
    // A stick whose vertical axis does nothing would look broken, so the rig
    // has to consume the vertical intent as well as the horizontal one.
    expect(player).toMatch(/cameraYaw\.current\s*-=\s*input\.lookStickX/);
    expect(player).toMatch(/cameraPitch\.current\s*-=\s*input\.lookStickY/);
    expect(player).toMatch(/const orbitAngle = Math\.max\(0\.04/);
  });

  it('scales the camera stick by the frame, so the turn rate is the same at any fps', () => {
    // Accumulating per pointer event would make a slow phone spin faster.
    expect(player).toMatch(/LOOK_STICK_YAW_RATE \* dt/);
    expect(player).toMatch(/LOOK_STICK_PITCH_RATE \* dt/);
  });

  it('clamps the camera tilt so the lens cannot pass through the ground', () => {
    expect(player).toMatch(/PITCH_MAX/);
    expect(player).toMatch(/PITCH_MIN/);
    expect(player).toMatch(/Math\.max\(PITCH_MIN/);
  });

  it('draws the action buttons as glass rather than filled discs', () => {
    expect(css).toMatch(/\.touch-btn\s*\{[^}]*background:\s*var\(--glass-soft\)/);
    expect(css).toMatch(/\.touch-btn\s*\{[^}]*backdrop-filter/);
    // The old sandstone fill was near-opaque and hid the scene under a thumb.
    expect(css).not.toMatch(/\.touch-btn\s*\{[^}]*rgba\(201,\s*138,\s*82/);
  });

  it('reports every action button with a name a thumb can read', () => {
    for (const key of ['onboard.jump', 'onboard.homeShort', 'onboard.sprint']) {
      expect(screens).toContain(`t('${key}')`);
    }
    expect(screens).toMatch(/touch-btn-caption/);
  });

  it('releases held controls when the touch layer goes away', () => {
    // Pausing mid-sprint must not leave the character running on the menu.
    expect(inputState.releaseTouch).toBeTypeOf('function');
    inputState.setStick(1, 1);
    inputState.setLookStick(1, -1);
    inputState.setSprint(true);
    inputState.releaseTouch();
    expect(inputState.moveVector()).toEqual({ x: 0, y: 0 });
    expect(inputState.lookStickX).toBe(0);
    expect(inputState.lookStickY).toBe(0);
    expect(inputState.sprinting).toBe(false);
  });

  it('keeps the camera stick held until release instead of draining it each frame', () => {
    inputState.setLookStick(0.8, -0.4);
    expect(inputState.lookStickX).toBe(0.8);
    expect(inputState.lookStickY).toBe(-0.4);
    // Two frames of reading it must not halve it: it is a rate, not an event.
    expect(inputState.lookStickX).toBe(0.8);
    inputState.releaseTouch();
  });
});

describe('stick dead zone', () => {
  it('reads a resting thumb as centred', () => {
    expect(rescaleDeadZone(0)).toBe(0);
    expect(rescaleDeadZone(STICK_DEAD_ZONE / 2)).toBe(0);
    expect(rescaleDeadZone(STICK_DEAD_ZONE)).toBe(0);
  });

  it('still reaches full deflection at the far edge of the ring', () => {
    // A plain subtraction would cap the stick at 1 - deadZone, so the player
    // could never actually run at the run speed.
    expect(rescaleDeadZone(1)).toBeCloseTo(1, 10);
    expect(rescaleDeadZone(0.5)).toBeGreaterThan(0.4);
  });

  it('never reports more deflection than was pushed', () => {
    for (const raw of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      expect(rescaleDeadZone(raw)).toBeLessThanOrEqual(1);
      expect(rescaleDeadZone(raw)).toBeGreaterThanOrEqual(0);
    }
  });
});
