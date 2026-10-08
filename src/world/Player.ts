import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { input } from '../game/input';
import { cameraObstacles, resolve as resolveCollision } from './collision';
import { clampToWalkable } from './navigation';
import type { Collider } from './collision';
import type { RegionId } from '../types/catalog';

export interface PlayerState {
  position: THREE.Vector3;
  yaw: number;
  /** Facing direction the model is turned toward. */
  facing: number;
  grounded: boolean;
  velocityY: number;
  speed: number;
}

export interface PlayerControllerOptions {
  /** Walking speed in world units per second. */
  speed?: number;
  /** Sprinting speed; taken from the sprint modifier while Shift is held. */
  runSpeed?: number;
  jumpVelocity?: number;
  /** Camera yaw, owned by the camera rig. */
  cameraYaw: React.MutableRefObject<number>;
  reducedMotion: boolean;
  onInteract: () => void;
  onCycleTool: () => void;
  onPause: () => void;
  onReset: () => void;
  /** Recall to the hub spawn; wired to the on-screen home button and H. */
  onHome: () => void;
  enabled: boolean;
}

const GRAVITY = -26;
const RADIUS = 0.55;

/**
 * Third-person player with camera-relative movement, gravity, jump, and
 * analytic collision against region discs and cylinder obstacles.
 *
 * Deliberately no physics engine: every collision in this world is a disc, a
 * cylinder or a ground plane, which is cheaper and more predictable to solve
 * directly than to approximate with a rigid-body solver.
 */

export function usePlayerController(
  state: React.MutableRefObject<PlayerState>,
  options: PlayerControllerOptions,
): THREE.Mesh | null {
  const { camera, gl } = useThree();
  const walkSpeed = options.speed ?? 3.7;
  const runSpeed = options.runSpeed ?? 7.6;
  const jumpVelocity = options.jumpVelocity ?? 9.4;

  const velocity = useRef(new THREE.Vector3());
  const groupRef = useRef<THREE.Group>(null);

  // Ground height comes from the world query so the player walks on terrain.
  const sampleGround = useRef<(x: number, z: number) => number>(() => 0);

  useEffect(() => {
    const element = gl.domElement;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      element.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const buttons = event.buttons;
      if (buttons === 0) return;
      input.addLook(event.movementX * 0.0042, event.movementY * 0.0032);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
    };
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
    };
  }, [gl]);

  useFrame((_, rawDelta) => {
    const current = state.current;
    // Clamped so a tab-switch stall cannot teleport the player through a wall.
    const delta = Math.min(rawDelta, 1 / 20);
    const dt = options.enabled ? delta : 0;

    const look = input.consumeLook();
    options.cameraYaw.current -= look.x;
    if (!options.reducedMotion) {
      options.cameraYaw.current = clampAngle(options.cameraYaw.current);
    }

    if (options.enabled) {
      if (input.consume('interact')) options.onInteract();
      if (input.consume('cycleTool')) options.onCycleTool();
      if (input.consume('pause')) options.onPause();
      if (input.consume('resetPuzzle')) options.onReset();
      if (input.consume('home')) options.onHome();
    } else {
      input.clearEdges();
    }

    const move = options.enabled ? input.moveVector() : { x: 0, y: 0 };
    const yaw = options.cameraYaw.current;

    // Camera-relative basis: forward is the camera's look direction on the plane.
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    const speed = input.sprinting ? runSpeed : walkSpeed;
    const desiredX = (rightX * move.x + forwardX * move.y) * speed;
    const desiredZ = (rightZ * move.x + forwardZ * move.y) * speed;

    // Exponential smoothing keeps the walk from feeling instant or floaty.
    const blend = 1 - Math.exp(-11 * dt);
    velocity.current.x += (desiredX - velocity.current.x) * blend;
    velocity.current.z += (desiredZ - velocity.current.z) * blend;

    let nextX = current.position.x + velocity.current.x * dt;
    let nextZ = current.position.z + velocity.current.z * dt;

    // Horizontal collision against every solid thing in the world, then a
    // final clamp so the player can never step off the islands into the sky.
    if (isFinite(nextX) && isFinite(nextZ)) {
      const corrected = resolveCollision(nextX, nextZ, RADIUS, resolveOut);
      nextX = corrected.x;
      nextZ = corrected.z;
      const contained = clampToWalkable(nextX, nextZ, resolveOut);
      nextX = contained.x;
      nextZ = contained.z;
    }

    const groundY = sampleGround.current(nextX, nextZ);
    if (options.enabled && input.consume('jump') && current.grounded) {
      current.velocityY = jumpVelocity;
      current.grounded = false;
    }
    current.velocityY += GRAVITY * dt;
    let nextY = current.position.y + current.velocityY * dt;
    if (nextY <= groundY) {
      nextY = groundY;
      current.velocityY = 0;
      current.grounded = true;
    } else {
      current.grounded = false;
    }

    current.position.set(nextX, nextY, nextZ);
    current.speed = Math.hypot(velocity.current.x, velocity.current.z);
    if (current.speed > 0.4) {
      current.facing = Math.atan2(velocity.current.x, velocity.current.z);
    }

    if (groupRef.current) {
      groupRef.current.position.copy(current.position);
      groupRef.current.rotation.y = current.facing;
      // A gentle bob sells the weight of the character without a full rig.
      const bob = options.reducedMotion ? 0 : Math.sin(performance.now() * 0.011) * Math.min(current.speed, 6) * 0.012;
      groupRef.current.position.y += bob;
    }

    // Camera orbits behind the player, pulled in whenever something solid is
    // in the way so the character is never hidden by world geometry.
    // A tall, narrow viewport puts the character closer to the lens for the
    // same distance, so pull back further to keep the framing readable.
    const portrait = typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
    let distance = (options.reducedMotion ? 7.2 : 7.8) * (portrait ? 1.28 : 1);
    const height = (options.reducedMotion ? 3.9 : 3.4) * (portrait ? 1.15 : 1);
    const dirX = Math.sin(yaw);
    const dirZ = Math.cos(yaw);
    const targetX = current.position.x;
    const targetY = current.position.y + 1.6;
    const targetZ = current.position.z;

    for (const blocker of cameraObstacles()) {
      const bx = blocker.x - targetX;
      const bz = blocker.z - targetZ;
      const along = bx * dirX + bz * dirZ;
      // Only blockers between the player and the camera matter.
      if (along <= 0 || along >= distance) continue;
      const lateral = Math.abs(bx * dirZ - bz * dirX);
      if (lateral > blocker.radius) continue;
      const needed = along - Math.sqrt(Math.max(0, blocker.radius ** 2 - lateral ** 2));
      // Never crowd the character: the camera may come in, but not this far.
      if (needed > 0 && needed < distance) distance = Math.max(4.6, needed);
    }

    camera.position.x += (targetX + dirX * distance - camera.position.x) * (1 - Math.exp(-9 * dt));
    camera.position.y += (targetY + height - camera.position.y) * (1 - Math.exp(-9 * dt));
    camera.position.z += (targetZ + dirZ * distance - camera.position.z) * (1 - Math.exp(-9 * dt));
    camera.lookAt(targetX, targetY + 0.6, targetZ);
  });

  return null;
}

function clampAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export type { Collider };

/** Reused so the per-frame resolve allocates nothing. */
const resolveOut = { x: 0, z: 0 };

export function createPlayerState(position: THREE.Vector3): PlayerState {
  return {
    position: position.clone(),
    yaw: 0,
    facing: 0,
    grounded: true,
    velocityY: 0,
    speed: 0,
  };
}

/** Which region a position belongs to, used for HUD and music layers. */
export function regionAt(
  x: number,
  z: number,
  anchors: { id: RegionId; x: number; z: number; radius: number }[],
): RegionId {
  let best: RegionId = 'hub';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    const distance = Math.hypot(x - anchor.x, z - anchor.z);
    if (distance <= anchor.radius && distance < bestDistance) {
      best = anchor.id;
      bestDistance = distance;
    }
  }
  return best;
}

export function useGroundSampler(
  regions: { id: RegionId; x: number; z: number; radius: number; y: number }[],
): (x: number, z: number) => number {
  return useMemo(() => {
    const sample = (x: number, z: number): number => {
      for (const region of regions) {
        if (Math.hypot(x - region.x, z - region.z) <= region.radius) return region.y;
      }
      // Between regions the ground drops away into the haze; the bridges are
      // the only safe crossing, and they are placed on the path segments.
      for (const path of BRIDGES) {
        const t = nearestOnSegment(x, z, path);
        if (t !== null && t.dist <= path.width) return path.y;
      }
      return 0;
    };
    return sample;
  }, [regions]);
}

export interface Bridge {
  from: [number, number];
  to: [number, number];
  width: number;
  y: number;
}

export const BRIDGES: Bridge[] = [];

export function registerBridges(next: Bridge[]): void {
  BRIDGES.length = 0;
  BRIDGES.push(...next);
}

function nearestOnSegment(
  x: number,
  z: number,
  bridge: Bridge,
): { dist: number } | null {
  const [ax, az] = bridge.from;
  const [bx, bz] = bridge.to;
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) return null;
  let t = ((x - ax) * dx + (z - az) * dz) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const px = ax + dx * t;
  const pz = az + dz * t;
  return { dist: Math.hypot(x - px, z - pz) };
}