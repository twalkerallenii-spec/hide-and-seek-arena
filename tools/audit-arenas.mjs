#!/usr/bin/env node
// Cross-arena consistency audit. The twelve arenas were authored independently,
// so this checks the things that only go wrong *between* them: duplicated ids,
// registry drift, colliding spawn conventions, and API misuse that the
// per-arena validator would happily accept in isolation.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIR = join(ROOT, 'src/arenas');

const files = (await readdir(DIR)).filter(f => /^a\d\d_/.test(f)).sort();
const registry = await readFile(join(DIR, 'index.js'), 'utf8');

let problems = 0, warnings = 0;
const fail = (m) => { console.log('  \x1b[31mx\x1b[0m ' + m); problems++; };
const warn = (m) => { console.log('  \x1b[33m!\x1b[0m ' + m); warnings++; };

const seenIds = new Map(), seenOrders = new Map(), seenNames = new Map();

console.log(`auditing ${files.length} arena modules\n`);

/** Blank out comments and string bodies so scans don't trip on prose. */
function stripNoise(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length))
    .replace(/`(?:\\.|[^`\\])*`/g, m => "''" + ' '.repeat(Math.max(0, m.length - 2)));
}

for (const f of files) {
  const raw = await readFile(join(DIR, f), 'utf8');
  const src = stripNoise(raw);

  // Parse the real meta block, not the first `id:` that happens to appear.
  const mStart = src.search(/export\s+const\s+meta\s*=\s*\{/);
  const head = mStart >= 0 ? src.slice(mStart, mStart + 2500) : src.slice(0, 2500);

  const pick = (k) => {
    const m = head.match(new RegExp(`\\b${k}\\s*:\\s*(?:'([^']*)'|"([^"]*)"|([\\d.]+))`));
    return m ? (m[1] ?? m[2] ?? m[3]) : null;
  };
  const id = pick('id'), name = pick('name'), order = pick('order');

  console.log(`\x1b[1m${f}\x1b[0m  ${(id || '?').padEnd(11)} ${name || ''}`);

  if (!id) { fail(`${f}: could not find meta.id`); continue; }
  if (seenIds.has(id)) fail(`duplicate arena id "${id}" in ${f} and ${seenIds.get(id)}`);
  seenIds.set(id, f);
  if (order) {
    if (seenOrders.has(order)) fail(`duplicate meta.order ${order} in ${f} and ${seenOrders.get(order)}`);
    seenOrders.set(order, f);
  }
  if (name) {
    if (seenNames.has(name)) warn(`duplicate arena name "${name}"`);
    seenNames.set(name, f);
  }

  // registry wiring
  if (!registry.includes(`'${id}'`)) fail(`"${id}" is not in the arena registry`);
  if (!registry.includes(f)) fail(`${f} is not referenced by the registry loader table`);

  // the registry's menu metadata must match the module's own
  const rx = new RegExp(`${id}:\\s*\\{[\\s\\S]{0,400}?name:\\s*'([^']+)'`);
  const rm = registry.match(rx);
  if (rm && name && rm[1] !== name) {
    warn(`menu card says "${rm[1]}" but the module's meta.name is "${name}"`);
  }

  // determinism
  const rnd = [...src.matchAll(/Math\.random\s*\(/g)].length;
  if (rnd) fail(`${rnd} call(s) to Math.random() — worlds must be deterministic`);
  const dates = [...src.matchAll(/\bDate\.now\s*\(|\bnew Date\s*\(/g)].length;
  if (dates) warn(`${dates} use(s) of Date — arena state should come from the dt/elapsed args`);

  // imports: only three, everything else via ctx
  const imports = [...raw.matchAll(/^\s*import\s+.*?from\s+['"]([^'"]+)['"]/gm)].map(m => m[1]);
  for (const spec of imports) {
    if (spec !== 'three' && !spec.startsWith('three/addons/')) {
      fail(`imports "${spec}" — arenas may only import three`);
    }
  }
  if (!imports.length) warn('imports nothing — expected `import * as THREE from "three"`');

  // exports
  if (!/export\s+(const|let|var)\s+meta\b/.test(src)) fail('no `export const meta`');
  if (!/export\s+(async\s+)?function\s+build\b/.test(src)) fail('no `export function build`');

  // DOM access from an arena is always a mistake
  if (/\bdocument\.(getElementById|querySelector|body)\b/.test(src)) {
    fail('touches the DOM — arenas must not');
  }
  // network access likewise
  if (/\bfetch\s*\(|XMLHttpRequest|new\s+Image\s*\(/.test(src)) {
    fail('performs I/O — arenas must generate, not download');
  }
  // localStorage from an arena would corrupt the save
  if (/localStorage/.test(src)) fail('touches localStorage');

  // size signal
  const lines = raw.split('\n').length;
  if (lines < 350) warn(`only ${lines} lines — likely thin for a full arena`);
}

// registry entries with no module
for (const m of registry.matchAll(/\{\s*id:\s*'([^']+)',\s*path:/g)) {
  if (!seenIds.has(m[1])) fail(`registry lists "${m[1]}" but no module defines it`);
}

console.log('');
console.log(problems
  ? `\x1b[31mFAIL — ${problems} problem(s), ${warnings} warning(s)\x1b[0m`
  : `\x1b[32mPASS — ${files.length} arenas consistent (${warnings} warning(s))\x1b[0m`);
process.exit(problems ? 1 : 0);
