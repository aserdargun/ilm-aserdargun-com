/**
 * Measure the frame rate with the contact patches on and off, in one session.
 *
 * The cost has to be measured on the tier that draws them — the low tier, which
 * has no shadow map and no post-processing — and the two sides of the
 * comparison have to be the same page, because two runs can land the camera
 * in different places and the difference would then be the scene rather than
 * the patches.
 */

const THREE = await import('/node_modules/.vite/deps/three.js');

const scene = window.__ilm.three.scene;
const patches = [];
scene.traverse((o) => {
  if (!o.isMesh) return;
  const m = o.material;
  if (!m || m.blending !== THREE.MultiplyBlending) return;
  patches.push(o);
});

const measure = async () => {
  await new Promise((r) => setTimeout(r, 700));
  const t0 = performance.now();
  let frames = 0;
  await new Promise((resolve) => {
    const tick = () => {
      frames += 1;
      if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  return +(frames / ((performance.now() - t0) / 1000)).toFixed(1);
};

const out = [];
for (let i = 0; i < 3; i += 1) {
  for (const patch of patches) patch.visible = false;
  out.push({ patches: 'off', fps: await measure() });
  for (const patch of patches) patch.visible = true;
  out.push({ patches: 'on', fps: await measure() });
}

const store = await import('/src/game/store.ts');
return { patchCount: patches.length, quality: store.getState().settings.quality, out };
