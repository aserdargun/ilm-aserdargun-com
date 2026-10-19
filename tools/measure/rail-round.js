/**
 * Try a round rail instead of a square one.
 *
 * The rail is a 0.3 × 0.6 box running the length of the span, and the player
 * sees it edge-on: the 0.3-unit top face is a couple of pixels at any
 * distance, so almost the whole of what is on screen is one flat side face,
 * evenly lit, evenly saturated. That is why it reads as a painted stripe
 * however the light is set.
 *
 * A cylinder of the same width shades across its own width, so the light
 * falls off towards the edges and the bar reads as a tube.
 */

const params = new URLSearchParams(location.hash.replace(/^#/, ''));
const round = params.get('round') === '1';
const sides = Number(params.get('sides') ?? 8);
const radius = Number(params.get('radius') ?? 0.16);

const THREE = await import('/node_modules/.vite/deps/three.js');
const scene = window.__ilm.three.scene;

let changed = 0;
if (round) {
  const capToo = params.get('cap') === '1';
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry?.parameters;
    if (!p || !p.depth || p.depth < 40) return;
    // The rail is 0.3 wide and 0.6 tall; the copper cap on top of it is
    // 0.16 wide and 0.7 tall.
    const isRail = Math.abs(p.width - 0.3) < 0.01 && Math.abs(p.height - 0.6) < 0.01;
    const isCap = capToo && Math.abs(p.width - 0.16) < 0.01 && Math.abs(p.height - 0.7) < 0.01;
    if (!isRail && !isCap) return;
    const r = isRail ? radius : radius * 0.55;
    const geometry = new THREE.CylinderGeometry(r, r, p.depth, sides, 1, false);
    // The cylinder is built along y; the rail runs along z.
    geometry.rotateX(Math.PI / 2);
    o.geometry.dispose();
    o.geometry = geometry;
    changed += 1;
  });
}
await new Promise((r) => setTimeout(r, 1200));

return { round, cap: params.get('cap') === '1', sides, radius, changed };
