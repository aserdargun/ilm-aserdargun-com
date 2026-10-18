import type * as THREE from 'three';

/**
 * One placed model in the scene graph: enough to tell two instances of the same
 * GLB apart from two different models that happen to be the same size.
 */
export interface PlacedModel {
  /** Vertex/mesh counts of the loaded scene, e.g. `"657v/4m"`. */
  signature: string;
  /** World position of the loaded scene's root. */
  position: [number, number, number];
}

export interface PiledReport {
  signature: string;
  instances: number;
  distinctPositions: number;
  positions: [number, number, number][];
}

/**
 * Finds models that are drawn in more places than they occupy.
 *
 * drei's `useModel` is memoised by name, so every `<Asset>` asking for the same
 * file is handed the *same* Object3D. Rendering one three.js node from several
 * `<primitive>` elements asks for several parents, the last one to mount wins,
 * and the rest are drawn silently in the wrong place — no error, no warning, and
 * the meshes are all still submitted, so nothing looks wrong in a frame count.
 *
 * That is not hypothetical: all twenty-eight puzzle consoles were drawing their
 * plinth at one point beside the spawn, and not one console had a plinth where
 * the player stands. This is the check that catches it, and it is a scene-graph
 * fact rather than a pixel one: a model drawn N times must occupy N places.
 */
export function findPiledModels(placed: PlacedModel[], tolerance = 0.01): PiledReport[] {
  const bySignature = new Map<string, [number, number, number][]>();
  for (const item of placed) {
    const list = bySignature.get(item.signature);
    if (list) list.push(item.position);
    else bySignature.set(item.signature, [item.position]);
  }

  const reports: PiledReport[] = [];
  for (const [signature, positions] of bySignature) {
    if (positions.length < 2) continue;
    const distinct: [number, number, number][] = [];
    for (const p of positions) {
      const seen = distinct.some(
        (q) => Math.abs(q[0] - p[0]) <= tolerance
            && Math.abs(q[1] - p[1]) <= tolerance
            && Math.abs(q[2] - p[2]) <= tolerance,
      );
      if (!seen) distinct.push(p);
    }
    if (distinct.length !== positions.length) {
      reports.push({ signature, instances: positions.length, distinctPositions: distinct.length, positions });
    }
  }
  return reports.sort((a, b) => b.instances - a.instances);
}

/**
 * Walks a three.js scene and records the world position of every loaded GLB
 * root. Only roots are counted: drei names them `Scene`, and including their
 * ancestors would double-count every model against itself.
 */
export function placedModels(root: THREE.Object3D, isRoot: (o: THREE.Object3D) => boolean): PlacedModel[] {
  const out: PlacedModel[] = [];
  root.traverse((o) => {
    if (!isRoot(o)) return;
    let verts = 0;
    let meshes = 0;
    o.traverse((c) => {
      const mesh = c as THREE.Mesh;
      const pos = mesh.geometry?.getAttribute?.('position');
      if (mesh.isMesh && pos) {
        meshes += 1;
        verts += pos.count;
      }
    });
    if (verts === 0) return;
    const world = o.getWorldPosition(o.position.clone());
    out.push({ signature: `${verts}v/${meshes}m`, position: [world.x, world.y, world.z] });
  });
  return out;
}

/** drei names every loaded GLB's root node `Scene`. */
export function isGltfRoot(o: THREE.Object3D): boolean {
  // `isGroup` lives on Group, not on the Object3D base class in three r186.
  return (o as THREE.Group).isGroup === true && o.name === 'Scene';
}

