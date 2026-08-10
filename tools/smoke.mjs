#!/usr/bin/env node
// Headless arena QA.
//
//   node tools/smoke.mjs             validate every arena
//   node tools/smoke.mjs backrooms   validate one (comma-separate for several)
//   node tools/smoke.mjs --shots     also screenshot the menu + each arena
//
// Serves the repo, drives Chromium with software WebGL, and parses the JSON the
// harness page leaves in the DOM.

import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '../..'));
const PORT = 8137;
const CHROME = process.env.CHROME || 'chromium';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.md': 'text/markdown',
};

function serve() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = normalize(join(ROOT, p));
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });
  return new Promise(r => server.listen(PORT, '127.0.0.1', () => r(server)));
}

function run(cmd, args, { timeout = 300000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    const t = setTimeout(() => { p.kill('SIGKILL'); resolve({ out, err, timedOut: true }); }, timeout);
    p.on('close', (code) => { clearTimeout(t); resolve({ out, err, code, timedOut: false }); });
  });
}

const CHROME_FLAGS = [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-setuid-sandbox',
  '--use-angle=swiftshader',
  '--use-gl=angle',
  '--enable-unsafe-swiftshader',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--hide-scrollbars',
  '--mute-audio',
  '--no-first-run',
  '--disable-extensions',
];

async function dumpDom(url, budgetMs) {
  const { out, err, timedOut } = await run(CHROME, [
    ...CHROME_FLAGS,
    `--virtual-time-budget=${budgetMs}`,
    '--window-size=1280,720',
    '--dump-dom',
    url,
  ], { timeout: budgetMs + 180000 });
  return { out, err, timedOut };
}

async function screenshot(url, file, budgetMs = 20000, size = '1600,900') {
  await run(CHROME, [
    ...CHROME_FLAGS,
    `--virtual-time-budget=${budgetMs}`,
    `--window-size=${size}`,
    `--screenshot=${file}`,
    url,
  ], { timeout: budgetMs + 180000 });
}

function extractJSON(dom) {
  // The harness writes JSON into <pre id="out">.
  const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  if (!m) return null;
  const text = m[1]
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 800) }; }
}

const C = {
  g: s => `\x1b[32m${s}\x1b[0m`, r: s => `\x1b[31m${s}\x1b[0m`,
  y: s => `\x1b[33m${s}\x1b[0m`, d: s => `\x1b[90m${s}\x1b[0m`,
  b: s => `\x1b[1m${s}\x1b[0m`,
};

(async () => {
  const args = process.argv.slice(2);
  const wantShots = args.includes('--shots');
  const which = args.filter(a => !a.startsWith('--'))[0] || 'all';

  const server = await serve();
  console.log(C.d(`serving ${ROOT} on :${PORT}`));

  const budget = which === 'all' ? 240000 : 60000;
  console.log(C.d(`launching chromium (budget ${budget / 1000}s)…`));
  const { out, err, timedOut } = await dumpDom(
    `http://127.0.0.1:${PORT}/tools/harness.html?arena=${which}`, budget);

  const data = extractJSON(out);

  if (!data) {
    console.log(C.r('\nNo harness output. Chromium stderr tail:'));
    console.log(C.d(err.split('\n').filter(l => l.trim()).slice(-25).join('\n')));
    if (timedOut) console.log(C.r('(chromium timed out)'));
    server.close();
    process.exit(2);
  }
  if (data.fatal) {
    console.log(C.r('FATAL: ' + data.fatal));
    server.close();
    process.exit(2);
  }
  if (data.raw) {
    console.log(C.y('harness still running when the page was dumped:'));
    console.log(C.d(data.raw));
    server.close();
    process.exit(2);
  }

  console.log('');
  let failed = 0;
  for (const r of data.results) {
    const head = r.ok ? C.g('PASS') : C.r('FAIL');
    if (!r.ok) failed++;
    const s = r.scene || {};
    console.log(`${head} ${C.b((r.id || '?').padEnd(12))} ${(r.name || '').padEnd(18)} ` +
      C.d(`${String(r.buildMs ?? '?').padStart(5)}ms  ` +
        `${String(s.meshes ?? '?').padStart(5)} mesh  ` +
        `${((s.tris ?? 0) / 1000).toFixed(0).padStart(6)}k tri  ` +
        `${String(r.drawCalls ?? '?').padStart(4)} draws  ` +
        `${String(s.lights ?? '?').padStart(3)}L/${s.shadowLights ?? '?'}S  ` +
        `${String(r.collisionMeshes ?? '?').padStart(5)} col`));
    if (r.pickups) {
      console.log(C.d(`     ${r.pickups.coins} coins · ${r.pickups.batteries} batt · ` +
        `${r.pickups.powerups} power · ${r.pickups.pups} pup · ${r.hidingSpots} hides · ` +
        `landed:${r.landedAfter} y=${r.spawnRestY}`));
    }
    for (const e of r.errors || []) console.log('     ' + C.r('✗ ' + e));
    for (const w of r.warnings || []) console.log('     ' + C.y('! ' + w));
  }

  console.log('');
  console.log(C.b(`${data.pass} passed, ${data.fail} failed`));

  if (wantShots) {
    const dir = join(ROOT, 'shots');
    await mkdir(dir, { recursive: true });
    console.log(C.d('\ncapturing screenshots…'));
    await screenshot(`http://127.0.0.1:${PORT}/`, join(dir, 'menu.png'), 24000);
    console.log(C.d('  menu.png'));
    for (const r of data.results) {
      const f = join(dir, `${r.id}.png`);
      await screenshot(
        `http://127.0.0.1:${PORT}/tools/harness.html?arena=${r.id}`, f, 45000, '1600,900');
      console.log(C.d(`  ${r.id}.png`));
    }
  }

  await writeFile(join(ROOT, 'tools', 'last-smoke.json'), JSON.stringify(data, null, 2));
  server.close();
  process.exit(failed ? 1 : 0);
})();
