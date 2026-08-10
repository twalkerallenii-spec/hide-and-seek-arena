#!/usr/bin/env node
// Static wiring check: every id the JS looks up must exist in index.html, and
// every CSS class the JS toggles should be defined in the stylesheet.
// A single typo here is a blank screen on boot, so it is worth a gate.

import { readFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}

const html = await readFile(join(ROOT, 'index.html'), 'utf8');
const css = await readFile(join(ROOT, 'styles/ui.css'), 'utf8');

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const cssClasses = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
const htmlClasses = new Set(
  [...html.matchAll(/\bclass="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(Boolean));

// Ignore the arenas — they never touch the DOM.
const files = walk(join(ROOT, 'src')).filter(f => !f.includes('/arenas/'));

let problems = 0;
const usedIds = new Set();
const usedSelectors = new Set();

for (const f of files) {
  const src = await readFile(f, 'utf8');
  const rel = f.replace(ROOT, '');

  for (const m of src.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) usedIds.add([m[1], rel]);
  for (const m of src.matchAll(/\$\(\s*['"]([^'"]+)['"]\s*\)/g)) usedIds.add([m[1], rel]);
  for (const m of src.matchAll(/querySelector(?:All)?\(\s*['"]([^'"]+)['"]\s*\)/g)) usedSelectors.add([m[1], rel]);
}

console.log(`index.html declares ${htmlIds.size} ids; checking ${files.length} JS files\n`);

for (const [id, rel] of usedIds) {
  if (!htmlIds.has(id)) {
    console.log(`  MISSING ID  #${id}  (used in ${rel})`);
    problems++;
  }
}

for (const [sel, rel] of usedSelectors) {
  // only validate simple .class and #id selectors
  const m = sel.match(/^([.#])([\w-]+)$/);
  if (!m) continue;
  const ok = m[1] === '#' ? htmlIds.has(m[2]) : htmlClasses.has(m[2]);
  if (!ok) {
    console.log(`  MISSING SEL ${sel}  (used in ${rel})`);
    problems++;
  }
}

// Classes the HTML uses that the stylesheet never mentions: usually a typo.
const orphanHtml = [...htmlClasses].filter(c => !cssClasses.has(c));
if (orphanHtml.length) {
  console.log(`\n  ${orphanHtml.length} class(es) in index.html with no CSS rule:`);
  console.log('    ' + orphanHtml.join(', '));
}

// Ids declared but never referenced: dead markup, informational only.
const orphanIds = [...htmlIds].filter(id => ![...usedIds].some(([u]) => u === id));
if (orphanIds.length) {
  console.log(`\n  ${orphanIds.length} id(s) in index.html never used from JS (may be CSS-only):`);
  console.log('    ' + orphanIds.join(', '));
}

console.log(problems ? `\nFAIL — ${problems} broken reference(s)` : '\nPASS — every id and selector resolves');
process.exit(problems ? 1 : 0);