/**
 * A caster lifted far enough off the ground that its shadow lands somewhere the
 * player cannot connect to the thing casting it.
 *
 * The tapestry was the case in point: fourteen 3x4.6 panels and a 52-unit beam
 * between 15 and 20 units of altitude, dropping a hard band at half the ground's
 * brightness straight across the middle of the hub. Nothing was wrong with the
 * lighting, the albedo or the shadow map — the band was a correct shadow of a
 * real object. But at the resting camera the tapestry sits 57 degrees up, well
 * outside a 29-degree half-frame, so the band had nothing in frame to explain
 * it and read as a stain on the sand.
 *
 * The threshold is what separates that from ordinary scenery. Everything else
 * in the world that casts sits between 3.6 and 5.8 units up, and a shadow
 * thrown from there lands within a unit or two of its own caster, close enough
 * for the eye to connect them. Height is the only test: on the shipped world
 * nothing else clears eight, and a span rule was tried and dropped because it
 * hid the very meshes that drew the band — fourteen panels of 3.1 units across
 * are narrower than any mast-like cutoff worth having.
 *
 * This is a screen, not a verdict, and on the shipped world it reports one
 * caster: the synthesis tree's canopy, 20 metres across at 13 units, whose
 * shadow falls 11 units away onto a tree the player is looking straight at.
 * That one is accepted. It stayed in the list while the tapestry sat at the top
 * of it for years without anyone reading it, which is the argument for the
 * check existing and also for reading what it says.
 */
export const ORPHAN_CASTER_MIN_HEIGHT = 8;

export interface OrphanCasterReport {
  name: string;
  /** Lowest world-space point of the caster, in units above the ground. */
  baseHeight: number;
  /** Largest horizontal extent, in units — context for judging, not a test. */
  span: number;
}

/**
 * Lists shadow casters whose shadow is dropped on ground far from themselves.
 *
 * Returns `[]` on a sound scene, which is the point: this is a standing check,
 * not a one-off repair, so the next thing built at altitude is caught by the
 * same test that caught the tapestry.
 */
export function findOrphanShadowCasters(root: THREE.Object3D): OrphanCasterReport[] {
  const out: OrphanCasterReport[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !(mesh as unknown as { castShadow?: boolean }).castShadow) return;
    const geometry = mesh.geometry;
    if (!geometry?.getAttribute?.('position')) return;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return;
    const world = box.clone().applyMatrix4(o.matrixWorld);
    if (world.min.y < ORPHAN_CASTER_MIN_HEIGHT) return;
    const span = Math.max(world.max.x - world.min.x, world.max.z - world.min.z);
    out.push({ name: o.name || '(unnamed)', baseHeight: +world.min.y.toFixed(2), span: +span.toFixed(2) });
  });
  return out.sort((a, b) => b.baseHeight - a.baseHeight || b.span - a.span);
}

/**
 * The other direction: an object standing on the ground that casts nothing.
 *
 * `findOrphanShadowCasters` asks whether a shadow is landing somewhere it cannot be
 * explained from. This asks the complementary question — whether something the player
 * is looking at is not attached to the ground at all, because the thing tying it down
 * is missing.
 *
 * It is the same class of defect as the orphan caster and was found the same way,
 * by walking: on a bridge the turquoise rails had no shadow, so they read as a
 * stripe painted onto the deck rather than a raised thing standing on it. Neither
 * rail had `castShadow`. Fourteen panels and a beam had once had it, wrongly, high
 * in the air; here twenty-eight boxes 0.16 to 0.7 units thick did not have it at
 * all, and nobody could tell, because the deck they sit on *does* receive shadows
 * and so the frame looks correctly lit.
 *
 * The thresholds are deliberately loose, and the function returns everything it
 * finds rather than judging. `GROUND_CASTER_BOTTOM_MAX` is 1 rather than a
 * half-unit because a rail is two boxes: the turquoise post stands on the deck and
 * the copper cap stands on the post, at 0.75 units. A band that stopped at the deck
 * would have caught fourteen of the twenty-eight and called the job done.
 *
 * On the shipped world it reports those twenty-eight rails plus the seven bridge
 * decks and two canal steps, and every one of the nine extras is a deliberate
 * exception. A deck is half a unit thick over open sky with nothing underneath to
 * receive it; a canal step's shadow would be a hairline. Reading the list is the
 * job, which is why it exists next to the orphan-caster screen and not instead of
 * it.
 */
export const GROUND_CASTER_BOTTOM_MIN = -0.2;
export const GROUND_CASTER_BOTTOM_MAX = 1;
export const GROUND_CASTER_MIN_SIZE = 0.4;

export interface MissingCasterReport {
  name: string;
  /** Lowest world-space point, in units. Sitting at the ground is the condition. */
  bottom: number;
  height: number;
  /** Largest horizontal extent, in units. */
  span: number;
}

