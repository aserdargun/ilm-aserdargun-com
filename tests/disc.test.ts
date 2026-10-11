import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildDisc, faceUp } from '../src/world/disc';

/**
 * The ground disc spent its whole life wrong twice, and neither bug threw.
 *
 * Both shipped because the only check on the mesh was "does vertex 0's normal
 * point up", which the inner fan always satisfies. What the player actually saw
 * on the hub was the island's cliff underside showing through a disc that was
 * not there: 95.7% of its triangles faced the ground and were culled, and the
 * quad split then dropped roughly half of what was left into holes.
 *
 * So the tests below assert the two things that actually matter — every
 * triangle faces the sky, and the triangles tile the disc — instead of a proxy
 * that a single sample can satisfy.
 */

interface Tri {
  a: number;
  b: number;
  c: number;
}

function triangles(geo: THREE.BufferGeometry): Tri[] {
  const index = geo.getIndex();
  if (!index) throw new Error('disc must be indexed');
  const a = index.array as Uint16Array | Uint32Array;
  const out: Tri[] = [];
  for (let i = 0; i < a.length; i += 3) out.push({ a: a[i], b: a[i + 1], c: a[i + 2] });
  return out;
}

function faceNormalY(geo: THREE.BufferGeometry, t: Tri): number {
  const p = geo.getAttribute('position');
  const ux = p.getX(t.b) - p.getX(t.a);
  const uz = p.getZ(t.b) - p.getZ(t.a);
  const vx = p.getX(t.c) - p.getX(t.a);
  const vz = p.getZ(t.c) - p.getZ(t.a);
  return uz * vx - ux * vz;
}

function totalArea(geo: THREE.BufferGeometry): number {
  const p = geo.getAttribute('position');
  let area = 0;
  for (const t of triangles(geo)) {
    const ux = p.getX(t.b) - p.getX(t.a);
    const uy = p.getY(t.b) - p.getY(t.a);
    const uz = p.getZ(t.b) - p.getZ(t.a);
    const vx = p.getX(t.c) - p.getX(t.a);
    const vy = p.getY(t.c) - p.getY(t.a);
    const vz = p.getZ(t.c) - p.getZ(t.a);
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    area += Math.hypot(cx, cy, cz) / 2;
  }
  return area;
}

// The shapes the game actually builds: `max(96, round(radius * 3.6))` segments
// and 12 rings, for every region radius in the catalog.
const SHAPES: [number, number][] = [
  [34, 122],
  [40, 144],
  [42, 151],
  [44, 158],
  [46, 166],
  [12, 96],
];

describe('buildDisc', () => {
  it('puts every triangle face up', () => {
    for (const [radius, segments] of SHAPES) {
      const geo = buildDisc(radius, segments, 12);
      const down = triangles(geo).filter((t) => faceNormalY(geo, t) < 0);
      expect(down, `${radius}u disc had ${down.length} downward triangles`).toHaveLength(0);
    }
  });

  it('repairs a winding error when one is present', () => {
    // The guard is a safety net, not a crutch: `buildDisc` is expected to emit
    // correct winding on its own (covered above), and `faceUp` only exists so
    // a future edit that gets it wrong fails loudly instead of quietly
    // rendering an island with a hole in it.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3),
    );
    geo.setIndex([0, 1, 2]);
    expect(faceNormalY(geo, triangles(geo)[0])).toBeLessThan(0);

    expect(faceUp(geo)).toBe(1);
    expect(faceNormalY(geo, triangles(geo)[0])).toBeGreaterThan(0);
    expect(geo.getAttribute('normal').getY(0)).toBeCloseTo(1, 6);
  });

  it('tiles the disc instead of punching holes in it', () => {
    for (const [radius, segments] of SHAPES) {
      const geo = buildDisc(radius, segments, 12);
      const area = totalArea(geo);
      const expected = Math.PI * radius * radius;
      // Overlap inflates this above pi*r^2; holes deflate it below. The old
      // quad split sat at about 0.71 of the disc, so the tolerance is loose
      // enough for float error and tight enough to catch that.
      expect(area / expected, `${radius}u disc covered ${(area / expected * 100).toFixed(1)}%`).toBeGreaterThan(0.999);
      expect(area / expected).toBeLessThan(1.001);
    }
  });

  it('keeps the vertex budget it was measured to have', () => {
    for (const [radius, segments] of SHAPES) {
      const rings = 12;
      const geo = buildDisc(radius, segments, rings);
      // One centre vertex plus one full ring of `segments` per ring.
      expect(geo.getAttribute('position').count).toBe(1 + segments * rings);
      // The inner fan is `segments` triangles; each of the `rings - 1` bands
      // between rings is two triangles per segment.
      const tris = segments * (1 + 2 * (rings - 1));
      expect(tris).toBe(geo.getIndex()!.count / 3);
    }
  });

  it('is flat, so the walkable plane navigation assumes cannot drift', () => {
    // `navigation.ts` solves movement in 2D against y=0. A vertex that leaves
    // that plane would be a surface the player visibly floats above.
    for (const [radius, segments] of SHAPES) {
      const geo = buildDisc(radius, segments, 12);
      const p = geo.getAttribute('position');
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < p.count; i += 1) {
        minY = Math.min(minY, p.getY(i));
        maxY = Math.max(maxY, p.getY(i));
      }
      expect(minY).toBe(0);
      expect(maxY).toBe(0);
    }
  });

  it('points every vertex normal straight up', () => {
    const geo = buildDisc(34, 122, 12);
    const n = geo.getAttribute('normal');
    for (let i = 0; i < n.count; i += 1) {
      expect(n.getY(i)).toBeCloseTo(1, 6);
      expect(n.getX(i)).toBeCloseTo(0, 6);
      expect(n.getZ(i)).toBeCloseTo(0, 6);
    }
  });
});