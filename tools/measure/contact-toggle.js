/**
 * Turn the contact shadows off and on, and report what they cover.
 *
 * The measurement wants the *same camera* on both sides of the comparison, so
 * the two frames are taken in one page session with the patch toggled between
 * them rather than in two runs that might not land in the same place.
 */

const params = new URLSearchParams(location.hash.replace(/^#/, ''));
const enabled = params.get('shadows') !== '0';
const THREE = await import('/node_modules/.vite/deps/three.js');

const scene = window.__ilm.three.scene;
const patches = [];
scene.traverse((o) => {
  if (!o.isMesh) return;
  const m = o.material;
  if (!m || m.blending !== THREE.MultiplyBlending) return;
  patches.push(o);
});

for (const patch of patches) patch.visible = enabled;
await new Promise((r) => setTimeout(r, 800));

const store = await import('/src/game/store.ts');
return { enabled, patches: patches.length, quality: store.getState().settings.quality };
