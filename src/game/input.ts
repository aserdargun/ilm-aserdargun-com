/**
 * Input: keyboard, pointer drag and touch, in one place.
 *
 * Held state is polled by the movement loop (frame-rate independent), while
 * discrete actions (interact, jump, tool cycle) are delivered as one-shot
 * edges so a key press is never missed between frames.
 */

export type ActionKey = 'interact' | 'jump' | 'cycleTool' | 'pause' | 'resetPuzzle';

const ACTION_BINDINGS: Record<string, ActionKey> = {
  KeyE: 'interact',
  Enter: 'interact',
  Space: 'jump',
  KeyQ: 'cycleTool',
  Escape: 'pause',
  KeyR: 'resetPuzzle',
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
  /** Accumulated look delta in radians, drained each frame. */
  lookDeltaX = 0;
  lookDeltaY = 0;
  /** Virtual stick from the on-screen joystick, -1..1. */
  stickX = 0;
  stickY = 0;
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

  /** Holding Shift sprints; without it the player walks. */
  get sprinting(): boolean {
    return this.held.has('ShiftLeft') || this.held.has('ShiftRight');
  }

  /** Consumes a one-shot action. Returns true exactly once per press. */
  consume(action: ActionKey): boolean {
    if (!this.edges.has(action)) return false;
    this.edges.delete(action);
    return true;
  }

  clearEdges(): void {
    this.edges.clear();
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
}

export const input = new InputState();

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