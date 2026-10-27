#!/usr/bin/env node
/**
 * Measure the ambient bed, by rendering it offline and reading the result.
 *
 * The dev server is started because the engines under test are the real
 * modules: the game imports `src/game/audio.ts`, and the probe imports the
 * same file, so a measurement is a measurement of the shipping engine rather
 * than of a re-implementation of it.
 *
 * Usage:
 *   node tools/audio/measure.mjs baseline 200     # the frozen old engine
 *   node tools/audio/measure.mjs live 200          # the shipping engine
 *   node tools/audio/measure.mjs both 200          # the two, side by side
 */

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const which = process.argv[2] ?? 'baseline';
const seconds = Number(process.argv[3] ?? 200);
const port = Number(process.env.ILM_AUDIO_PORT ?? 5199);
const root = process.cwd();

const vite = spawn(join(root, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
vite.stdout.on('data', () => {});
vite.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`));

async function waitForServer() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://localhost:${port}/tools/audio/probe.html`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  throw new Error('the dev server never came up');
}

function runCdp() {
  return new Promise((resolve, reject) => {
    const url = `http://localhost:${port}/tools/audio/probe.html?engine=${which}&seconds=${seconds}`;
    // The probe's own readiness and the document's, together: a module script
    // runs after the document is parsed, and polling for one of the two alone
    // races the other.
    const wait = "document.readyState === 'complete' && !!window.__ilmAudioProbe";
    const child = spawn(
      process.execPath,
      ['tools/cdp.mjs', '--url', url, '--wait', wait, '--run', 'tools/measure/audio-bed.js'],
      { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`cdp exited with ${code}`));
    });
  });
}

try {
  await waitForServer();
  const json = await runCdp();
  process.stdout.write(json);
} finally {
  vite.kill('SIGTERM');
}
