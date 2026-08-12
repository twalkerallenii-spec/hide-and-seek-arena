#!/usr/bin/env node
// Copy three.js and only the addons we actually import into vendor/.
//
// The game used to pull three from a CDN via the importmap, which meant the
// whole thing failed to start if that CDN was slow, blocked or having a bad
// day — and it is the single external dependency in an otherwise self-contained
// build. Serving it from our own origin removes that failure mode entirely.
//
// Addons pull in their own relative imports, so this follows the graph rather
// than guessing, and copies the closure.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SRC = join(ROOT, 'node_modules/three');
const OUT = join(ROOT, 'vendor/three');

const ENTRIES = [
  'examples/jsm/environments/RoomEnvironment.js',
  'examples/jsm/loaders/FBXLoader.js',
  'examples/jsm/loaders/GLTFLoader.js',
  'examples/jsm/math/Capsule.js',
  'examples/jsm/math/Octree.js',
  'examples/jsm/postprocessing/EffectComposer.js',
  'examples/jsm/postprocessing/OutputPass.js',
  'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/ShaderPass.js',
  'examples/jsm/postprocessing/SMAAPass.js',
  'examples/jsm/postprocessing/SSAOPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js',
  'examples/jsm/utils/SkeletonUtils.js',
];

const seen = new Set();
let bytes = 0;

function copy(rel) {
  if (seen.has(rel)) return;
  seen.add(rel);
  const from = join(SRC, rel);
  if (!existsSync(from)) { console.warn('  missing', rel); return; }
  let code = readFileSync(from, 'utf8');

  // Rewrite bare 'three' to the vendored build, relative to this file.
  const depth = rel.split('/').length - 1;
  const toBuild = '../'.repeat(depth) + 'build/three.module.js';
  code = code.replace(/from\s+['"]three['"]/g, `from '${toBuild}'`);

  const to = join(OUT, rel);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, code);
  bytes += Buffer.byteLength(code);

  // Follow relative imports so the closure comes with it.
  for (const m of code.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    let dep = resolve(dirname(join(SRC, rel)), m[1]);
    if (!dep.endsWith('.js')) dep += '.js';
    const depRel = relative(SRC, dep).split('\\').join('/');
    if (!depRel.startsWith('..')) copy(depRel);
  }
}

mkdirSync(join(OUT, 'build'), { recursive: true });
const core = readFileSync(join(SRC, 'build/three.module.js'));
writeFileSync(join(OUT, 'build/three.module.js'), core);
bytes += core.length;

for (const e of ENTRIES) copy(e);

console.log(`vendored ${seen.size + 1} files, ${(bytes / 1048576).toFixed(1)} MB -> vendor/three/`);
