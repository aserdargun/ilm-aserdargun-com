/**
 * Collision registry.
 *
 * Everything solid in the world registers a horizontal disc here: landmarks,
 * stage consoles, scattered props and the larger rocks. The player is pushed
 * out of the union of those discs each frame.
 *
 * Discs rather than boxes because the world's collision is almost entirely
 * vertical cylinders, and a disc is both cheaper and harder to snag on than an
 * axis-aligned box.
 */

export interface Collider {
  x: number;
  z: number;
  radius: number;
  /**
   * Approximate height above the ground. The camera rides at roughly 3.4
   * units, so anything shorter than that is looked over rather than dodged —
   * otherwise walking between two waist-high pillars yanks the camera in.
   */
  height: number;
  /**
   * Which system added this. Owners let a group be rebuilt without dropping
   * everything else: props reload when their geometry changes, landmarks once.
   */
  owner?: string;
}

const colliders: Collider[] = [];

export function clearColliders(owner?: string): void {
  if (owner === undefined) {
    colliders.length = 0;
    return;
  }
  for (let i = colliders.length - 1; i >= 0; i -= 1) {
    if (colliders[i].owner === owner) colliders.splice(i, 1);
  }
}

export function addCollider(collider: Collider): void {
  colliders.push(collider);
}

export function addColliders(next: Collider[]): void {
  for (const c of next) colliders.push(c);
}

export function getColliders(): readonly Collider[] {
  return colliders;
}

export function colliderCount(): number {
  return colliders.length;
}

/** Colliders added by a given owner, for diagnostics. */
export function countByOwner(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of colliders) {
    const key = c.owner ?? 'world';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/**
 * Resolves a position against the collider set, pushing out along the shortest
 * axis so the player slides along a wall instead of sticking to it.
 *
 * Returns the corrected position; the input is not mutated.
 */
export function resolve(
  x: number,
  z: number,
  playerRadius: number,
  out: { x: number; z: number },
): { x: number; z: number } {
  let px = x;
  let pz = z;

  // Two passes: a single pass can leave the player inside a neighbouring disc
  // that the first push moved them into.
  for (let pass = 0; pass < 2; pass += 1) {
    let moved = false;
    for (const c of colliders) {
      const dx = px - c.x;
      const dz = pz - c.z;
      const minDistance = c.radius + playerRadius;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= minDistance * minDistance) continue;

      const distance = Math.sqrt(distanceSq);
      if (distance < 1e-4) {
        // Dead centre: push along +X so the result is deterministic.
        out.x = c.x + minDistance;
        out.z = pz;
      } else {
        const push = (minDistance - distance) / distance;
        out.x = px + dx * push;
        out.z = pz + dz * push;
      }
      px = out.x;
      pz = out.z;
      moved = true;
    }
    if (!moved) break;
  }

  out.x = px;
  out.z = pz;
  return out;
}

/** Height the third-person camera rides at, above the player's head. */
export const CAMERA_HEIGHT = 3.4;

/**
 * Only geometry taller than the camera should push it around; shorter scenery
 * is simply seen over.
 */
export function cameraObstacles(): Collider[] {
  return colliders.filter((c) => c.height > CAMERA_HEIGHT * 0.92);
}