/**
 * Lists meshes resting on the ground that do not cast a shadow.
 *
 * Returns `[]` on a scene with nothing suspicious, which is the point.
 */
export function findMissingShadowCasters(root: THREE.Object3D): MissingCasterReport[] {
  const out: MissingCasterReport[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as unknown as { castShadow?: boolean }).castShadow) return;
    const geometry = mesh.geometry;
    if (!geometry?.getAttribute?.('position')) return;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return;
    const world = box.clone().applyMatrix4(o.matrixWorld);
    if (world.min.y < GROUND_CASTER_BOTTOM_MIN || world.min.y > GROUND_CASTER_BOTTOM_MAX) return;
    const height = world.max.y - world.min.y;
    const span = Math.max(world.max.x - world.min.x, world.max.z - world.min.z);
    if (height < GROUND_CASTER_MIN_SIZE || Math.max(span, height) < GROUND_CASTER_MIN_SIZE * 2) return;
    out.push({
      name: o.name || '(unnamed)',
      bottom: +world.min.y.toFixed(2),
      height: +height.toFixed(2),
      span: +span.toFixed(2),
    });
  });
  return out.sort((a, b) => b.span * b.height - a.span * a.height);
}
/**
 * A platform the player can stand *inside*.
 *
 * The one failure in this world that looks like the game has simply not loaded:
 * the character mesh reports `visible`, projects to a real screen position, and
 * the pixels there are bare ground. The player is between the disc and the
 * terrace top, which is a metre or two of geometry with no hole in it to walk
 * through.
 *
 * It happened twice for one reason. The landmark colliders are a hand-written
 * table in `landmark-colliders.ts`, checked against one landmark's own meshes at
 * a time; the Flow Foundry's canal belongs to the same island but to no group
 * anyone was looking at, so its 15.1-unit slab sat behind a 7-unit ring. The
 * check that finds it has to run over **the scene**, not over a group.
 *
 * The four thresholds separate "can swallow a 2.2-unit character" from ordinary
 * scenery:
 *
 * * **base** near zero, because a platform that does not reach the ground is
 *   something the player walks *under* — the loom's beams sit at 5.5 units and
 *   have a footprint wider than the canal's.
 * * **top** above 0.45 and below 6. Above 0.45 because anything shorter is a
 *   kerb the player steps over; below 6 because a taller thing has a top to
 *   stand on rather than a floor to disappear under.
 * * **radius** by the 90th percentile of vertex distance from the mesh's own
 *   centre, not by its bounding box. The bounding box of a 30-unit causeway is
 *   30 units wide in every direction, and using it once reported the entire
 *   bridge system as a platform.
 */
export const PLATFORM_BASE_MIN = -0.3;
export const PLATFORM_BASE_MAX = 0.8;
export const PLATFORM_TOP_MIN = 0.45;
export const PLATFORM_TOP_MAX = 6;
export const PLATFORM_MIN_RADIUS = 1.2;

/** How far short of covered still counts as covered, in world units. */
export const PLATFORM_COVERED_SLACK = 0.02;

export interface UncoveredPlatformReport {
  name: string;
  x: number;
  z: number;
  /** 90th-percentile vertex distance from the mesh centre, in world units. */
  radius: number;
  /** Highest point, in world units. */
  top: number;
  /** Units of the footprint with no collider over them. */
  uncoveredBy: number;
}

/**
 * Lists surfaces tall enough to hide a standing player that no collider covers.
 *
 * Returns `[]` on a sound scene, which is the point: this is a standing check, so
 * the next platform that is built past its ring is caught the day it lands rather
 * than the day someone walks into it.
 */
