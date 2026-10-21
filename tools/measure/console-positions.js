/**
 * Where the landmarks are, in world units.
 *
 * The stage positions are derived in code and never handed to the scene as a
 * list, so the consoles in the scene are the record of where they are. This
 * reads them off, so a sweep can be aimed at them without guessing.
 */

const THREE = await import('/node_modules/.vite/deps/three.js');
const scene = window.__ilm.three.scene;

const found = [];
const seen = new Set();
scene.traverse((o) => {
  if (!o.isObject3D) return;
  if (o.name !== 'console') return;
  const world = new THREE.Vector3();
  o.getWorldPosition(world);
  const key = `${world.x.toFixed(1)},${world.z.toFixed(1)}`;
  if (seen.has(key)) return;
  seen.add(key);
  found.push({
    world: [+world.x.toFixed(2), +world.y.toFixed(2), +world.z.toFixed(2)],
    children: o.children.map((c) => c.name).filter(Boolean),
  });
});

found.sort((a, b) => a.world[0] - b.world[0]);
return { count: found.length, found };
