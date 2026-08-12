#!/usr/bin/env node
// Guard the vendored engine.
//
// three.js is now served from our own origin, which removed a CDN as a single
// point of failure — and introduced a quieter one: vendor/ can drift from
// node_modules, or an import can be added in src/ that was never copied, and
// the failure mode is the entire game refusing to start with a bare 404.
//
//   node tools/check-vendor.mjs

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const VENDOR = join(ROOT, 'vendor/three');
const NM = join(ROOT, 'node_modules/three');

let problems = 0;
const fail = (m) => { console.log('  \x1b[31mx\x1b[0m ' + m); problems++; };
const ok = (m) => console.log('  \x1b[32mok\x1b[0m ' + m);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : (f.endsWith('.js') && out.push(p));
  }
  return out;
}

// 1. Every `three/addons/...` imported anywhere in src/ must exist in vendor/.
const srcFiles = walk(join(ROOT, 'src'));
const needed = new Set();
for (const f of srcFiles) {
  for (const m of readFileSync(f, 'utf8').matchAll(/from\s+['"]three\/addons\/([^'"]+)['"]/g)) {
    needed.add(m[1]);
  }
}
for (const rel of needed) {
  const p = join(VENDOR, 'examples/jsm', rel);
  if (!existsSync(p)) fail(`src imports three/addons/${rel} but vendor/ has no copy — run tools/vendor-three.mjs`);
}
if (![...needed].some(r => !existsSync(join(VENDOR, 'examples/jsm', r)))) {
  ok(`all ${needed.size} imported addons are vendored`);
}

// 2. No vendored file may still reach for a bare 'three' or an http URL.
//
// Match only real import/export statements. A bare `from 'https...'` search
// also hits prose — three's own GLTFLoader has a comment reading "loaded from
// 'https://my-cnd-server.com/...'" — and a checker that cries wolf gets ignored.
const IMPORT_FROM = /^\s*(?:import|export)\b[^\n]*?\bfrom\s+['"]([^'"]+)['"]/gm;
const vfiles = walk(VENDOR);
for (const f of vfiles) {
  const code = readFileSync(f, 'utf8');
  for (const m of code.matchAll(IMPORT_FROM)) {
    const spec = m[1];
    if (spec === 'three') fail(`${f.replace(ROOT + '/', '')} still imports bare 'three'`);
    if (/^https?:/.test(spec)) fail(`${f.replace(ROOT + '/', '')} imports ${spec} over the network`);
  }
  // Dynamic imports too — a lazily-fetched decoder would fail the same way.
  for (const m of code.matchAll(/\bimport\s*\(\s*['"](https?:[^'"]+)['"]/g)) {
    fail(`${f.replace(ROOT + '/', '')} dynamically imports ${m[1]}`);
  }
}
ok(`${vfiles.length} vendored files, none importing bare 'three' or a URL`);

// 3. Every relative import inside vendor/ must resolve to a file that is there.
for (const f of vfiles) {
  const code = readFileSync(f, 'utf8');
  for (const m of code.matchAll(IMPORT_FROM)) {
    if (!m[1].startsWith('.')) continue;
    let dep = resolve(dirname(f), m[1]);
    if (!dep.endsWith('.js')) dep += '.js';
    if (!existsSync(dep)) fail(`${f.replace(ROOT + '/', '')} -> ${m[1]} is missing from vendor/`);
  }
}

// 4. The vendored build must match the installed version.
if (existsSync(NM)) {
  const pkg = JSON.parse(readFileSync(join(NM, 'package.json'), 'utf8'));
  const a = readFileSync(join(NM, 'build/three.module.js'));
  const b = existsSync(join(VENDOR, 'build/three.module.js'))
    ? readFileSync(join(VENDOR, 'build/three.module.js')) : Buffer.alloc(0);
  if (!a.equals(b)) fail(`vendor/three is out of date with node_modules three@${pkg.version} — run tools/vendor-three.mjs`);
  else ok(`vendored build matches node_modules three@${pkg.version}`);
}

// 5. The importmap must point at vendor/, not a CDN.
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const map = (html.match(/<script type="importmap">([\s\S]*?)<\/script>/) || [])[1] || '';
if (/https?:\/\//.test(map)) fail('index.html importmap still points at a CDN');
else if (!/vendor\/three/.test(map)) fail('index.html importmap does not point at vendor/three');
else ok('importmap resolves to vendor/three');

// 6. The server must be willing to serve it.
const srv = readFileSync(join(ROOT, 'server/index.js'), 'utf8');
if (!/SERVE_DIRS[^;]*'vendor'/.test(srv)) fail("server/index.js does not serve 'vendor'");
else ok('server serves vendor/');

console.log(problems ? `\n\x1b[31mFAIL — ${problems} problem(s)\x1b[0m` : '\n\x1b[32mPASS\x1b[0m');
process.exit(problems ? 1 : 0);
