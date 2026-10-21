/**
 * Read the framebuffer back and compare the ground with the contact patch
 * visible and hidden.
 *
 * The screenshot of the patch said it was pale where it should have been dark.
 * A picture cannot say whether the blend multiplied or covered the ground, and
 * it cannot say by how much. The drawing buffer can: the same pixels, read
 * twice in the same frame with the patch toggled between the two reads.
 *
 * The render is forced by hand rather than sampled from the loop, because the
 * loop's buffer is composited away before a read can reach it.
 */

const params = new URLSearchParams(location.hash.replace(/^#/, ''));
const THREE = await import('/node_modules/.vite/deps/three.js');

const { scene, camera, renderer } = window.__ilm.three;
const gl = renderer.getContext();

// The patch is the only multiply-blended thing in the scene.
const patches = [];
scene.traverse((o) => {
  if (!o.isMesh) return;
  const m = o.material;
  if (!m || m.blending !== THREE.MultiplyBlending) return;
  patches.push(o);
});

const readRegion = (x0, y0, x1, y1) => {
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const dpr = w / window.innerWidth;
  const bx0 = Math.round(x0 * dpr);
  const bx1 = Math.round(x1 * dpr);
  // The drawing buffer's origin is bottom-left; the screen's is top-left.
  const by0 = Math.round((window.innerHeight - y1) * dpr);
  const by1 = Math.round((window.innerHeight - y0) * dpr);
  const bw = bx1 - bx0;
  const bh = by1 - by0;
  const buf = new Uint8Array(bw * bh * 4);
  gl.readPixels(bx0, by0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const out = new Float64Array(bw * bh);
  for (let i = 0; i < bw * bh; i += 1) {
    out[i] = 0.2126 * buf[i * 4] + 0.7152 * buf[i * 4 + 1] + 0.0722 * buf[i * 4 + 2];
  }
  return { data: out, w: bw, h: bh, dpr };
};

const x0 = Number(params.get('x0') ?? 600);
const y0 = Number(params.get('y0') ?? 640);
const x1 = Number(params.get('x1') ?? 900);
const y1 = Number(params.get('y1') ?? 820);

/**
 * A variant changes the material before anything is measured, so a hypothesis
 * about the cause can be tested against the same pixels.
 */
const variant = params.get('variant') ?? '';
if (variant) {
  for (const p of patches) {
    const m = p.material;
    if (variant === 'toneoff') {
      m.toneMapped = false;
    } else if (variant === 'toneon') {
      m.toneMapped = true;
    } else if (variant === 'raw') {
      // Draw the patch opaquely, so the pixels are the patch's own fragment
      // colour: the exact value the multiply would have used.
      m.blending = THREE.NormalBlending;
      m.transparent = false;
      m.premultipliedAlpha = false;
      m.depthTest = false;
      m.needsUpdate = true;
    } else if (variant === 'alpha') {
      const col = p.geometry.getAttribute('color');
      for (let i = 0; i < col.count; i += 1) col.setW(i, Number(params.get('a') ?? 0.5));
      col.needsUpdate = true;
    } else if (variant === 'strength') {
      // The patch's strength is a shader uniform, so it can be swept without
      // rebuilding the geometry.
      const strength = 0.55 * Number(params.get('k') ?? 1);
      for (const p of patches) {
        if (p.material.uniforms?.uStrength) p.material.uniforms.uStrength.value = strength;
      }
    } else if (variant === 'fill') {
      // Every covered pixel changes, so the count of them is the fill.
      for (const p of patches) {
        if (p.material.uniforms?.uStrength) p.material.uniforms.uStrength.value = 1;
        if (p.material.uniforms?.uCore) p.material.uniforms.uCore.value = 0;
      }
    } else if (variant === 'bare') {
      // The patch alone on bare sand.
      //
      // The objects stand on the patches, so where a patch meets a rock the
      // difference between "patch on" and "patch off" steps by the full
      // depth of the shadow at that silhouette — which is the rock's own
      // hard edge, not the patch's. Hiding the objects leaves the patch
      // alone on the sand, and then the steps that remain are the patch's.
      for (const o of scene.children) {
        o.traverse((child) => {
          if (!child.isMesh) return;
          const m = child.material;
          if (!m || m.blending === THREE.MultiplyBlending) return;
          if (m.uniforms?.uStrength) return;
          if (/^Mage_/.test(child.name)) child.visible = false;
          if (child.isInstancedMesh && child.count > 100) child.visible = false;
        });
      }
    } else if (variant === 'spread') {
      // Widen every patch about its own centre: the instance matrices hold
      // the placement, so scaling them is what changes the patch's size.
      const factor = Number(params.get('s') ?? 1);
      for (const p of patches) {
        if (!p.isInstancedMesh) continue;
        const m = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const sc = new THREE.Vector3();
        for (let i = 0; i < p.count; i += 1) {
          p.getMatrixAt(i, m);
          m.decompose(pos, quat, sc);
          sc.multiplyScalar(factor);
          p.setMatrixAt(i, new THREE.Matrix4().compose(pos, quat, sc));
        }
        p.instanceMatrix.needsUpdate = true;
      }
    }
    m.needsUpdate = true;
  }
  await new Promise((r) => setTimeout(r, 400));
}

for (const p of patches) p.visible = false;
const off = readRegion(x0, y0, x1, y1);
for (const p of patches) p.visible = true;
const on = readRegion(x0, y0, x1, y1);

let sum = 0;
let min = Infinity;
let max = -Infinity;
let argmax = 0;
// The README's own metric for this patch: how many pixels it darkens by more
// than four luma, and how much it darkens them by.
let darkened = 0;
let darkSum = 0;
let brightened = 0;
let touched = 0;
let onSum = 0;
let offSum = 0;
for (let i = 0; i < on.data.length; i += 1) {
  const d = on.data[i] - off.data[i];
  sum += d;
  onSum += on.data[i];
  offSum += off.data[i];
  if (d > max) {
    max = d;
    argmax = i;
  }
  if (d < min) min = d;
  if (d <= -4) {
    darkened += 1;
    darkSum += d;
  }
  if (d >= 4) brightened += 1;
  if (Math.abs(d) > 0.2) touched += 1;
}
const mean = sum / on.data.length;

/**
 * How hard is the patch's edge?
 *
 * A patch that fades out has no edge: the difference between it and no patch
 * changes gradually from pixel to pixel. A patch that stops dead has a step,
 * and a step is one pixel wide and large. This is the measure of a hard
 * edge, and it is the thing the tone-mapping bug produced.
 */
const edge = { horizontal: 0, vertical: 0, over2: 0, over4: 0, pixels: 0 };
for (let y = 0; y < on.h - 1; y += 1) {
  for (let x = 0; x < on.w - 1; x += 1) {
    const i = y * on.w + x;
    const dx = Math.abs((on.data[i + 1] - off.data[i + 1]) - (on.data[i] - off.data[i]));
    const dy = Math.abs((on.data[i + on.w] - off.data[i + on.w]) - (on.data[i] - off.data[i]));
    if (dx > edge.horizontal) edge.horizontal = dx;
    if (dy > edge.vertical) edge.vertical = dy;
    const worst = Math.max(dx, dy);
    edge.pixels += 1;
    if (worst > 2) edge.over2 += 1;
    if (worst > 4) edge.over4 += 1;
  }
}

/** A row of luma values, for seeing the shape of an edge. */
const rowProfile = (r, atY) => {
  const by = Math.round((window.innerHeight - atY) * r.dpr) - Math.round((window.innerHeight - y1) * r.dpr);
  const values = [];
  for (let x = 0; x < r.w; x += 1) values.push(+r.data[by * r.w + x].toFixed(1));
  return values;
};

/** The whole region as a coarse grid of mean luma, so a shape can be seen. */
const cell = Number(params.get('cell') ?? 10);
const grid = (r) => {
  const rows = [];
  for (let cy = 0; cy < r.h; cy += cell) {
    const line = [];
    for (let cx = 0; cx < r.w; cx += cell) {
      let sum = 0;
      let n = 0;
      for (let y = cy; y < Math.min(cy + cell, r.h); y += 1) {
        for (let x = cx; x < Math.min(cx + cell, r.w); x += 1) {
          sum += r.data[y * r.w + x];
          n += 1;
        }
      }
      line.push(+(sum / Math.max(1, n)).toFixed(1));
    }
    rows.push(line);
  }
  return rows;
};

const gridOn = grid(on);
const gridOff = grid(off);
const gridDelta = gridOn.map((row, y) =>
  row.map((v, x) => +(v - gridOff[y][x]).toFixed(1)),
);

return {
  patches: patches.length,
  variant: variant || 'as-built',
  region: [x0, y0, x1, y1],
  buffer: [on.w, on.h],
  cell,
  delta: { mean: +mean.toFixed(2), min: +min.toFixed(1), max: +max.toFixed(1) },
  edge: {
    maxHorizontalStep: +edge.horizontal.toFixed(1),
    maxVerticalStep: +edge.vertical.toFixed(1),
    pixelsWithStepOver2: edge.over2,
    pixelsWithStepOver4: edge.over4,
    ofPixels: edge.pixels,
  },
  pixels: {
    total: on.data.length,
    darkenedByMoreThan4: darkened,
    percentOfFrame: +((darkened / on.data.length) * 100).toFixed(2),
    meanDarkeningWhereItApplies: darkened ? +(darkSum / darkened).toFixed(1) : 0,
    brightenedByMoreThan4: brightened,
    pixelsTouched: touched,
    frameMeanOn: +(onSum / on.data.length).toFixed(3),
    frameMeanOff: +(offSum / off.data.length).toFixed(3),
  },
  maxAt: { x: x0 + (argmax % on.w) / on.dpr, y: y1 - Math.floor(argmax / on.w) / on.dpr },
  gridOn,
  gridDelta,
  rowOn: rowProfile(on, Number(params.get('row') ?? 780)),
  rowOff: rowProfile(off, Number(params.get('row') ?? 780)),
};
