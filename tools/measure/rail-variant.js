/**
 * Try the bridge rails' emissive strength.
 *
 * The rails are the most artificial thing in a bridge frame: a bar of
 * perfectly uniform saturated turquoise, eighty-four units long, with no
 * gradient and no specular. Half its brightness is self-emission, which is
 * added after the lighting and therefore flattens it completely.
 *
 * The variant comes from the URL hash.
 */

const params = new URLSearchParams(location.hash.replace(/^#/, ''));
const emissive = Number(params.get('emissive') ?? 0.5);
const roughness = Number(params.get('roughness') ?? 0.5);

const scene = window.__ilm.three.scene;
const rails = [];
scene.traverse((o) => {
  if (!o.isMesh) return;
  const p = o.geometry?.parameters;
  // The rail is 0.3 wide, 0.6 tall, and as long as the span.
  if (p && Math.abs(p.width - 0.3) < 0.01 && Math.abs(p.height - 0.6) < 0.01 && p.depth > 40) {
    rails.push(o);
  }
});

for (const rail of rails) {
  const material = rail.material;
  material.emissiveIntensity = emissive;
  material.roughness = roughness;
  material.needsUpdate = true;
}
await new Promise((r) => setTimeout(r, 1200));

return {
  emissive,
  roughness,
  rails: rails.length,
  colors: rails.map((r) => '#' + r.material.color.getHexString()),
};
