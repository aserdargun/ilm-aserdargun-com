/**
 * List every mesh within a few units of the player, with enough of its
 * material and geometry to identify it.
 *
 * The point is to identify an artefact by *what it is made of* rather than by
 * guessing from a screenshot: a pale square on the ground under the Weaver is
 * either the contact patch, a leftover plate, or something the model itself
 * carries, and those three look identical in a picture.
 */

const params = new URLSearchParams(location.hash.replace(/^#/, ''));
const radius = Number(params.get('radius') ?? 6);
const THREE = await import('/node_modules/.vite/deps/three.js');

const scene = window.__ilm.three.scene;
const player = window.__ilm.player;
const origin = new THREE.Vector3(player.x, player.y, player.z);

const found = [];
scene.traverse((o) => {
  if (!o.isMesh) return;
  const world = new THREE.Vector3();
  o.getWorldPosition(world);
  const distance = world.distanceTo(origin);
  if (distance > radius) return;
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  const geo = o.geometry;
  found.push({
    name: o.name || '(isimsiz)',
    parent: o.parent?.name || '(isimsiz)',
    type: o.type,
    visible: o.visible,
    distance: +distance.toFixed(2),
    world: world.toArray().map((v) => +v.toFixed(3)),
    geometry: geo?.type ?? null,
    material: m?.type ?? null,
    blending: m?.blending ?? null,
    transparent: m?.transparent ?? null,
    opacity: m?.opacity ?? null,
    depthWrite: m?.depthWrite ?? null,
    color: m?.color ? `#${m.color.getHexString()}` : null,
    vertexColors: m?.vertexColors ?? null,
    renderOrder: o.renderOrder,
    castShadow: o.castShadow,
    receiveShadow: o.receiveShadow,
  });
});

found.sort((a, b) => a.distance - b.distance);
return { player: [player.x, player.y, player.z], count: found.length, found };
