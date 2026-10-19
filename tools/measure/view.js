/**
 * Put the camera somewhere specific and report where it ended up.
 *
 * Driven by `tools/cdp.mjs`, which evaluates this file in the page. The
 * request comes from the URL hash, so a measurement is reproducible by its
 * URL alone:
 *
 *   node tools/cdp.mjs --url "http://localhost:5173/#x=0&z=-76&yaw=0" \
 *        --wait "!!window.__ilm" --run tools/measure/view.js --shot out.png
 *
 * Parameters:
 *   x, z     where to stand, in world units
 *   yaw      camera heading in radians; 0 puts the camera on the +z side of
 *            the player, so the view looks towards -z
 *   quality  'low' | 'medium' | 'high'
 *   unlock   '1' to restore every region first
 */

const params = new URLSearchParams(location.hash.replace(/^#/, ''));
const x = Number(params.get('x') ?? 0);
const z = Number(params.get('z') ?? 0);
const yaw = Number(params.get('yaw') ?? 0);
const quality = params.get('quality');
const unlock = params.get('unlock') === '1';

// The title screen, if it is up. A fresh browser profile has no save, so the
// button is "Yeni Oyun"; with a save it is "Devam Et". Either one puts the
// game into the playing screen, and until it does, the player controller's
// frame loop runs with a zero delta and the camera never moves.
const enter = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const start = [...document.querySelectorAll('button')].find((b) => {
      const t = b.textContent.trim();
      return t === 'Devam Et' || t === 'Yeni Oyun';
    });
    if (start) {
      start.click();
      await new Promise((r) => setTimeout(r, 600));
    }
    const state = (await import('/src/game/store.ts')).getState();
    if (state.screen === 'playing') return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};
const entered = await enter();
if (!entered) throw new Error('the game never reached the playing screen');

const store = await import('/src/game/store.ts');
if (quality) store.updateSettings({ quality });
await new Promise((r) => setTimeout(r, 1800));
store.closeStage();
if (unlock) {
  window.__ilm.unlockAll();
  await new Promise((r) => setTimeout(r, 1200));
}

const input = await import('/src/game/input.ts');

/**
 * Wait until the camera has arrived and stopped moving.
 *
 * A fixed delay is a guess, and the guess is wrong in a headless browser
 * where the frame rate is much lower than on a desktop: the camera spring
 * moves a fraction of the way each frame, so "1.8 seconds" is not "arrived".
 * Reading the camera while it is still travelling measures the old shot —
 * and a teleport can move it two hundred units, so the error is not small.
 *
 * "Arrived" means close to the player: the resting framing is 7.35 units back
 * and 3.35 up, and a camera that had to be pulled in by an obstacle is closer
 * than that, never further. Still means the same position twice in a row,
 * three times over, because one quiet sample only means a frame did not run.
 */
const waitStill = async (maxMs = 25000) => {
  const started = performance.now();
  let last = null;
  let quiet = 0;
  while (performance.now() - started < maxMs) {
    const p = window.__ilm.three.camera.position;
    const player = window.__ilm.player;
    const now = [p.x, p.y, p.z];
    const away = Math.hypot(now[0] - player.x, now[2] - player.z);
    if (last) {
      const moved = Math.hypot(now[0] - last[0], now[1] - last[1], now[2] - last[2]);
      quiet = moved < 0.01 ? quiet + 1 : 0;
      if (quiet >= 3 && away < 10) return true;
    }
    last = now;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};

// Stand there, let the camera spring settle onto the new spot, and only then
// read the heading: reading it any earlier measures where the camera used to
// be.
//
// The teleport has to be retried. Starting a fresh game moves the player to
// the spawn a moment *after* the screen changes, so a single teleport can be
// undone by the start sequence landing late.
for (let attempt = 0; attempt < 6; attempt += 1) {
  window.__ilm.teleport(x, z);
  await waitStill();
  const p = window.__ilm.player;
  if (Math.hypot(p.x - x, p.z - z) < 1.5) break;
  await new Promise((r) => setTimeout(r, 700));
}
await waitStill();
const cam = window.__ilm.three.camera;
const player = window.__ilm.player;
const current = Math.atan2(cam.position.x - player.x, cam.position.z - player.z);
let delta = yaw - current;
while (delta > Math.PI) delta -= Math.PI * 2;
while (delta < -Math.PI) delta += Math.PI * 2;
input.input.addLook(-delta, 0);
await waitStill();
// The heading is read from the camera's own offset, so a camera that had to
// be pulled in by an obstacle still reports where it is actually looking.
const settled = window.__ilm.three.camera;
const settledPlayer = window.__ilm.player;
const heading = Math.atan2(
  settled.position.x - settledPlayer.x,
  settled.position.z - settledPlayer.z,
);

const end = window.__ilm.three.camera;
const endPlayer = window.__ilm.player;
return {
  player: [+endPlayer.x.toFixed(2), +endPlayer.y.toFixed(2), +endPlayer.z.toFixed(2)],
  camera: end.position.toArray().map((v) => +v.toFixed(2)),
  heading: +heading.toFixed(3),
  far: end.far,
  quality: store.getState().settings.quality,
};
