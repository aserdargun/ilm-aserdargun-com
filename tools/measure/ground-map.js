/**
 * Map what the camera actually sees on the ground, by raycasting.
 *
 * A pale square on the sand has several possible owners — the contact patch,
 * a leftover plate, the model's own base — and a screenshot cannot tell them
 * apart. A raycast can: it names the mesh and gives the world point it hit.
 * This prints the ground under the player as a character map, so the shape of
 * the artefact and its owner are read from the same image.
 */

const params = new URLSearchParams(location.hash.replace(/^#/, ''));
const THREE = await import('/node_modules/.vite/deps/three.js');

const scene = window.__ilm.three.scene;
const camera = window.__ilm.three.camera;

// The area to map: screen pixels, x from `x0` to `x1`, y from `y0` to `y1`.
const x0 = Number(params.get('x0') ?? 640);
const x1 = Number(params.get('x1') ?? 960);
const y0 = Number(params.get('y0') ?? 620);
const y1 = Number(params.get('y1') ?? 860);
const step = Number(params.get('step') ?? 16);

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hits = [];

const width = window.innerWidth;
const height = window.innerHeight;

for (let y = y0; y <= y1; y += step) {
  let row = '';
  for (let x = x0; x <= x1; x += step) {
    ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(scene.children, true)[0];
    if (!hit) {
      row += ' ';
      continue;
    }
    const m = Array.isArray(hit.object.material) ? hit.object.material[0] : hit.object.material;
    const key = m?.type === 'MeshBasicMaterial' ? 'B' : hit.object.name?.slice(0, 1) ?? '.';
    row += key;
  }
  hits.push({ y, row });
}

return {
  viewport: [width, height],
  legend: 'B = MeshBasicMaterial, otherwise the first character of the mesh name',
  hits,
};
