/**
 * Measure the frame rate of the running build.
 *
 * The goal asks for the world to look its best *and* for it to be cheap, and
 * this round added a shader patch to seven landmark materials, a per-frame
 * wave update, a clock on the sky dome, two instanced meshes at the low tier
 * and round rails in place of square ones. None of that is free, and the
 * only way to know what it costs is to measure it.
 *
 * The count is taken from the render loop itself rather than from a timer
 * around the page, and the samples are interleaved with a control so that a
 * slow frame cannot be mistaken for a slow build.
 */

const scene = window.__ilm.three.scene;
const params = new URLSearchParams(location.hash.replace(/^#/, ''));
const seconds = Number(params.get('seconds') ?? 3);
const samples = Number(params.get('samples') ?? 3);

const measure = async () => {
  await new Promise((r) => setTimeout(r, 700));
  const t0 = performance.now();
  let frames = 0;
  await new Promise((resolve) => {
    const tick = () => {
      frames += 1;
      if (performance.now() - t0 < seconds * 1000) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  return +(frames / ((performance.now() - t0) / 1000)).toFixed(1);
};

const out = [];
for (let i = 0; i < samples; i += 1) {
  out.push(await measure());
}

const store = await import('/src/game/store.ts');
const canvas = document.querySelector('canvas');
return {
  quality: store.getState().settings.quality,
  pixels: canvas ? `${canvas.width}x${canvas.height}` : null,
  fps: out,
  median: out.slice().sort((a, b) => a - b)[Math.floor(out.length / 2)],
  meshes: (() => {
    let n = 0;
    scene.traverse((o) => {
      if (o.isMesh) n += 1;
    });
    return n;
  })(),
};
