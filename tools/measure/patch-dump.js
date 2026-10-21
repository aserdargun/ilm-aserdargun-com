/**
 * Dump the contact patch itself: its geometry colours, its material, and the
 * shader defines it was compiled with.
 *
 * The patch was measured darkening the ground by about fifteen luma in a hard
 * rectangle, while the code says it should be a soft pool taking the centre
 * down to forty-five per cent. One of those two is wrong, and the picture
 * cannot say which. This says it.
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

const describe = (mesh) => {
  const geo = mesh.geometry;
  const col = geo.getAttribute('color');
  const pos = geo.getAttribute('position');
  let lo = Infinity;
  let hi = -Infinity;
  let alphaLo = Infinity;
  let alphaHi = -Infinity;
  const samples = [];
  for (let i = 0; i < col.count; i += 1) {
    lo = Math.min(lo, col.getX(i));
    hi = Math.max(hi, col.getX(i));
    alphaLo = Math.min(alphaLo, col.getW(i));
    alphaHi = Math.max(alphaHi, col.getW(i));
    if (i < 4) {
      samples.push({
        pos: [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => +v.toFixed(3)),
        rgb: [col.getX(i), col.getY(i), col.getZ(i)].map((v) => +v.toFixed(3)),
        a: +col.getW(i).toFixed(3),
      });
    }
  }
  const m = mesh.material;
  const world = new THREE.Vector3();
  mesh.getWorldPosition(world);
  return {
    isInstanced: !!mesh.isInstancedMesh,
    count: mesh.count ?? null,
    itemSize: col.itemSize,
    colorRange: [+lo.toFixed(3), +hi.toFixed(3)],
    alphaRange: [+alphaLo.toFixed(3), +alphaHi.toFixed(3)],
    samples,
    material: {
      type: m.type,
      color: `#${m.color.getHexString()}`,
      opacity: m.opacity,
      transparent: m.transparent,
      vertexColors: m.vertexColors,
      premultipliedAlpha: m.premultipliedAlpha,
      blending: m.blending,
      depthWrite: m.depthWrite,
      depthTest: m.depthTest,
      side: m.side,
      toneMapped: m.toneMapped,
    },
    scale: mesh.scale.toArray(),
    world: world.toArray().map((v) => +v.toFixed(3)),
    renderOrder: mesh.renderOrder,
    visible: mesh.visible,
  };
};

return { count: patches.length, patches: patches.map(describe) };
