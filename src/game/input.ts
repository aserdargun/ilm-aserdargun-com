/**
 * Input: keyboard, pointer drag and touch, in one place.
 *
 * Held state is polled by the movement loop (frame-rate independent), while
 * discrete actions (interact, jump, tool cycle) are delivered as one-shot
 * edges so a key press is never missed between frames.
 */

export type ActionKey = 'interact' | 'jump' | 'cycleTool' | 'pause' | 'resetPuzzle' | 'home';

const ACTION_BINDINGS: Record<string, ActionKey> = {
  KeyE: 'interact',
  Enter: 'interact',
  Space: 'jump',
  KeyQ: 'cycleTool',
  Escape: 'pause',
  KeyR: 'resetPuzzle',
  KeyH: 'home',
};

/**
 * Movement intent as [strafe, forward].
 *
 * The forward component is positive for "away from the camera". The camera sits
 * at player + (sin yaw, cos yaw) * distance, so its forward direction is
 * -(sin yaw, cos yaw); W must therefore be +1 to walk into the screen rather
 * than back toward the viewer.
 */
const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

class InputState {
  private held = new Set<string>();
  private edges = new Set<ActionKey>();
  /** Actions queued by on-screen controls, consumed like key presses. */
  private queued: ActionKey[] = [];
  /** Held by the on-screen sprint button, as Shift would be. */
  private virtualSprint = false;
  /** Accumulated look delta in radians, drained each frame. */
  lookDeltaX = 0;
  lookDeltaY = 0;
  /** Virtual stick from the on-screen joystick, -1..1. */
  stickX = 0;
  stickY = 0;
  /**
   * Right-hand camera stick, -1..1. Held rather than accumulated: the camera
   * keeps turning for as long as the thumb rests off-centre, so this is read
   * every frame instead of being drained.
   */
  lookStickX = 0;
  lookStickY = 0;
  enabled = true;

  private onKeyDown = (event: KeyboardEvent) => {
    if (!this.enabled) return;
    const target = event.target as HTMLElement | null;
    // Never steal keys from a focused control or a text field.
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

    if (!event.repeat) {
      this.held.add(event.code);
      const action = ACTION_BINDINGS[event.code];
      if (action) this.edges.add(action);
    }
    if (MOVE_KEYS[event.code] || event.code === 'Space') event.preventDefault();
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.held.delete(event.code);
  };

  private onBlur = () => {
    this.held.clear();
  };

  attach(target: EventTarget = window) {
    target.addEventListener('keydown', this.onKeyDown as EventListener);
    target.addEventListener('keyup', this.onKeyUp as EventListener);
    window.addEventListener('blur', this.onBlur);
  }

  detach(target: EventTarget = window) {
    target.removeEventListener('keydown', this.onKeyDown as EventListener);
    target.removeEventListener('keyup', this.onKeyUp as EventListener);
    window.removeEventListener('blur', this.onBlur);
  }

  /** Normalised movement intent in camera space: x = strafe, y = forward. */
  moveVector(): { x: number; y: number } {
    let x = this.stickX;
    let y = this.stickY;
    for (const code of this.held) {
      const delta = MOVE_KEYS[code];
      if (!delta) continue;
      x += delta[0];
      y += delta[1];
    }
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    return { x, y };
  }

  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  /** Queued jump from the on-screen button. */
  jump(): void {
    this.queueAction('jump');
  }

  cycleTool(): void {
    this.queueAction('cycleTool');
  }

  /** Queued recall to the hub from the on-screen home button. */
  home(): void {
    this.queueAction('home');
  }

  /**
   * Sprint from the on-screen button. Held, not queued, so releasing the thumb
   * drops straight back to a walk the same way letting go of Shift does.
   */
  setSprint(active: boolean): void {
    this.virtualSprint = active;
  }

  /** Holding Shift sprints; without it the player walks. */
  get sprinting(): boolean {
    return (
      this.virtualSprint || this.held.has('ShiftLeft') || this.held.has('ShiftRight')
    );
  }

  /** Queues a one-shot action from an on-screen button. */
  queueAction(action: ActionKey): void {
    this.queued.push(action);
  }

  /** Consumes a one-shot action. Returns true exactly once per press. */
  consume(action: ActionKey): boolean {
    const queuedAt = this.queued.indexOf(action);
    if (queuedAt >= 0) {
      this.queued.splice(queuedAt, 1);
      return true;
    }
    if (!this.edges.has(action)) return false;
    this.edges.delete(action);
    return true;
  }

  clearEdges(): void {
    this.edges.clear();
    this.queued.length = 0;
  }

  addLook(dx: number, dy: number): void {
    this.lookDeltaX += dx;
    this.lookDeltaY += dy;
  }

  consumeLook(): { x: number; y: number } {
    const out = { x: this.lookDeltaX, y: this.lookDeltaY };
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    return out;
  }

  setStick(x: number, y: number): void {
    this.stickX = x;
    this.stickY = y;
  }

  setLookStick(x: number, y: number): void {
    this.lookStickX = x;
    this.lookStickY = y;
  }

  /**
   * Releases every held on-screen control. Called when the touch layer unmounts
   * so a thumb that was still down as the screen paused cannot leave the player
   * sprinting or spinning the camera into the next stage.
   */
  releaseTouch(): void {
    this.stickX = 0;
    this.stickY = 0;
    this.lookStickX = 0;
    this.lookStickY = 0;
    this.virtualSprint = false;
  }
}

export const input = new InputState();

/**
 * Fraction of a stick ring that still reads as centred. A resting thumb always
 * reports a pixel or two of drift, and without this the character walks off on
 * its own; the ring is still large enough that the far edge is reachable
 * without lifting the thumb.
 */
export const STICK_DEAD_ZONE = 0.14;

/**
 * Maps a 0..1 deflection onto the intent it should report, where everything
 * inside the dead zone is zero and the far edge of the ring is still exactly 1.
 * A plain subtraction would leave full deflection stuck at 1 - deadZone.
 */
export function rescaleDeadZone(raw: number): number {
  if (raw <= STICK_DEAD_ZONE) return 0;
  return (raw - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE);
}

/**
 * Touch state for the virtual joystick and look-drag. Kept separate so the
 * desktop path never has to reason about touch.
 */
export interface TouchState {
  stickActive: boolean;
  stickOrigin: { x: number; y: number };
  lookId: number | null;
}

export const touch: TouchState = {
  stickActive: false,
  stickOrigin: { x: 0, y: 0 },
  lookId: null,
};

/**
 * Whether this device is driven by touch rather than a pointer and a keyboard.
 *
 * Lives here because both the on-screen controls and the HUD layout need the
 * same answer: the controls are only mounted when it is true, and the HUD only
 * moves out of the way when it is true. Probed once — the hardware cannot
 * change under a live session.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
  );
}