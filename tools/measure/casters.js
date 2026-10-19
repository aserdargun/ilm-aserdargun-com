/**
 * List every shadow caster in the scene, with its world bounds.
 *
 * A hard band on the sand is a shadow, and a shadow is a mesh with
 * `castShadow` set — so the question is not "what is in the frame" but "what
 * is casting". The README's note about the tapestry dropping a band across
 * the hub is a claim about casters, and claims about casters are settled by
 * listing the casters.
 */

const scene = window.__ilm.three.scene;
const casters = [];

scene.traverse((o) => {
  if (!o.isMesh || !o.castShadow) return;
  o.updateWorldMatrix(true, false);
  const geometry = o.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const e = o.matrixWorld.elements;
  const sx = Math.hypot(e[0], e[1], e[2]);
  const sy = Math.hypot(e[4], e[5], e[6]);
  const sz = Math.hypot(e[8], e[9], e[10]);
  const min = [box.min.x * sx, box.min.y * sy, box.min.z * sz];
  const max = [box.max.x * sx, box.max.y * sy, box.max.z * sz];
  casters.push({
    name: o.name || '(unnamed)',
    parent: o.parent?.name || '(unnamed)',
    material: o.material?.name || o.material?.type,
    origin: [e[12], e[13], e[14]].map((v) => +v.toFixed(1)),
    localBounds: [min, max].map((v) => v.map((n) => +n.toFixed(1))),
    worldSpanX: +(max[0] - min[0]).toFixed(1),
  });
});

// Only the ones near the world origin, which is the hub.
const near = casters
  .filter((c) => Math.hypot(c.origin[0], c.origin[2]) < 45)
  .sort((a, b) => b.worldSpanX - a.worldSpanX);
return { count: casters.length, nearHub: near.slice(0, 10) };
