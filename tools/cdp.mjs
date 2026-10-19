#!/usr/bin/env node
/**
 * Drive a headless Chrome over the DevTools protocol, with no dependencies.
 *
 * Why this exists: the project's whole measurement workflow is "run the real
 * game, put the camera somewhere specific, read the pixels", and the only
 * tools that could do that were an MCP browser that cannot execute
 * JavaScript. The dev-only `__ilm` hooks in `Scene.tsx` are what make a
 * repeatable measurement possible at all — they teleport the player, settle
 * the camera and report the camera's world position — and none of that is
 * reachable by clicking.
 *
 * Node 22 has a global `WebSocket`, so the whole thing is the standard
 * library: launch Chrome with a debugging port, find the page target, and
 * speak CDP to it.
 *
 * Usage:
 *   node tools/cdp.mjs --url http://localhost:5173/ \
 *        --wait "!!window.__ilm" \
 *        --run tools/measure/mirrors.js \
 *        --shot .shots/mirrors.png --size 1600x1000
 *
 * Flags:
 *   --url    page to open
 *   --wait   JS expression polled until it is truthy (the page's own readiness)
 *   --run    JS file evaluated in the page; its last expression is returned
 *   --shot   path to write a PNG screenshot of the viewport
 *   --size   viewport size, WIDTHxHEIGHT (default 1600x1000)
 *   --headful run with a visible window instead of headless
 *   --keep   leave Chrome running after the script finishes
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function parseArgs(argv) {
  const out = { size: '1600x1000' };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith('--')) continue;
    const key = flag.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      out[key] = true;
    } else {
      // `--run` may be repeated; the others are single-valued.
      if (key === 'run') {
        out.run = out.run === true ? [] : [].concat(out.run ?? []);
        out.run.push(value);
      } else {
        out[key] = value;
      }
      i += 1;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.url) {
  console.error('usage: node tools/cdp.mjs --url <url> [--wait <expr>] [--run <file>] [--shot <path>]');
  process.exit(2);
}

const [width, height] = String(args.size).split('x').map(Number);
const port = 9200 + Math.floor(process.pid % 300);
const profile = mkdtempSync(join(tmpdir(), 'ilm-cdp-'));

const chromeArgs = [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--window-size=${width},${height}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--hide-scrollbars',
  '--mute-audio',
  // Software GL, so the frame is deterministic and the page does not need a
  // real GPU to produce pixels. Slow, but this is a measurement tool.
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  'about:blank',
];
if (!args.headful) chromeArgs.unshift('--headless=new');

const chrome = spawn(CHROME, chromeArgs, { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* Chrome is not listening yet */
    }
    await sleep(250);
  }
  throw new Error('no CDP target appeared');
}

/** A minimal CDP client: one socket, ids, and a promise per command. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        this.pending.delete(message.id);
        if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
        else entry.resolve(message.result);
      } else {
        this.events.push(message);
      }
    });
  }

  send(method, params = {}) {
    this.id += 1;
    const id = this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, awaitPromise = true) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ??
          JSON.stringify(result.exceptionDetails),
      );
    }
    return result.result?.value;
  }
}

async function main() {
  const wsUrl = await findTarget();
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const cdp = new Cdp(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  // Console and page errors are collected and printed at the end. A shader
  // that does not compile says nothing on screen — the mesh simply is not
  // drawn — and the only evidence is a line in the console. Reading it once,
  // at the start, is not enough: it has to be read after every change.
  cdp.events.length = 0;
  const drainConsole = () => {
    const lines = [];
    for (const event of cdp.events) {
      if (event.method === 'Runtime.consoleAPICalled') {
        const type = event.params.type;
        if (type !== 'error' && type !== 'warning' && type !== 'assert') continue;
        const text = (event.params.args ?? [])
          .map((a) => a.value ?? a.description ?? a.type)
          .join(' ');
        lines.push(`[console.${type}] ${text}`);
      } else if (event.method === 'Runtime.exceptionThrown') {
        const d = event.params.exceptionDetails;
        lines.push(`[exception] ${d.exception?.description ?? d.text}`);
      } else if (event.method === 'Log.entryAdded') {
        const e = event.params.entry;
        if (e.level !== 'error' && e.level !== 'warning') continue;
        lines.push(`[log.${e.level}] ${e.text}`);
      }
    }
    return lines;
  };

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send('Page.navigate', { url: args.url });

  if (args.wait) {
    const deadline = Date.now() + 120000;
    for (;;) {
      let ok = false;
      try {
        ok = await cdp.evaluate(`(() => { try { return !!(${args.wait}); } catch (e) { return false; } })()`);
      } catch {
        ok = false;
      }
      if (ok) break;
      if (Date.now() > deadline) throw new Error(`wait expression never became true: ${args.wait}`);
      await sleep(300);
    }
  }

  if (args.run) {
    // `--run` may be given more than once: the scripts run in order, in the
    // same page, so a second one can act on what the first one set up.
    const files = Array.isArray(args.run) ? args.run : [args.run];
    let value;
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      value = await cdp.evaluate(`(async () => { ${source} })()`);
    }
    if (value !== undefined) console.log(JSON.stringify(value, null, 2));
  }

  if (args.shot) {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(args.shot, Buffer.from(shot.data, 'base64'));
    console.error(`screenshot: ${args.shot}`);
  }

  const console_ = drainConsole();
  if (console_.length) {
    console.error('--- console ---');
    for (const line of console_) console.error(line);
  } else {
    console.error('--- console: clean ---');
  }

  ws.close();
}

main()
  .then(() => {
    if (!args.keep) chrome.kill('SIGTERM');
    process.exit(0);
  })
  .catch((error) => {
    console.error('cdp:', error.message);
    if (!args.keep) chrome.kill('SIGTERM');
    process.exit(1);
  });
