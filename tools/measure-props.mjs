#!/usr/bin/env node
// Measure every authored prop headlessly so the kit catalogue carries real
// numbers instead of guesses: bounding box, whether the origin sits at the
// base, triangle count and material count.
//
//   node tools/measure-props.mjs            human-readable, flags anomalies
//   node tools/measure-props.mjs --json     the table, for baking into kits.js

import { installDOM } from './dom-stub.mjs';
installDOM();
import * as THREE from 'three';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

THREE.ImageLoader.prototype.load = function (u, cb) { const i = { width: 1, height: 1, src: u }; cb?.(i); return i; };
THREE.TextureLoader.prototype.load = function (u, cb) { const t = new THREE.Texture(); cb?.(t); return t; };
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');

const ROOT = new URL('..', import.meta.url).pathname;
const DIR = join(ROOT, 'assets/models/props');
const loader = new GLTFLoader();

const files = readdirSync(DIR).filter(f => f.endsWith('.glb')).sort();
const out = {};
const flags = [];

for (const f of files) {
  const name = f.replace(/\.glb$/, '');
  const buf = readFileSync(join(DIR, f));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  let scene;
  try {
    scene = await new Promise((res, rej) => loader.parse(ab, DIR + '/', g => res(g.scene), rej));
  } catch (e) {
    flags.push(`${name}: PARSE FAILED ${e.message}`);
    continue;
  }
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  let tris = 0, meshes = 0;
  const mats = new Set();
  scene.traverse(o => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m) mats.add(m.uuid);
  });
  const rec = {
    w: +size.x.toFixed(3), h: +size.y.toFixed(3), d: +size.z.toFixed(3),
    minY: +box.min.y.toFixed(3), tris: Math.round(tris), meshes, mats: mats.size,
  };
  out[name] = rec;

  if (Math.abs(rec.minY) > 0.12) flags.push(`${name}: origin ${rec.minY} off the base`);
  if (rec.h > 6) flags.push(`${name}: ${rec.h} m tall`);
  if (rec.h < 0.05) flags.push(`${name}: ${rec.h} m — degenerate`);
  if (Math.max(rec.w, rec.d) > 8) flags.push(`${name}: ${Math.max(rec.w, rec.d)} m footprint`);
  if (rec.tris > 4000) flags.push(`${name}: ${rec.tris} tris`);
  if (rec.mats > 2) flags.push(`${name}: ${rec.mats} materials`);
}

if (process.argv.includes('--json')) {
  writeFileSync(join(ROOT, 'assets/prop-metrics.json'), JSON.stringify(out));
  console.log(`wrote assets/prop-metrics.json — ${Object.keys(out).length} props`);
} else {
  const all = Object.values(out);
  console.log(`measured ${all.length} props`);
  console.log(`  height  min ${Math.min(...all.map(r => r.h)).toFixed(2)}  max ${Math.max(...all.map(r => r.h)).toFixed(2)}  median ${all.map(r => r.h).sort((a, b) => a - b)[all.length >> 1].toFixed(2)}`);
  console.log(`  tris    total ${all.reduce((s, r) => s + r.tris, 0)}  max ${Math.max(...all.map(r => r.tris))}`);
  console.log(`  multi-material props: ${all.filter(r => r.mats > 1).length}`);
  console.log(`\n${flags.length} anomalies:`);
  for (const f of flags.slice(0, 30)) console.log('  ! ' + f);
}
