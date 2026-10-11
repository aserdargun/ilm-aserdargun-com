import * as THREE from 'three';

/**
 * Force every triangle in a flat, Y-up mesh to face the sky.
 *
 * Measuring one vertex is not the same claim as measuring the mesh. The disc is
 * emitted in two independent passes — an inner fan, then ring quads — and a
 * guard that samples vertex 0 only ever sees the fan. When the quads came out
 * inverted, the disc still reported +Y normals while 2,684 of its 2,806
 * triangles (95.7%) pointed at the ground and were culled from above. Nothing
 * threw, the material compiled, the maps loaded, and the terrain the player
 * walks on was never drawn at all — what read as ground was the island's cliff
 * underside showing through the hole, its 96-sector apex fan converging into a
 * radial starburst under the player.
 *
 * So every triangle is checked. The disc is flat, which makes the Y component
 * of the face normal the entire question: `uz * vx - ux * vz`, no normalisation
 * and no square root.
 *
 * Returns the number of triangles it had to flip, which is 0 for a healthy
 * builder and is what `tests/disc.test.ts` asserts on.
 */
export function faceUp(geo: THREE.BufferGeometry): number {
  const index = geo.getIndex();
  if (!index) return 0;
  const pos = geo.getAttribute('position');
  const a = index.array as Uint16Array | Uint32Array;
  let flipped = 0;
  for (let i = 0; i < a.length; i += 3) {
    const i0 = a[i];
    const i1 = a[i + 1];
    const i2 = a[i + 2];
    const ux = pos.getX(i1) - pos.getX(i0);
    const uz = pos.getZ(i1) - pos.getZ(i0);
    const vx = pos.getX(i2) - pos.getX(i0);
    const vz = pos.getZ(i2) - pos.getZ(i0);
    if (uz * vx - ux * vz < 0) {
      a[i + 1] = i2;
      a[i + 2] = i1;
      flipped += 1;
    }
  }
  if (flipped > 0) {
    index.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return flipped;
}

/**
 * A flat disc with real radial subdivision.
 *
 * `CircleGeometry` is a fan: one centre vertex and a single rim ring, so its
 * vertex colours can only vary *angularly* and never *radially*. Measured on
 * the running build, a 68-unit disc had 66 vertices, which puts a wedge about
 * 3.3 units wide at the rim — any colour feature smaller than that cannot be
 * represented at all, however the colour is computed. Concentric rings are what
 * the ground's mottling actually needs.
 */
export function buildDisc(radius: number, segments: number, rings: number): THREE.BufferGeometry {
  const positions: number[] = [0, 0, 0];
  for (let r = 1; r <= rings; r += 1) {
    const t = r / rings;
    for (let s = 0; s < segments; s += 1) {
      const angle = (s / segments) * Math.PI * 2;
      positions.push(Math.cos(angle) * radius * t, 0, Math.sin(angle) * radius * t);
    }
  }

  const ringStart = (r: number) => 1 + (r - 1) * segments;
  const indices: number[] = [];
  for (let s = 0; s < segments; s += 1) {
    const next = (s + 1) % segments;
    indices.push(0, ringStart(1) + next, ringStart(1) + s);
  }
  for (let r = 1; r < rings; r += 1) {
    const inner = ringStart(r);
    const outer = ringStart(r + 1);
    for (let s = 0; s < segments; s += 1) {
      const next = (s + 1) % segments;
      // The quad's corners in order are inner+s, outer+s, outer+next,
      // inner+next. Splitting it on `inner+next -> outer+next` looks
      // reasonable and is wrong: that is the quad's own outer edge, not a
      // diagonal. Both triangles then sit on the same side of it, so they
      // overlap and leave a wedge-shaped hole between them — measured on the
      // running build, roughly half the disc fell through to the cliff
      // underneath and the ground rendered as a radial pinwheel. The inner->
      // outer diagonal puts the two apexes on opposite sides, which tiles.
      indices.push(inner + s, outer + next, outer + s);
      indices.push(inner + s, inner + next, outer + next);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  faceUp(geo);
  return geo;
}