export function findUncoveredPlatforms(
  root: THREE.Object3D,
  colliders: readonly { x: number; z: number; radius: number }[],
  /**
   * Causeway decks. They are walkable surfaces the player is meant to be
   * standing on — `groundAt` returns the span's own height there — so no single
   * island collider can or should cover them. Measured from the hub they read a
   * 118-unit radius, which is how two dozen of them turned up in a list meant to
   * find gaps between a collider and the thing it guards.
   */
  spans: readonly { from: [number, number]; to: [number, number]; width: number }[] = [],
): UncoveredPlatformReport[] {
  const out: UncoveredPlatformReport[] = [];

  root.traverse((child) => {
    const mesh = child as THREE.Mesh & { isInstancedMesh?: boolean };
    if (!mesh.isMesh || mesh.isInstancedMesh) return;
    const position = mesh.geometry?.getAttribute('position');
    if (!position || position.count === 0) return;

    // The player is not scenery. `NO_DETAIL_FLAG` is already the marker the
    // scene uses for the character and its spark, and their meshes otherwise
    // report as platforms sitting in the spawn with a twenty-unit footprint.
    const material = mesh.material as { userData?: Record<string, unknown> } | undefined;
    if (material?.userData?.ilmekNoDetail) return;

    const m = mesh.matrixWorld.elements;
    let base = Infinity;
    let top = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
      if (wy < base) base = wy;
      if (wy > top) top = wy;
      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wz < minZ) minZ = wz;
      if (wz > maxZ) maxZ = wz;
    }
    if (base < PLATFORM_BASE_MIN || base > PLATFORM_BASE_MAX) return;
    if (top < PLATFORM_TOP_MIN || top > PLATFORM_TOP_MAX) return;
    if (colliders.length === 0) return;

    if (spans.length > 0) {
      let onSpan = 0;
      let sampled = 0;
      const stride0 = Math.max(1, Math.floor(position.count / 200));
      for (let i = 0; i < position.count; i += stride0) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        sampled += 1;
        for (const sp of spans) {
          const ax = sp.from[0];
          const az = sp.from[1];
          const bx = sp.to[0];
          const bz = sp.to[1];
          const dx = bx - ax;
          const dz = bz - az;
          const len2 = dx * dx + dz * dz;
          const t = len2 > 0 ? Math.max(0, Math.min(1, ((wx - ax) * dx + (wz - az) * dz) / len2)) : 0;
          const px = ax + dx * t;
          const pz = az + dz * t;
          if (Math.hypot(wx - px, wz - pz) <= sp.width / 2 + 1) {
            onSpan += 1;
            break;
          }
        }
      }
      if (sampled > 0 && onSpan / sampled > 0.8) return;
    }

    // The question is not how big the mesh is — it is whether any collider
    // reaches past its edge. Measuring the radius about the mesh's own vertex
    // centroid was the first attempt and it is wrong twice over: the centroid of
    // a capped cylinder is not its axis (a 15-unit cylinder centred on the origin
    // measured 0.405 off it), and a long causeway's footprint has no single centre
    // worth naming. So every vertex is measured **from the collider** instead,
    // and the covering collider is the one that comes closest.
    //
    // Sampling is strided rather than exhaustive, so the radius is an
    // underestimate and a hair of slack is given back at the end; the shortfall
    // printed is then a floor on the gap, not an estimate of it.
    const stride = Math.max(1, Math.floor(position.count / 600));
    let bestShortfall = Infinity;
    let bestReach = 0;
    for (const c of colliders) {
      let reach = 0;
      for (let i = 0; i < position.count; i += stride) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        const d = Math.hypot(wx - c.x, wz - c.z);
        if (d > reach) reach = d;
      }
      const shortfall = reach * (position.count / (Math.ceil(position.count / stride) * stride)) - c.radius;
      if (shortfall < bestShortfall) {
        bestShortfall = shortfall;
        bestReach = reach * (position.count / (Math.ceil(position.count / stride) * stride));
      }
    }
    // 0.02 units is under a centimetre at character scale, and it absorbs the
    // float error that otherwise reports the terrace and the mirror plinth —
    // both covered to the last decimal — as uncovered.
    if (!Number.isFinite(bestShortfall) || bestShortfall <= PLATFORM_COVERED_SLACK) return;

    out.push({
      name: mesh.name || mesh.type,
      x: Math.round((minX + maxX) / 2),
      z: Math.round((minZ + maxZ) / 2),
      // Longest distance from the covering collider's centre, so the two numbers
      // are read against the same centre.
      radius: Math.round(bestReach * 100) / 100,
      top: Math.round(top * 100) / 100,
      uncoveredBy: Math.round(bestShortfall * 100) / 100,
    });
  });

  return out.sort((a, b) => b.uncoveredBy - a.uncoveredBy);
}
