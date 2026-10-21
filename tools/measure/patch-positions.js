/**
 * Where the contact patches are on screen.
 *
 * The patches are instanced, so their positions live in the instance matrix
 * array rather than in the scene graph. Projecting them says which patch is
 * where, which is what makes a patch measurable: a patch can be sampled by
 * its own centre instead of by hunting for it in a picture.
 */

const THREE = await import('/node_modules/.vite/deps/three.js');
const scene = window.__ilm.three.scene;
const camera = window.__ilm.three.camera;

const out = [];
for (const o of scene.children) {
  o.traverse((child) => {
    if (!child.isInstancedMesh) return;
    const m = child.material;
    if (!m?.uniforms?.uStrength) return;
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    for (let i = 0; i < child.count; i += 1) {
      child.getMatrixAt(i, matrix);
      matrix.decompose(pos, quat, sc);
      const world = pos.clone();
      const screen = world.clone().project(camera);
      out.push({
        i,
        world: world.toArray().map((v) => +v.toFixed(2)),
        scale: +sc.x.toFixed(3),
        screen: [
          Math.round(((screen.x + 1) / 2) * window.innerWidth),
          Math.round(((1 - screen.y) / 2) * window.innerHeight),
        ],
        visible: screen.z < 1 && Math.abs(screen.x) < 1 && Math.abs(screen.y) < 1,
      });
    }
  });
}

const onScreen = out.filter((p) => p.visible);
return { total: out.length, onScreen: onScreen.length, first: onScreen.slice(0, 40) };
