/**
 * Report the materials of a region's landmark and their light.
 *
 * "The restoration glow did nothing" has two possible causes — the painter
 * never ran, or it ran on the wrong material — and the difference is one
 * query.
 */

const scene = window.__ilm.three.scene;
const store = await import('/src/game/store.ts');

const wanted = new URLSearchParams(location.hash.replace(/^#/, '')).get('region');
const out = [];

scene.traverse((o) => {
  if (!o.isMesh) return;
  // The landmark's meshes live under a group named after the model.
  let node = o;
  let named = false;
  for (let depth = 0; node && depth < 6; depth += 1) {
    if ((node.name || '') === wanted) named = true;
    node = node.parent;
  }
  if (!named) return;
  const m = o.material;
  out.push({
    mesh: o.name || '(unnamed)',
    material: m?.name,
    color: m?.color ? '#' + m.color.getHexString() : null,
    emissive: m?.emissive ? '#' + m.emissive.getHexString() : null,
    emissiveIntensity: m?.emissiveIntensity,
  });
});

return {
  region: wanted,
  completedRegions: store.getState().progression.completedRegions,
  meshes: out,
};
