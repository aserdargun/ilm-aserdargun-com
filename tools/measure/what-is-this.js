/**
 * What is at a given pixel?
 *
 * A raycast from the camera through the screen point, naming the mesh and the
 * material it hits. The question "what is that turquoise column" is not
 * answerable by looking at it, and it is not worth a guess either.
 */

const params = new URLSearchParams(location.hash.replace(/^#/, ''));
const THREE = await import('/node_modules/.vite/deps/three.js');
const scene = window.__ilm.three.scene;
const camera = window.__ilm.three.camera;

const x = Number(params.get('px') ?? 800);
const y = Number(params.get('py') ?? 400);

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2(
  (x / window.innerWidth) * 2 - 1,
  -(y / window.innerHeight) * 2 + 1,
);
raycaster.setFromCamera(ndc, camera);
const hits = raycaster.intersectObjects(scene.children, true).slice(0, 4);

return {
  pixel: [x, y],
  hits: hits.map((h) => {
    const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material;
    return {
      name: h.object.name || '(isimsiz)',
      parent: h.object.parent?.name || '(isimsiz)',
      distance: +h.distance.toFixed(2),
      point: h.point.toArray().map((v) => +v.toFixed(2)),
      material: m?.name || '(isimsiz)',
      type: m?.type,
      color: m?.color ? `#${m.color.getHexString()}` : null,
      roughness: m?.roughness ?? null,
      metalness: m?.metalness ?? null,
      emissive: m?.emissive ? `#${m.emissive.getHexString()}` : null,
      emissiveIntensity: m?.emissiveIntensity ?? null,
      transparent: m?.transparent ?? null,
      opacity: m?.opacity ?? null,
    };
  }),
};
