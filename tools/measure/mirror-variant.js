/**
 * Try the mirror material's variants in place, and report what changed.
 *
 * The Observer's Mirrors' panels are a `glass` material: base colour
 * (0.55, 0.80, 0.84) at 42% alpha, metallic 0.1, roughness 0.12. A
 * dielectric with a smooth surface has almost no diffuse response and a
 * narrow specular lobe, so under a night sky it renders as a black
 * rectangle — the panels were the darkest thing in the frame by a wide
 * margin, and the whole island's identity is those panels.
 *
 * A mirror has to be a metal: with metalness 1 the colour *is* the
 * reflection.
 *
 * Variants, from the URL hash:
 *   #variant=control   leave the material alone
 *   #variant=metal     metalness 1, alpha untouched
 *   #variant=opaque    metalness 1, alpha 1
 */

const params = new URLSearchParams(location.hash.replace(/^#/, ''));
const variant = params.get('variant') ?? 'control';

const scene = window.__ilm.three.scene;

/** Is this mesh part of the Observer's Mirrors? */
const isMirror = (o) => {
  let node = o;
  for (let depth = 0; node && depth < 6; depth += 1) {
    if ((node.name || '') === 'observer_mirrors') return true;
    node = node.parent;
  }
  return false;
};

const found = [];
scene.traverse((o) => {
  if (!o.isMesh) return;
  if (!isMirror(o)) return;
  const m = o.material;
  if (m.name !== 'glass') return;
  found.push(m);
});

if (variant !== 'control') {
  for (const m of found) {
    if (variant === 'mark') {
      // Which pixels are the glass at all? A dielectric that renders black
      // looks exactly like a frame that renders black.
      m.emissive.set('#ff0000');
      m.emissiveIntensity = 4;
      m.needsUpdate = true;
      continue;
    }
    m.metalness = 1;
    m.roughness = 0.12;
    if (variant === 'opaque') {
      m.transparent = false;
      m.opacity = 1;
    }
    m.needsUpdate = true;
  }
}
await new Promise((r) => setTimeout(r, 1200));

return {
  variant,
  glassMaterials: found.length,
  metalness: found.map((m) => m.metalness),
  opacity: found.map((m) => m.opacity),
  transparent: found.map((m) => m.transparent),
};
